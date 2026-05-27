import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer } from 'kafkajs';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private kafka: Kafka;
  private producer: Producer;
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(private readonly configService: ConfigService) {
    const brokers = this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092').split(',');
    const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'audit-api-producer');

    this.kafka = new Kafka({
      clientId,
      brokers,
    });

    this.producer = this.kafka.producer({
      transactionTimeout: 30000,
    });
  }

  async onModuleInit() {
    try {
      await this.producer.connect();
      this.logger.log('Kafka producer connected successfully');
    } catch (err) {
      this.logger.error(`Failed to connect Kafka producer: ${(err as Error).message}`);
    }
  }

  async send(topic: string, message: any) {
    try {
      await this.producer.send({
        topic,
        messages: [
          {
            key: message.entityId || message.serviceName,
            value: JSON.stringify(message),
          },
        ],
      });
      this.logger.log(`Message sent to topic ${topic}: ${message.eventAction}`);
    } catch (err) {
      this.logger.error(`Failed to send message to Kafka: ${(err as Error).message}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    try {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    } catch (err) {
      this.logger.error(`Error disconnecting Kafka producer: ${(err as Error).message}`);
    }
  }
}
