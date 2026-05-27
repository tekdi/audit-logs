# Audit Logs — Monorepo

> A full-stack centralized audit logging system built as two tightly-coupled components: a **producer SDK** that any microservice installs, and a **central Audit API** that consumes and persists the events.

---

## 📦 Monorepo Structure

```
audit-logs/
├── src/                        # SDK (npm package — installed by producer services)
│   ├── audit-logger.ts         # Core AuditLogger class with emit() pipeline
│   ├── config/                 # buildConfig() — reads all env vars into typed AuditConfig
│   ├── transports/             # kafka-transport.ts, api-transport.ts
│   ├── buffer/                 # local-buffer.ts — disk/memory fallback store
│   ├── pii/                    # pii-processor.ts — mask / hash / encrypt / redact
│   ├── filter/                 # event-filter.ts — include/exclude rules
│   ├── templates/              # template-resolver.ts — human-readable messages
│   ├── entities/               # TypeORM entities: AuditLog, MessageTemplate
│   ├── nestjs/                 # AuditLoggerModule (NestJS DI wrapper)
│   ├── types/                  # AuditEvent, EnrichedAuditEvent, AuditContext types
│   ├── database/               # initializeAuditSchema() — creates partitioned tables
│   └── index.ts                # Public SDK exports
│
├── apps/
│   └── audit-api/              # Central Audit Consumer Service (NestJS application)
│       └── src/
│           ├── main.ts         # Bootstrap — listens on PORT (default 3001)
│           ├── app.module.ts   # Root module: TypeORM, ApiKeyGuard, Kafka services
│           ├── audit/
│           │   ├── audit.controller.ts       # POST /api/v1/audit/log, GET /api/v1/audit/logs
│           │   ├── audit.service.ts          # Persists events to PostgreSQL
│           │   ├── kafka-consumer.service.ts # Consumes from audit.events Kafka topic
│           │   └── kafka-producer.service.ts # Re-publishes events (hybrid mode)
│           ├── templates/                    # CRUD for MessageTemplate records
│           ├── common/
│           │   ├── guards/api-key.guard.ts   # x-api-key header authentication
│           │   ├── filters/                  # Global exception filter
│           │   └── interceptors/             # Response transform interceptor
│           └── database/                     # TypeORM DataSource configuration
│
├── docs/                       # Supplementary documentation
└── package.json                # SDK package: @tekdi/audit-logger v2.0.0
```

---

## 🏗️ Architecture Overview

```
Producer Services (user-service, lms-service, etc.)
        │
        │  npm install @tekdi/audit-logger   [SDK: src/]
        │
        │  auditLogger.emit(event)
        │
        ├──────────► Kafka topic: audit.events  ◄─────────────────────────┐
        │                                                                    │
        └──────────► REST POST /api/v1/audit/log (fallback)                │
                                                                             │
                          ┌──────────────────────────────────┐              │
                          │       Audit API (apps/audit-api) │══════════════╝
                          │   KafkaConsumerService           │  Consumes events
                          │   AuditService.log()             │  Resolves templates
                          │   TypeORM → PostgreSQL           │  Persists to DB
                          └──────────────────────────────────┘
                                        │
                                        ▼
                              audit_service_db (PostgreSQL)
                              audit_logs (partitioned by service)
                              message_templates
```

---

## 🚀 Part 1 — SDK (Producer Setup)

Install the SDK into any microservice that needs to emit audit events:

```bash
# Recommended (HTTPS — works everywhere)
npm install git+https://github.com/tekdi/audit-logs.git

# SSH (Alternative for CI/CD with deploy keys)
npm install git+ssh://git@github.com:tekdi/audit-logs.git
```

### NestJS Integration

Import the global module in your root `AppModule`:

```typescript
import { AuditLoggerModule } from '@tekdi/audit-logger/nestjs';

@Module({
  imports: [
    AuditLoggerModule.forRoot({
      // Options override env vars; all fields are optional.
      // The SDK reads AUDIT_* env vars automatically.
    }),
  ],
})
export class AppModule {}
```

