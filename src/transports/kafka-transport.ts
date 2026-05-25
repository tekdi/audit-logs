import { AuditConfig } from '../config/audit-config';
import { EnrichedAuditEvent } from '../types/audit-event';
import { sdkLog, withRetry } from '../utils/sdk-utils';

// Lazy-load kafkajs so non-Kafka users don't get an import error
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

export class KafkaTransport {
  private producer: import('kafkajs').Producer | null = null;
  private connected = false;

  constructor(private readonly config: AuditConfig) {}

  private async getProducer(): Promise<import('kafkajs').Producer> {
    const { Kafka } = await getKafkaJS();

    if (this.producer && this.connected) return this.producer;

    const kafkaConfig: import('kafkajs').KafkaConfig = {
      clientId: this.config.kafkaClientId,
      brokers: this.config.kafkaBrokers,
      requestTimeout: this.config.kafkaProducerTimeoutMs, // Fixed: Use requestTimeout instead of transactionTimeout
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
    };

    const kafka = new Kafka(kafkaConfig);
    this.producer = kafka.producer(); // Removed incorrect transactionTimeout
    await this.producer.connect();
    this.connected = true;
    sdkLog(this.config, 'info', `Kafka producer connected to ${this.config.kafkaBrokers.join(', ')}`);
    return this.producer;
  }

  /**
   * Send an enriched event to the Kafka topic.
   * Throws on failure so the caller can fall back to the next transport.
   */
  async send(event: EnrichedAuditEvent): Promise<void> {
    if (this.config.kafkaBrokers.length === 0) {
      throw new Error('[audit-logger] No Kafka brokers configured (KAFKA_BROKERS is empty).');
    }

    await withRetry(
      async () => {
        const prod = await this.getProducer();
        await prod.send({
          topic: this.config.kafkaTopic,
          messages: [
            {
              key: event.entityId ?? event.serviceName,
              value: JSON.stringify(event),
            },
          ],
        });
      },
      this.config.retryLimit,
      this.config.retryDelayMs,
      'KafkaTransport',
      this.config,
    );
  }

  /** Disconnect the Kafka producer. */
  async disconnect(): Promise<void> {
    if (this.producer && this.connected) {
      await this.producer.disconnect();
      this.producer = null;
      this.connected = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Legacy/Global support (to be removed once all consumers migrate to the class)
// ---------------------------------------------------------------------------

let defaultTransport: KafkaTransport | null = null;

function getDefaultTransport(config: AuditConfig): KafkaTransport {
  if (!defaultTransport) {
    defaultTransport = new KafkaTransport(config);
  }
  return defaultTransport;
}

/** @deprecated Use KafkaTransport class instance */
export async function sendToKafka(event: EnrichedAuditEvent, config: AuditConfig): Promise<void> {
  return getDefaultTransport(config).send(event);
}

/** @deprecated Use KafkaTransport class instance */
export async function disconnectKafka(): Promise<void> {
  if (defaultTransport) {
    await defaultTransport.disconnect();
    defaultTransport = null;
  }
}
