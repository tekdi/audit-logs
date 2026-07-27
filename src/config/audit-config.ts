/**
 * AuditConfig — parsed from environment variables.
 * All parsing happens here so the rest of the SDK uses typed values.
 */
export interface PiiMaskRule {
  showFirst?: number;
  showLast?: number;
  showDomain?: boolean;
}

export interface TemplateMapping {
  templateKey: string;
}

export interface DomainMapping {
  table: string;
}

export interface AuditConfig {
  // Core
  enabled: boolean;
  mode: 'hybrid' | 'kafka' | 'api';
  serviceName: string;
  env: string;

  // Kafka
  kafkaBrokers: string[];
  kafkaTopic: string;
  kafkaClientId: string;
  kafkaSslEnabled: boolean;
  kafkaSaslMechanism?: 'plain' | 'scram-sha-256' | 'scram-sha-512';
  kafkaSaslUsername?: string;
  kafkaSaslPassword?: string;
  kafkaProducerTimeoutMs: number;

  // Audit API
  auditApiBaseUrl?: string;
  auditApiKey?: string;
  auditApiEnabled: boolean;
  auditApiTimeoutMs: number;

  // Retry
  retryLimit: number;
  retryDelayMs: number;
  localStorageEnabled: boolean;
  localStorageType: 'memory' | 'file';
  localStoragePath: string;
  localStorageMaxSize: number;

  // Event Filtering
  captureAll: boolean;
  includedEvents: string[];
  excludedEvents: string[];

  // PII
  piiStrategy: 'mask' | 'hash' | 'encrypt' | 'none';
  piiFields: string[];
  piiMaskConfig: Record<string, PiiMaskRule>;
  piiHashAlgorithm: string;
  piiEncryptKey?: string;
  piiEncryptIvLength: number;

  // Localization
  defaultLanguage: string;
  templateMappingJson: Record<string, TemplateMapping>;
  templateFallbackLanguage: string;

  // Partitioning
  partitioningEnabled: boolean;
  materializeEnabled: boolean;
  autoPartitionEnabled: boolean;
  domainMappingJson: Record<string, DomainMapping>;

  // Consumer Config
  consumerEnabled: boolean;
  consumerGroupId: string;

  // Observability
  sdkLogLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  sdkLogFailures: boolean;
  metricsEnabled: boolean;
}

function parseBool(val: string | undefined, defaultVal: boolean): boolean {
  if (val === undefined || val === '') return defaultVal;
  return val.toLowerCase() === 'true' || val === '1';
}

function parseNumber(val: string | undefined, defaultVal: number): number {
  const n = Number(val);
  return isNaN(n) ? defaultVal : n;
}

function parseJson<T>(val: string | undefined, defaultVal: T): T {
  if (!val) return defaultVal;
  try {
    return JSON.parse(val) as T;
  } catch {
    return defaultVal;
  }
}

/**
 * Build an AuditConfig from process.env.
 * Accepts an optional partial override object to allow programmatic overrides.
 */