Inject and use `AuditLoggerService` in any service:

```typescript
import { AuditLoggerService } from '@tekdi/audit-logger/nestjs';

@Injectable()
export class CohortService {
  constructor(private readonly audit: AuditLoggerService) {}

  async createCohort(data: CreateCohortDto, actor: Actor) {
    const cohort = await this.cohortRepo.save(data);

    // Convenience shorthand
    await this.audit.created('COHORT', cohort.id, actor);

    return cohort;
  }
}
```

### Plain Node.js / Express Integration

```typescript
import { AuditLogger } from '@tekdi/audit-logger';

const logger = new AuditLogger(); // reads from process.env automatically

// Convenience methods
await logger.created('COHORT', cohortId, { id: userId, name, role });
await logger.updated('COHORT', cohortId, actor, { oldValue, newValue });
await logger.deleted('COHORT', cohortId, actor);
await logger.loginSuccess(userId, { name, role }, context);
await logger.loginFailure(email, reason, context);

// Or emit any custom event
await logger.emit({
  entityType: 'COHORT',
  eventAction: 'COHORT_ARCHIVED',
  eventType: 'UPDATE',
  entityId: cohortId,
  actorId: userId,
  actorName: 'Jane Doe',
  userRole: 'admin',
  metadata: { reason: 'end-of-year' },
});
```

### SDK Event Pipeline

Every call to `emit()` runs through the following steps:

1. **Validate** — `entityType` and `eventAction` are required
2. **Filter** — respect `AUDIT_CAPTURE_ALL`, `AUDIT_INCLUDED_EVENTS_JSON`, `AUDIT_EXCLUDED_EVENTS_JSON`
3. **Enrich** — adds `serviceName`, `eventType`, `occurredAt`, `id`
4. **PII** — masks / hashes / encrypts / redacts fields listed in `AUDIT_PII_FIELDS_JSON`
5. **Template** — resolves a human-readable `humanMessage` from `AUDIT_TEMPLATE_MAPPING_JSON`
6. **Dispatch** — sends via the configured transport chain

### SDK Transport Modes

| `AUDIT_MODE` | Behaviour |
|---|---|
| `kafka` | Send to Kafka. On failure → buffer locally |
| `api` | POST to Audit API REST endpoint. On failure → buffer locally |
| `hybrid` | Try Kafka first → fall back to REST → fall back to local buffer |

### Required SDK Environment Variables

Add these to the `.env` of **each producer microservice**:

#### Core
| Variable | Default | Description |
|---|---|---|
| `AUDIT_ENABLED` | `true` | Master on/off switch |
| `AUDIT_SERVICE_NAME` | *(required)* | Unique name for this service (e.g. `user-service`) |
| `AUDIT_MODE` | `hybrid` | `kafka`, `api`, or `hybrid` |
| `AUDIT_ENV` | `production` | Environment label |

#### Kafka (for `kafka` or `hybrid` mode)
| Variable | Default | Description |
|---|---|---|
| `KAFKA_BROKERS` | `localhost:9092` | Comma-separated broker list |
| `KAFKA_TOPIC` | `audit.events` | Topic to produce to |
| `KAFKA_CLIENT_ID` | *(AUDIT_SERVICE_NAME)* | Kafka client identifier |
| `KAFKA_SSL_ENABLED` | `false` | Enable Kafka SSL |
| `KAFKA_SASL_MECHANISM` | — | `plain`, `scram-sha-256`, or `scram-sha-512` |
| `KAFKA_SASL_USERNAME` | — | SASL username |
| `KAFKA_SASL_PASSWORD` | — | SASL password |
| `KAFKA_PRODUCER_TIMEOUT_MS` | `5000` | Producer request timeout |

