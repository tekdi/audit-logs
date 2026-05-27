import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog, MessageTemplate } from '@tekdi/audit-logger';
import { AuditService } from './audit/audit.service';
import { AuditController } from './audit/audit.controller';
import { TemplatesService } from './templates/templates.service';
import { TemplatesController } from './templates/templates.controller';
import { APP_GUARD } from '@nestjs/core';
import { ApiKeyGuard } from './common/guards/api-key.guard';
import { KafkaConsumerService } from './audit/kafka-consumer.service';
import { KafkaProducerService } from './audit/kafka-producer.service';

@Module({
  imports: [
    ConfigModule.forRoot({ 
      isGlobal: true,
      envFilePath: 'apps/audit-api/.env'
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DB_NAME', 'audit_service_db'),
        ssl: config.get<string>('DB_SSL') === 'true' ? { rejectUnauthorized: false } : false,
        entities: [AuditLog, MessageTemplate],
        synchronize: false, // Using custom initializeAuditSchema for partitions
        logging: true,
      }),
    }),
    TypeOrmModule.forFeature([AuditLog, MessageTemplate]),
  ],
  controllers: [AuditController, TemplatesController],
  providers: [
    AuditService,
    TemplatesService,
    KafkaConsumerService,
    KafkaProducerService,
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
