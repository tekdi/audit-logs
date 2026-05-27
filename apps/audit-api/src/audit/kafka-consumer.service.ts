import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Consumer } from 'kafkajs';
import { AuditService } from './audit.service';

@Injectable()
export class KafkaConsumerService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private consumer: Consumer;
  private readonly logger = new Logger(KafkaConsumerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {
    const brokers = this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092').split(',');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'audit-api-consumer');

    this.kafka = new Kafka({
      clientId,
      brokers,
    });

    this.consumer = this.kafka.consumer({ groupId: 'audit-consumer-group' });
  }

  async onModuleInit() {
    // Only start if explicitly enabled in env
    const enabled = this.configService.get<string>('AUDIT_ENABLED') === 'true';
    if (!enabled) {
      this.logger.warn('Audit service is disabled. Kafka consumer will not start.');
      return;
    }

    try {
      await this.consumer.connect();
      const topic = this.configService.get<string>('KAFKA_TOPIC', 'audit.events');
      
      await this.consumer.subscribe({ topic, fromBeginning: true });

      await this.consumer.run({
        eachMessage: async ({ message }) => {
          try {
            const rawValue = message.value?.toString();
            if (!rawValue) return;

            const event = JSON.parse(rawValue);
            this.logger.log(`Received audit event from Kafka: ${event.eventAction} (${event.serviceName})`);
            
            await this.auditService.log(event, false);
          } catch (err) {
            this.logger.error(`Error processing Kafka message: ${(err as Error).message}`);
          }
        },
      });

      this.logger.log(`Kafka consumer connected and subscribed to topic: ${topic}`);
    } catch (err) {
      this.logger.error(`Failed to connect Kafka consumer: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy() {
    try {
      await this.consumer.disconnect();
      this.logger.log('Kafka consumer disconnected');
    } catch (err) {
      this.logger.error(`Error disconnecting Kafka consumer: ${(err as Error).message}`);
    }
  }
}
