import { DataSource } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { MessageTemplate } from '../entities/message-template.entity';
import { EnrichedAuditEvent } from '../types/audit-event';
import { AuditConfig, buildConfig } from '../config/audit-config';
import { resolveFromTemplate, interpolate } from '../templates/template-resolver';
import { sdkLog } from '../utils/sdk-utils';

let kafkajsModule: typeof import('kafkajs') | null = null;
async function getKafkaJS() {
  if (!kafkajsModule) {
    try {
      kafkajsModule = await import('kafkajs');
    } catch {
      throw new Error('[audit-logger] kafkajs is not installed. Run: npm install kafkajs');
    }
  }
  return kafkajsModule;
}

export interface AuditConsumerOptions {
  config?: AuditConfig;
  dataSource: DataSource;
  groupId?: string;
}

export class AuditConsumer {
  private consumer: import('kafkajs').Consumer | null = null;
  private readonly config: AuditConfig;
  private readonly dataSource: DataSource;
  private readonly groupId: string;

  constructor(options: AuditConsumerOptions) {
    this.config = options.config ?? buildConfig();
    this.dataSource = options.dataSource;
    this.groupId = options.groupId ?? envString('AUDIT_CONSUMER_GROUP_ID', 'audit-consumer-group');
  }

  /** Helper to get repository, automatically registering entity metadata if host DataSource lacks it */
  private getRepository<T extends object>(entity: new () => T) {
    try {
      return this.dataSource.getRepository(entity);
    } catch {
      const ds = this.dataSource as any;
      let metadata = ds.entityMetadatas?.find((m: any) => m.target === entity);
      
      if (!metadata) {
        // Build metadata dynamically using TypeORM internal EntityMetadataBuilder
        try {
          const { EntityMetadataBuilder } = require('typeorm/metadata-builder/EntityMetadataBuilder');
          const { getMetadataArgsStorage } = require('typeorm');
          const builder = new EntityMetadataBuilder(this.dataSource, getMetadataArgsStorage());
          const metadatas = builder.build([entity]);
          if (metadatas && metadatas.length > 0) {
            metadata = metadatas[0];
            ds.entityMetadatas.push(metadata);
            if (ds.entityMetadatasMap instanceof Map) {
              ds.entityMetadatasMap.set(entity, metadata);
            }
          }
        } catch (e) {
          sdkLog(this.config, 'error', `Failed to build metadata for ${entity.name}: ${String(e)}`);
        }
      }
      return this.dataSource.getRepository(entity);
    }
  }

  /**
   * Sync template definitions from config/env into the DB message_templates table.
   * Ensures templates defined in local config exist in the shared DB.
   */
  async syncTemplatesFromConfig(): Promise<void> {
    if (!this.dataSource.isInitialized) return;
    const templateRepo = this.getRepository(MessageTemplate);

    // Sync from config or file
    let templatesRaw = process.env.AUDIT_TEMPLATES_JSON;
    const filePath = process.env.AUDIT_TEMPLATES_FILE;

    if (!templatesRaw && filePath) {
      try {
        const fullPath = require('path').resolve(filePath);
        if (require('fs').existsSync(fullPath)) {
          templatesRaw = require('fs').readFileSync(fullPath, 'utf8');
        }
      } catch (err) {
        sdkLog(this.config, 'warn', `Failed to read AUDIT_TEMPLATES_FILE at ${filePath}: ${String(err)}`);
      }
    }

    if (templatesRaw) {
      try {
        const templates: Array<{
          serviceName: string;
          entityType: string;
          eventType?: string;
          eventAction?: string;
          languageCode?: string;
          template: string;
        }> = JSON.parse(templatesRaw);

        for (const t of templates) {
          const existing = await templateRepo.findOne({
            where: {
              serviceName: t.serviceName.toLowerCase(),
              entityType: t.entityType.toUpperCase(),
              eventAction: t.eventAction?.toUpperCase(),
              languageCode: t.languageCode ?? 'en',
              isActive: true,
            },
          });

          if (!existing) {
            await templateRepo.save({
              serviceName: t.serviceName.toLowerCase(),
              entityType: t.entityType.toUpperCase(),
              eventType: t.eventType ?? 'GENERAL',
              eventAction: t.eventAction?.toUpperCase(),
              languageCode: t.languageCode ?? 'en',
              template: t.template,
              isActive: true,
            });
            sdkLog(this.config, 'info', `Synced template for ${t.serviceName}.${t.eventAction} into DB`);
          }
        }
      } catch (err) {
        sdkLog(this.config, 'warn', `Failed to parse or sync templates: ${String(err)}`);
      }
    }
  }

