import { Module, DynamicModule, Global, Injectable, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditLoggerService } from './audit-logger.service';
import { AuditLoggerOptions } from '../audit-logger';
import { AuditConsumer } from '../consumer/audit-consumer';
import { buildConfig, AuditConfig } from '../config/audit-config';
import { initializeAuditSchema } from '../database/schema-init';

@Injectable()
export class AutoConsumerService implements OnModuleInit, OnModuleDestroy {
  private consumer: AuditConsumer | null = null;
  private config: AuditConfig;

  constructor(
    @Optional() @Inject(DataSource) private readonly dataSource?: DataSource,
  ) {
    this.config = buildConfig();
  }

  async onModuleInit(): Promise<void> {
    if (this.config.consumerEnabled) {
      if (!this.dataSource) {
        console.warn(
          '[audit-logger] AUDIT_CONSUMER_ENABLED=true but TypeORM DataSource was not found in NestJS context. Consumer will not start.',
        );
        return;
      }
      try {
        await initializeAuditSchema(this.dataSource);
      } catch (err) {
        console.warn(`[audit-logger] Note on schema init: ${String(err)}`);
      }

      this.consumer = new AuditConsumer({
        config: this.config,
        dataSource: this.dataSource,
        groupId: this.config.consumerGroupId,
      });

      await this.consumer.start();
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.consumer) {
      await this.consumer.stop();
    }
  }
}

@Global()
@Module({})
export class AuditLoggerModule {
  /**
   * Register the AuditLoggerModule globally.
   * If AUDIT_CONSUMER_ENABLED=true in .env and a TypeORM DataSource is present,
   * the consumer starts automatically without any extra code!
   */
  static forRoot(options: AuditLoggerOptions = {}): DynamicModule {
    return {
      module: AuditLoggerModule,
      providers: [
        {
          provide: AuditLoggerService,
          useValue: new AuditLoggerService(options),
        },
        AutoConsumerService,
      ],
      exports: [AuditLoggerService],
    };
  }
}