export function buildConfig(overrides: Partial<AuditConfig> = {}): AuditConfig {
  const env = process.env;

  const serviceName = overrides.serviceName ?? env['AUDIT_SERVICE_NAME'] ?? '';

  if (!serviceName) {
    throw new Error('[audit-logger] AUDIT_SERVICE_NAME is required. Set the env var or pass serviceName in config.');
  }

  const piiEncryptKey = overrides.piiEncryptKey ?? env['AUDIT_PII_ENCRYPT_KEY'];
  const piiStrategy = (overrides.piiStrategy ?? env['AUDIT_PII_STRATEGY'] ?? 'none') as AuditConfig['piiStrategy'];

  if (piiStrategy === 'encrypt' && !piiEncryptKey) {
    throw new Error('[audit-logger] AUDIT_PII_ENCRYPT_KEY is required when AUDIT_PII_STRATEGY=encrypt.');
  }

  if (piiStrategy === 'encrypt' && piiEncryptKey) {
    const keyBytes = Buffer.from(piiEncryptKey, 'base64');
    if (keyBytes.length !== 32) {
      throw new Error('[audit-logger] AUDIT_PII_ENCRYPT_KEY must be 32 bytes (base64-encoded).');
    }
  }

  return {
    // Core
    enabled: overrides.enabled ?? parseBool(env['AUDIT_ENABLED'], true),
    mode: (overrides.mode ?? env['AUDIT_MODE'] ?? 'hybrid') as AuditConfig['mode'],
    serviceName,
    env: overrides.env ?? env['AUDIT_ENV'] ?? 'production',

    // Kafka
    kafkaBrokers: overrides.kafkaBrokers ?? (env['KAFKA_BROKERS'] ? env['KAFKA_BROKERS'].split(',').map(b => b.trim()) : []),
    kafkaTopic: overrides.kafkaTopic ?? env['KAFKA_TOPIC'] ?? 'audit.events',
    kafkaClientId: overrides.kafkaClientId ?? env['KAFKA_CLIENT_ID'] ?? serviceName,
    kafkaSslEnabled: overrides.kafkaSslEnabled ?? parseBool(env['KAFKA_SSL_ENABLED'], false),
    kafkaSaslMechanism: overrides.kafkaSaslMechanism ?? (env['KAFKA_SASL_MECHANISM'] as AuditConfig['kafkaSaslMechanism'] | undefined),
    kafkaSaslUsername: overrides.kafkaSaslUsername ?? env['KAFKA_SASL_USERNAME'],
    kafkaSaslPassword: overrides.kafkaSaslPassword ?? env['KAFKA_SASL_PASSWORD'],
    kafkaProducerTimeoutMs: overrides.kafkaProducerTimeoutMs ?? parseNumber(env['KAFKA_PRODUCER_TIMEOUT_MS'], 5000),

    // Audit API
    auditApiBaseUrl: overrides.auditApiBaseUrl ?? env['AUDIT_API_BASE_URL'],
    auditApiKey: overrides.auditApiKey ?? env['AUDIT_API_KEY'],
    auditApiEnabled: overrides.auditApiEnabled ?? parseBool(env['AUDIT_API_ENABLED'], true),
    auditApiTimeoutMs: overrides.auditApiTimeoutMs ?? parseNumber(env['AUDIT_API_TIMEOUT_MS'], 8000),

    // Retry
    retryLimit: overrides.retryLimit ?? parseNumber(env['AUDIT_SDK_RETRY_LIMIT'], 3),
    retryDelayMs: overrides.retryDelayMs ?? parseNumber(env['AUDIT_SDK_RETRY_DELAY_MS'], 500),
    localStorageEnabled: overrides.localStorageEnabled ?? parseBool(env['AUDIT_LOCAL_STORAGE_ENABLED'], true),
    localStorageType: (overrides.localStorageType ?? env['AUDIT_LOCAL_STORAGE_TYPE'] ?? 'memory') as 'memory' | 'file',
    localStoragePath: overrides.localStoragePath ?? env['AUDIT_LOCAL_STORAGE_PATH'] ?? './.audit-buffer.json',
    localStorageMaxSize: overrides.localStorageMaxSize ?? parseNumber(env['AUDIT_LOCAL_STORAGE_MAX_SIZE'], 1000),

    // Event Filtering
    captureAll: overrides.captureAll ?? parseBool(env['AUDIT_CAPTURE_ALL'], true),
    includedEvents: overrides.includedEvents ?? parseJson<string[]>(env['AUDIT_INCLUDED_EVENTS_JSON'], []),
    excludedEvents: overrides.excludedEvents ?? parseJson<string[]>(env['AUDIT_EXCLUDED_EVENTS_JSON'], []),

    // PII
    piiStrategy,
    piiFields: overrides.piiFields ?? parseJson<string[]>(env['AUDIT_PII_FIELDS_JSON'], []),
    piiMaskConfig: overrides.piiMaskConfig ?? parseJson<Record<string, PiiMaskRule>>(env['AUDIT_PII_MASK_CONFIG_JSON'], {}),
    piiHashAlgorithm: overrides.piiHashAlgorithm ?? env['AUDIT_PII_HASH_ALGORITHM'] ?? 'sha256',
    piiEncryptKey,
    piiEncryptIvLength: overrides.piiEncryptIvLength ?? parseNumber(env['AUDIT_PII_ENCRYPT_IV_LENGTH'], 16),

    // Localization
    defaultLanguage: overrides.defaultLanguage ?? env['AUDIT_DEFAULT_LANGUAGE'] ?? 'en',
    templateMappingJson: overrides.templateMappingJson ?? parseJson<Record<string, TemplateMapping>>(env['AUDIT_TEMPLATE_MAPPING_JSON'], {}),
    templateFallbackLanguage: overrides.templateFallbackLanguage ?? env['AUDIT_TEMPLATE_FALLBACK_LANGUAGE'] ?? 'en',

    // Partitioning
    partitioningEnabled: overrides.partitioningEnabled ?? parseBool(env['AUDIT_PARTITIONING_ENABLED'], true),
    materializeEnabled: overrides.materializeEnabled ?? parseBool(env['AUDIT_MATERIALIZE_ENABLED'], false),
    autoPartitionEnabled: overrides.autoPartitionEnabled ?? parseBool(env['AUDIT_AUTO_PARTITION_ENABLED'], false),
    domainMappingJson: overrides.domainMappingJson ?? parseJson<Record<string, DomainMapping>>(env['AUDIT_DOMAIN_MAPPING_JSON'], {}),

    // Consumer Config
    consumerEnabled: overrides.consumerEnabled ?? parseBool(env['AUDIT_CONSUMER_ENABLED'], false),
    consumerGroupId: overrides.consumerGroupId ?? env['AUDIT_CONSUMER_GROUP_ID'] ?? 'audit-consumer-group',

    // Observability
    sdkLogLevel: (overrides.sdkLogLevel ?? env['AUDIT_SDK_LOG_LEVEL'] ?? 'warn') as AuditConfig['sdkLogLevel'],
    sdkLogFailures: overrides.sdkLogFailures ?? parseBool(env['AUDIT_SDK_LOG_FAILURES'], true),
    metricsEnabled: overrides.metricsEnabled ?? parseBool(env['AUDIT_METRICS_ENABLED'], false),
  };
}
