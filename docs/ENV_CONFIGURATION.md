# Environment Configuration Reference

This document describes every environment variable used across both components of the `audit-logs` monorepo.

> **Quick Rule:**
> - **SDK variables** → go into the `.env` of **each producer microservice** (user-service, lms-service, etc.)
> - **Audit API variables** → go into `apps/audit-api/.env` only

---

## 🔵 SDK — Producer Microservice Variables

These variables are read by the `AuditLogger` / `AuditLoggerModule` installed in each producer service.
Copy `sdk.env.example` from the repo root into your microservice and rename to `.env`.

---

### Core

| Variable | Required | Default | Description |
|---|:---:|---|---|
| `AUDIT_SERVICE_NAME` | ✅ | — | Unique identifier for this service (e.g. `user-service`). Becomes the DB partition key. |
| `AUDIT_ENABLED` | | `true` | Master switch. Set `false` to silently disable all audit emission. |
| `AUDIT_MODE` | | `hybrid` | Transport: `kafka` · `api` · `hybrid` (Kafka → REST fallback → local buffer). |
| `AUDIT_ENV` | | `production` | Environment label attached to emitted events. |

---

### Kafka (Producer)

> Required when `AUDIT_MODE=kafka` or `AUDIT_MODE=hybrid`.

| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated broker addresses. |
| `KAFKA_TOPIC` | `audit.events` | Topic the SDK publishes events to. Must match Audit API consumer. |
| `KAFKA_CLIENT_ID` | *(AUDIT_SERVICE_NAME)* | Kafka client identifier for this producer. |
| `KAFKA_SSL_ENABLED` | `false` | Enable SSL/TLS for broker connections. |
| `KAFKA_SASL_MECHANISM` | — | `plain` · `scram-sha-256` · `scram-sha-512` |
| `KAFKA_SASL_USERNAME` | — | SASL username (when mechanism is set). |
| `KAFKA_SASL_PASSWORD` | — | SASL password (when mechanism is set). |
| `KAFKA_PRODUCER_TIMEOUT_MS` | `5000` | Max ms to wait for broker acknowledgment. |

---

### Audit API Fallback (REST)

> Required when `AUDIT_MODE=api` or `AUDIT_MODE=hybrid`.
> `AUDIT_API_KEY` must match the value set in the Audit API's `.env`.

| Variable | Default | Description |
|---|---|---|
| `AUDIT_API_BASE_URL` | `http://localhost:3001/api/v1` | Base URL of the running Audit API service. |
| `AUDIT_API_KEY` | — | Shared secret sent as `x-api-key` header. Must match Audit API. |
| `AUDIT_API_ENABLED` | `true` | Enable the REST fallback transport. |
| `AUDIT_API_TIMEOUT_MS` | `8000` | REST call timeout in ms. |

---

### Local Buffer (Safety Net)

> Activated when all transports (Kafka + REST) fail.

| Variable | Default | Description |
|---|---|---|
| `AUDIT_LOCAL_STORAGE_ENABLED` | `true` | Buffer failed events locally for later retry. |
| `AUDIT_LOCAL_STORAGE_TYPE` | `memory` | `memory` or `file`. |
| `AUDIT_LOCAL_STORAGE_PATH` | `./.audit-buffer.json` | File path for disk-based buffer. |
| `AUDIT_LOCAL_STORAGE_MAX_SIZE` | `1000` | Max events held in buffer before oldest are dropped. |
| `AUDIT_SDK_RETRY_LIMIT` | `3` | Retry attempts before buffering an event. |
| `AUDIT_SDK_RETRY_DELAY_MS` | `500` | Delay (ms) between retry attempts. |

---

### Event Filtering

| Variable | Default | Description |
|---|---|---|
| `AUDIT_CAPTURE_ALL` | `true` | Capture all events. Set `false` to use an allowlist. |
| `AUDIT_INCLUDED_EVENTS_JSON` | `[]` | Allowlist. Format: `["service.ENTITY.ACTION"]` |
| `AUDIT_EXCLUDED_EVENTS_JSON` | `[]` | Denylist (always applied). Format: `["service.SYSTEM.HEALTH_CHECK"]` |

---

### PII Protection

| Variable | Default | Description |
|---|---|---|
| `AUDIT_PII_STRATEGY` | `none` | `mask` · `hash` · `encrypt` · `none` |
| `AUDIT_PII_FIELDS_JSON` | `[]` | Dot-path fields to protect. e.g. `["metadata.email","metadata.phone"]` |
| `AUDIT_PII_MASK_CONFIG_JSON` | `{}` | Per-field mask rules. e.g. `{"email":{"showFirst":2,"showDomain":true}}` |
| `AUDIT_PII_HASH_ALGORITHM` | `sha256` | Hash algorithm (when strategy is `hash`). |
| `AUDIT_PII_ENCRYPT_KEY` | — | 32-byte base64 key. **Required** when strategy is `encrypt`. |
| `AUDIT_PII_ENCRYPT_IV_LENGTH` | `16` | AES IV length in bytes. |

---

### Localization & Templates

| Variable | Default | Description |
|---|---|---|
| `AUDIT_DEFAULT_LANGUAGE` | `en` | Language code for human-readable messages. |
| `AUDIT_TEMPLATE_FALLBACK_LANGUAGE` | `en` | Used when a template for the requested language isn't found. |
| `AUDIT_TEMPLATE_MAPPING_JSON` | `{}` | Maps event keys → template keys. e.g. `{"user-service.USER.USER_CREATED":{"templateKey":"USER_CREATED"}}` |

