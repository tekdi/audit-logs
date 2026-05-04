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

// Cache a single producer instance per config (re-connected on failure)
let producer: import('kafkajs').Producer | null = null;
let connected = false;

async function getProducer(config: AuditConfig): Promise<import('kafkajs').Producer> {
  const { Kafka } = await getKafkaJS();

  if (producer && connected) return producer;

  const kafkaConfig: import('kafkajs').KafkaConfig = {
    clientId: config.kafkaClientId,
    brokers: config.kafkaBrokers,
    ...(config.kafkaSslEnabled ? { ssl: true } : {}),
    ...(config.kafkaSaslMechanism
      ? {
          sasl: {
            mechanism: config.kafkaSaslMechanism as 'plain',
            username: config.kafkaSaslUsername!,
            password: config.kafkaSaslPassword!,
          },
        }
      : {}),
  };

  const kafka = new Kafka(kafkaConfig);
  producer = kafka.producer({ transactionTimeout: config.kafkaProducerTimeoutMs });
  await producer.connect();
  connected = true;
  sdkLog(config, 'info', `Kafka producer connected to ${config.kafkaBrokers.join(', ')}`);
  return producer;
}

/**
 * Send an enriched event to the Kafka topic.
 * Throws on failure so the caller can fall back to the next transport.
 */
export async function sendToKafka(event: EnrichedAuditEvent, config: AuditConfig): Promise<void> {
  if (config.kafkaBrokers.length === 0) {
    throw new Error('[audit-logger] No Kafka brokers configured (KAFKA_BROKERS is empty).');
  }

  await withRetry(
    async () => {
      const prod = await getProducer(config);
      await prod.send({
        topic: config.kafkaTopic,
        messages: [
          {
            key: event.entityId ?? event.serviceName,
            value: JSON.stringify(event),
          },
        ],
      });
    },
    config.retryLimit,
    config.retryDelayMs,
    'KafkaTransport',
    config,
  );
}

/** Disconnect the cached Kafka producer (call on app shutdown). */
export async function disconnectKafka(): Promise<void> {
  if (producer && connected) {
    await producer.disconnect();
    producer = null;
    connected = false;
  }
}