  /**
   * Start the Kafka consumer listener loop.
   */
  async start(): Promise<void> {
    const { Kafka } = await getKafkaJS();

    if (this.config.kafkaBrokers.length === 0) {
      throw new Error('[audit-logger] No Kafka brokers configured for AuditConsumer.');
    }

    const kafka = new Kafka({
      clientId: `${this.config.serviceName}-consumer`,
      brokers: this.config.kafkaBrokers,
      ...(this.config.kafkaSslEnabled ? { ssl: true } : {}),
      ...(this.config.kafkaSaslMechanism
        ? {
            sasl: {
              mechanism: this.config.kafkaSaslMechanism as 'plain',
              username: this.config.kafkaSaslUsername!,
              password: this.config.kafkaSaslPassword!,
            },
          }
        : {}),
    });

    this.consumer = kafka.consumer({ groupId: this.groupId });
    await this.consumer.connect();
    await this.consumer.subscribe({ topic: this.config.kafkaTopic, fromBeginning: false });

    // Pre-sync template mappings
    await this.syncTemplatesFromConfig();

    const auditRepo = this.getRepository(AuditLog);
    const templateRepo = this.getRepository(MessageTemplate);

    await this.consumer.run({
      eachMessage: async ({ message }) => {
        try {
          const raw = message.value?.toString();
          if (!raw) return;

          const event: any = JSON.parse(raw);

          // 1. Resolve Service Name
          const svc = (
            event.serviceName ||
            this.config.serviceName ||
            process.env.AUDIT_SERVICE_NAME ||
            'unknown'
          ).toLowerCase();

          // 2. Resolve Event Action & Type
          const rawEventType = event.eventType || event.eventAction || 'GENERAL';
          const action = (event.eventAction || rawEventType).toUpperCase();

          // Infer Entity Type if not explicitly provided (e.g., USER_CREATED -> USER, COURSE_COMPLETED -> COURSE)
          let entityType = (event.entityType || '').toUpperCase();
          if (!entityType && action.includes('_')) {
            entityType = action.split('_')[0];
          }

          const lang = event.languageCode || this.config.defaultLanguage || 'en';

          // 3. Resolve Entity ID dynamically across services
          const entityId =
            event.entityId ||
            event.userId ||
            event.courseId ||
            event.contentId ||
            event.cohortId ||
            event.cohortMembershipId ||
            event.cohortAcademicYearId ||
            event.data?.id ||
            event.data?.userId ||
            event.data?.courseId ||
            null;

          // 4. Resolve Actor ID (Created By / Performed By)
          const actorId =
            event.actorId ||
            event.createdBy ||
            event.data?.createdBy ||
            event.data?.updatedBy ||
            null;

          // 5. Resolve Metadata Payload
          const metadata = event.metadata || event.data || null;

          // 6. Template Resolution
          let humanMessage = event.humanMessage;
          let templateId: string | undefined;

          if (!humanMessage || humanMessage.startsWith('[TEMPLATE:')) {
            const tmpl = await templateRepo.findOne({
              where: {
                serviceName: svc,
                entityType: entityType,
                eventAction: action,
                languageCode: lang,
                isActive: true,
              },
            });

            if (tmpl) {
              humanMessage = resolveFromTemplate(tmpl.template, event);
              templateId = tmpl.id;
            } else if (humanMessage?.startsWith('[TEMPLATE:')) {
              humanMessage = interpolate(
                `[${svc.toUpperCase()}] ${entityType} ${action} performed.`,
                event
              );
            }
          }

          // 7. Save to audit_logs Table
          const logEntry = auditRepo.create({
            serviceName: svc,
            entityType: entityType,
            eventType: rawEventType,
            eventAction: action,
            templateId: templateId,
            entityId: entityId,
            actorId: actorId,
            userRole: event.userRole || event.data?.userRole || null,
            devicePlatform: event.context?.platform || null,
            context: event.context || null,
            ipAddress: event.context?.ipAddress || null,
            metadata: metadata,
            humanMessage: humanMessage || null,
            status: event.status || 'SUCCESS',
            createdAt: event.occurredAt
              ? new Date(event.occurredAt)
              : event.timestamp
              ? new Date(event.timestamp)
              : new Date(),
          });

          await auditRepo.save(logEntry);
          sdkLog(this.config, 'debug', `[AuditConsumer] Persisted audit log for ${svc}.${action}`);
        } catch (err) {
          sdkLog(this.config, 'error', `[AuditConsumer] Error processing message: ${String(err)}`);
        }
      },
    });

    sdkLog(this.config, 'info', `AuditConsumer running on topic ${this.config.kafkaTopic} (group: ${this.groupId})`);
  }

  async stop(): Promise<void> {
    if (this.consumer) {
      await this.consumer.disconnect();
      this.consumer = null;
      sdkLog(this.config, 'info', 'AuditConsumer stopped.');
    }
  }
}

function envString(key: string, defaultVal: string): string {
  return process.env[key] || defaultVal;
}
