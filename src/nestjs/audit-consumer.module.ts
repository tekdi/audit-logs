import { Module, DynamicModule, OnModuleInit, OnModuleDestroy, Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AuditConsumer } from '../consumer/audit-consumer';
import { AuditConfig } from '../config/audit-config';

export interface AuditConsumerModuleOptions {
  dataSource: DataSource;
  config?: AuditConfig;
  groupId?: string;
}

const AUDIT_CONSUMER_OPTIONS = 'AUDIT_CONSUMER_OPTIONS';

@Injectable()
export class AuditConsumerRunner implements OnModuleInit, OnModuleDestroy {
  private consumer: AuditConsumer;

  constructor(@Inject(AUDIT_CONSUMER_OPTIONS) private readonly opts: AuditConsumerModuleOptions) {
    this.consumer = new AuditConsumer({
      dataSource: opts.dataSource,
      config: opts.config,
      groupId: opts.groupId,
    });
  }

  async onModuleInit(): Promise<void> {
    await this.consumer.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.consumer.stop();
  }
}

@Module({})
export class AuditConsumerModule {
  /**
   * Register AuditConsumerModule to consume Kafka audit events directly into PostgreSQL.
   */
  static forRoot(options: AuditConsumerModuleOptions): DynamicModule {
    return {
      module: AuditConsumerModule,
      providers: [
        {
          provide: AUDIT_CONSUMER_OPTIONS,
          useValue: options,
        },
        AuditConsumerRunner,
      ],
      exports: [AuditConsumerRunner],
    };
  }
}
