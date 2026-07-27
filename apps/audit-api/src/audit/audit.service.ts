import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AuditLog, EnrichedAuditEvent, initializeAuditSchema } from '@tekdi/audit-logger';
import { TemplatesService } from '../templates/templates.service';
import { ConfigService } from '@nestjs/config';
import { KafkaProducerService } from './kafka-producer.service';

@Injectable()
export class AuditService implements OnModuleInit {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    private readonly templatesService: TemplatesService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  async onModuleInit() {
    const partitioningEnabled = this.configService.get<string>('AUDIT_PARTITIONING_ENABLED') === 'true';
    if (partitioningEnabled) {
      this.logger.log('Initializing partitioned database schema...');
      try {
        await initializeAuditSchema(this.dataSource);
        this.logger.log('Partitioned schema ready.');
      } catch (error: any) {
        this.logger.error('Failed to initialize audit schema partitions', error?.stack || error);
        throw error;
      }
    }
  }

  /**
   * Log an enriched audit event.
   * 1. Resolves human-readable message from DB template.
   * 2. Inserts into the partitioned audit_logs table.
   * @param event The audit event data
   * @param produceToKafka Whether to send this log to Kafka (default: true)
   */
  async log(event: EnrichedAuditEvent, produceToKafka: boolean = true) {
    const fallbackLang = this.configService.get<string>('AUDIT_TEMPLATE_FALLBACK_LANGUAGE', 'en');

    // 1. Resolve Template
    const template = await this.templatesService.findTemplate({
      serviceName: event.serviceName,
      entityType: event.entityType,
      eventAction: event.eventAction,
      languageCode: event.languageCode || 'en',
      fallbackLanguage: fallbackLang,
    });

    let humanMessage = event.humanMessage || '';
    let templateId: string | undefined;

    if (template) {
      humanMessage = this.templatesService.interpolate(template.template, event);
      templateId = template.id;
    }

    // 2. Prepare Log Record
    const logRecord = this.auditRepo.create({
      id: undefined, // Let DB generate UUID
      serviceName: event.serviceName,
      entityType: event.entityType,
      eventType: event.eventType,
      eventAction: event.eventAction,
      templateId,
      entityId: event.entityId,
      actorId: event.actorId,
      userRole: event.userRole,
      devicePlatform: event.context?.platform,
      context: event.context,
      ipAddress: event.context?.ipAddress,
      metadata: event.metadata,
      humanMessage,
      status: event.status || 'SUCCESS',
      createdAt: event.occurredAt ? new Date(event.occurredAt) : new Date(),
    });

    // 3. Produce to Kafka if enabled (Broker-based architecture)
    const mode = this.configService.get<string>('AUDIT_MODE', 'api');
    if (produceToKafka && (mode === 'kafka' || mode === 'hybrid')) {
      const topic = this.configService.get<string>('KAFKA_TOPIC', 'audit.events');
      await this.kafkaProducer.send(topic, logRecord);
      
      // In 'kafka' and 'hybrid' mode, the consumer will handle the database write.
      return logRecord;
    }

    // 4. Save directly if in 'api' or 'hybrid' mode (Hybrid saves twice? No, consumer might handle it differently)
    // To avoid duplicates in hybrid mode, we can either:
    // a) Let consumer handle it (preferred for async)
    // b) Save here and ignore in consumer
    // For this test, we'll save here so Postman gets an immediate response, 
    // and Kafka gets a message for the user to see.
    return this.auditRepo.save(logRecord);
  }

  /**
   * List logs with filters as documented in §13.
   */
  async findAll(query: any) {
    const qb = this.auditRepo.createQueryBuilder('log');

    if (query.service_name) qb.andWhere('log.service_name = :svc', { svc: query.service_name });
    if (query.entity_type) qb.andWhere('log.entity_type = :entity', { entity: query.entity_type });
    if (query.status) qb.andWhere('log.status = :status', { status: query.status });
    if (query.start_date) qb.andWhere('log.created_at >= :start', { start: query.start_date });
    if (query.end_date) qb.andWhere('log.created_at <= :end', { end: query.end_date });

    if (query.search) {
      qb.andWhere('(log.human_message ILIKE :search OR log.event_action ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    const page = parseInt(query.page) || 1;
    const limit = Math.min(parseInt(query.limit) || 10, 100);

    qb.skip((page - 1) * limit).take(limit);
    qb.orderBy('log.createdAt', query.order === 'asc' ? 'ASC' : 'DESC');

    // Optimization: Exclude heavy JSONB columns (context, metadata) from list
    qb.select([
      'log.id', 'log.serviceName', 'log.entityType', 'log.eventType',
      'log.eventAction', 'log.entityId', 'log.actorId', 'log.humanMessage',
      'log.status', 'log.createdAt'
    ]);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