---

### Standalone Consumer & Persistence

> Activated when `AUDIT_CONSUMER_ENABLED=true` in a microservice.

| Variable | Default | Description |
|---|---|---|
| `AUDIT_CONSUMER_ENABLED` | `false` | Set `true` to enable background Kafka consumer persistence in this service. |
| `AUDIT_CONSUMER_GROUP_ID` | `audit-consumer-group` | Kafka consumer group ID. |
| `AUDIT_TEMPLATES_FILE` | — | Path to a local `.json` file containing template definitions. |
| `AUDIT_TEMPLATES_JSON` | — | Inline JSON array of template objects to sync into DB on consumer startup. |

---

### Observability

| Variable | Default | Description |
|---|---|---|
| `AUDIT_SDK_LOG_LEVEL` | `warn` | `debug` · `info` · `warn` · `error` · `silent` |
| `AUDIT_SDK_LOG_FAILURES` | `true` | Print transport errors to console. |
| `AUDIT_METRICS_ENABLED` | `false` | Enable internal SDK metrics collection. |

---

---

## 🟢 Audit API — Consumer Service Variables

These variables configure `apps/audit-api`. They are **not read by the SDK** in producer services.
The Audit API has its own `.env` at `apps/audit-api/.env`.

---

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | HTTP port the Audit API listens on. |
| `NODE_ENV` | `development` | `development` enables TypeORM auto-sync; `production` disables it. |

---

### Database

> Only the Audit API connects to PostgreSQL. Producer services **never** use these.

| Variable | Default | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL server host. |
| `DB_PORT` | `5432` | PostgreSQL server port. |
| `DB_USER` | `postgres` | Database user. |
| `DB_PASSWORD` | `postgres` | Database password. |
| `DB_NAME` | `audit_service_db` | Target database name. |
| `DB_SSL` | `false` | Set `true` to enforce TLS for DB connections. |

---

### Kafka (Consumer)

> The Audit API consumes from the same topic that producer SDKs produce to.
> `KAFKA_BROKERS` and `KAFKA_TOPIC` **must match** the producer services.

| Variable | Default | Description |
|---|---|---|
| `AUDIT_ENABLED` | `true` | If `false`, the Kafka consumer will not start. |
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated broker addresses. |
| `KAFKA_TOPIC` | `audit.events` | Topic to subscribe to. Must match SDK `KAFKA_TOPIC`. |
| `KAFKA_CLIENT_ID` | `audit-api-service` | Kafka client identifier for the consumer. |
| `KAFKA_SSL_ENABLED` | `false` | Enable SSL for broker connections. |

---

### API Authentication

> `AUDIT_API_KEY` here is used by `ApiKeyGuard` to **validate incoming requests**.
> It must be the same value as `AUDIT_API_KEY` in every producer service.

| Variable | Default | Description |
|---|---|---|
| `AUDIT_API_KEY` | — | Shared secret. Validated from the `x-api-key` request header. |

---

### Partition Routing

> Controls how the Audit API writes to PostgreSQL partitioned tables.

| Variable | Default | Description |
|---|---|---|
| `AUDIT_PARTITIONING_ENABLED` | `true` | Route inserts into service-specific child table partitions. |
| `AUDIT_AUTO_PARTITION_ENABLED` | `false` | Auto-create missing partitions at runtime. |
| `AUDIT_MATERIALIZE_ENABLED` | `false` | Build materialized views for dashboard reporting. |
| `AUDIT_DOMAIN_MAPPING_JSON` | `{}` | Maps service name → partition table. e.g. `{"user-service":{"table":"audit_logs_user_service"}}` |

---

### Templates & Localization

| Variable | Default | Description |
|---|---|---|
| `AUDIT_DEFAULT_LANGUAGE` | `en` | Language for resolving `humanMessage` from DB templates. |
| `AUDIT_TEMPLATE_FALLBACK_LANGUAGE` | `en` | Fallback language if requested language template not found. |

---

---

## Side-by-Side Quick Reference

| Variable | SDK (Producer) | Audit API (Consumer) | Notes |
|---|:---:|:---:|---|
| `AUDIT_SERVICE_NAME` | ✅ Required | ✅ Set to `audit-api-service` | Different value each side |
| `AUDIT_ENABLED` | ✅ | ✅ | Controls emit vs consume |
| `AUDIT_MODE` | ✅ | ❌ | SDK only |
| `KAFKA_BROKERS` | ✅ Producer | ✅ Consumer | Must be the same brokers |
| `KAFKA_TOPIC` | ✅ Produce to | ✅ Consume from | Must be the same topic |
| `AUDIT_API_KEY` | ✅ Sent as header | ✅ Validated from header | **Must match exactly** |
| `AUDIT_API_BASE_URL` | ✅ Points to API | ❌ | SDK only |
| `DB_HOST/PORT/USER/PASSWORD/NAME` | ❌ Never | ✅ Only | |
| `PORT` | ❌ | ✅ | API server port |
| PII / Buffer / Filtering vars | ✅ | ❌ | SDK pipeline only |
| `AUDIT_PARTITIONING_ENABLED` | ❌ | ✅ | API DB routing only |
| `AUDIT_DOMAIN_MAPPING_JSON` | ❌ | ✅ | API partition map only |