#### Audit API Fallback (for `api` or `hybrid` mode)
| Variable | Default | Description |
|---|---|---|
| `AUDIT_API_BASE_URL` | `http://localhost:3001/api/v1` | URL of the running Audit API |
| `AUDIT_API_KEY` | *(your secret)* | Shared secret sent as `x-api-key` header |
| `AUDIT_API_ENABLED` | `true` | Enable REST fallback |
| `AUDIT_API_TIMEOUT_MS` | `8000` | REST call timeout |

#### Local Buffer (Safety Net)
| Variable | Default | Description |
|---|---|---|
| `AUDIT_SDK_RETRY_LIMIT` | `3` | Retry attempts before buffering |
| `AUDIT_SDK_RETRY_DELAY_MS` | `500` | Delay between retries |
| `AUDIT_LOCAL_STORAGE_ENABLED` | `true` | Enable local fallback buffer |
| `AUDIT_LOCAL_STORAGE_TYPE` | `memory` | `memory` or `file` |
| `AUDIT_LOCAL_STORAGE_PATH` | `./.audit-buffer.json` | Path for file-based buffer |
| `AUDIT_LOCAL_STORAGE_MAX_SIZE` | `1000` | Max buffered events |

#### Event Filtering
| Variable | Default | Description |
|---|---|---|
| `AUDIT_CAPTURE_ALL` | `true` | Capture all events unless excluded |
| `AUDIT_INCLUDED_EVENTS_JSON` | `[]` | Allowlist: `["service.ENTITY.ACTION"]` |
| `AUDIT_EXCLUDED_EVENTS_JSON` | `[]` | Denylist: `["service.SYSTEM.HEALTH_CHECK"]` |

#### PII Protection
| Variable | Default | Description |
|---|---|---|
| `AUDIT_PII_STRATEGY` | `none` | `mask`, `hash`, `encrypt`, or `none` |
| `AUDIT_PII_FIELDS_JSON` | `[]` | Dot-notated field paths: `["metadata.email"]` |
| `AUDIT_PII_MASK_CONFIG_JSON` | `{}` | Per-field mask rules |
| `AUDIT_PII_HASH_ALGORITHM` | `sha256` | Hash algorithm |
| `AUDIT_PII_ENCRYPT_KEY` | — | 32-byte base64 key (required for `encrypt`) |

#### Localization & Templates
| Variable | Default | Description |
|---|---|---|
| `AUDIT_DEFAULT_LANGUAGE` | `en` | Default message language |
| `AUDIT_TEMPLATE_FALLBACK_LANGUAGE` | `en` | Fallback language lookup |
| `AUDIT_TEMPLATE_MAPPING_JSON` | `{}` | Event key → template key map |

#### Observability
| Variable | Default | Description |
|---|---|---|
| `AUDIT_SDK_LOG_LEVEL` | `warn` | `debug`, `info`, `warn`, `error`, `silent` |
| `AUDIT_SDK_LOG_FAILURES` | `true` | Log transport failures to console |
| `AUDIT_METRICS_ENABLED` | `false` | Enable internal metrics collection |

---

## 🖥️ Part 2 — Audit API (Consumer Service)

The `apps/audit-api` directory is a **standalone NestJS application**. It is the single service responsible for:

- Consuming `audit.events` messages from Kafka via `KafkaConsumerService`
- Accepting direct REST calls via `POST /api/v1/audit/log` (for `api`/`hybrid` SDK mode)
- Persisting logs to PostgreSQL using TypeORM (`AuditLog` entity)
- Managing message templates via `GET/POST /api/v1/templates`
- Protecting all endpoints with `x-api-key` authentication

### Starting the Audit API

```bash
cd apps/audit-api
cp .env.example .env   # configure your values
npm install
npm run start:dev
```

The service starts on **port 3001** by default (`PORT` env var).

### Audit API Environment Variables

Create `apps/audit-api/.env`:

```env
# ─── Core ────────────────────────────────────────────
PORT=3001
AUDIT_ENABLED=true
AUDIT_MODE=hybrid
AUDIT_SERVICE_NAME=audit-api-service
AUDIT_ENV=development

# ─── Database ─────────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=audit_service_db
DB_SSL=false

# ─── Kafka (Consumer) ─────────────────────────────────
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=audit.events
KAFKA_CLIENT_ID=audit-api-service
KAFKA_SSL_ENABLED=false
KAFKA_PRODUCER_TIMEOUT_MS=5000

# ─── API Protection ────────────────────────────────────
AUDIT_API_BASE_URL=http://localhost:3001/api/v1
AUDIT_API_KEY=your-shared-secret-key
AUDIT_API_ENABLED=true
AUDIT_API_TIMEOUT_MS=8000

# ─── PII, Filtering, Templates ────────────────────────
AUDIT_PII_STRATEGY=mask
AUDIT_PII_FIELDS_JSON='["metadata.email","metadata.phone"]'
AUDIT_CAPTURE_ALL=true
AUDIT_EXCLUDED_EVENTS_JSON='["audit-api-service.SYSTEM.HEALTH_CHECK"]'
AUDIT_DEFAULT_LANGUAGE=en
AUDIT_TEMPLATE_FALLBACK_LANGUAGE=en

# ─── Partitioning ──────────────────────────────────────
AUDIT_PARTITIONING_ENABLED=true
AUDIT_DOMAIN_MAPPING_JSON='{
  "user-service":    {"table":"audit_logs_user_service"},
  "lms-service":     {"table":"audit_logs_lms_service"},
  "event-service":   {"table":"audit_logs_event_service"}
}'
```

### Database Initialisation (Audit API only)

> ⚠️ **The SDK producer services DO NOT touch the database.** Only the Audit API manages it.

Because the `audit_logs` table uses **PostgreSQL Table Partitioning**, TypeORM's `synchronize: true` cannot create the correct schema. Use the SDK's built-in utility when the Audit API starts:

```typescript
import { initializeAuditSchema } from '@tekdi/audit-logger';

await dataSource.initialize();
await initializeAuditSchema(dataSource);
console.log('Partitioned schema ready.');
```

> **Note on UUIDs:** `actorId` and `entityId` must be strict UUIDv4 format.

### REST API Endpoints

All endpoints require `x-api-key: <AUDIT_API_KEY>` header.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/log` | Ingest a single audit event directly |
| `GET` | `/api/v1/audit/logs` | Query logs with filters |
| `GET/POST/…` | `/api/v1/templates` | Manage human-readable message templates |

**Query parameters for `GET /api/v1/audit/logs`:**

| Param | Description |
|---|---|
| `service_name` | Filter by service name |
| `entity_type` | Filter by entity type |
| `status` | Filter by status (`SUCCESS`, `FAILED`) |
| `start_date` / `end_date` | Date range filter |
| `search` | Full-text search on `human_message` / `event_action` |
| `page` / `limit` | Pagination (max `limit=100`) |
| `order` | `asc` or `desc` (default: `desc`) |

---

## 🔨 Development

### Build the SDK

```bash
# From repo root
npm run build
```

Output goes to `dist/`. The NestJS entry point is exported via the `./nestjs` subpath (see `package.json` exports).

### Run SDK Tests

```bash
npm test
```

---

## 📚 Further Documentation

| File | Contents |
|---|---|
| [docs/setup.md](docs/setup.md) | Step-by-step setup guide for SDK producers and the Audit API |
| [docs/tech-sol.md](docs/tech-sol.md) | High-level architectural decisions and transmission models |
| [docs/db-design.md](docs/db-design.md) | PostgreSQL schema, partitions, and indexes |
| [docs/api.md](docs/api.md) | REST API endpoints and payloads |
| [docs/features.md](docs/features.md) | PII masking, partitioning, templates, and Kafka details |
| [docs/ENV_CONFIGURATION.md](docs/ENV_CONFIGURATION.md) | Full environment variable reference |
| [docs/KAFKA_TESTING_GUIDE.md](docs/KAFKA_TESTING_GUIDE.md) | How to test Kafka integration end-to-end |
