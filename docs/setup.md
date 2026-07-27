# Audit Logger: Setup & Configuration Guide

This guide walks through setting up both components of the `audit-logs` monorepo:

- **Part A** — Producer SDK: installed in microservices to emit audit events
- **Part B** — Audit API: the central NestJS service that consumes and persists events

---

## Prerequisites

| Requirement | Version / Notes |
|---|---|
| Node.js | v18 or higher |
| PostgreSQL | Any recent version — required only for the Audit API |
| Kafka | Required for `kafka` or `hybrid` transmission modes |

---

## Part A — SDK Setup (Producer Microservices)

Follow these steps for **each microservice** that needs to emit audit events.

### Step 1 — Install the SDK

```bash
# Recommended (SSH, for CI/CD)
npm install git+ssh://git@github.com:tekdi/audit-logs.git

# HTTPS alternative
npm install git+https://github.com/tekdi/audit-logs.git
```

### Step 2 — Configure Environment Variables

Add the following to your service's `.env` file. Only `AUDIT_SERVICE_NAME` is strictly required; all other variables have defaults.

```env
# ─── Required ─────────────────────────────────────────────
AUDIT_SERVICE_NAME=user-service     # Must be unique per service

# ─── Core ─────────────────────────────────────────────────
AUDIT_ENABLED=true
AUDIT_MODE=kafka                    # kafka | api | hybrid
AUDIT_ENV=development

# ─── Standalone Consumer (Optional - Enable on ONE service to persist directly to DB)
AUDIT_CONSUMER_ENABLED=true                  # Set true on 1 service to consume & persist events
AUDIT_CONSUMER_GROUP_ID=user-service-audit-group

# ─── Database (Required ONLY if AUDIT_CONSUMER_ENABLED=true) ───
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=audit_service_db

# ─── Message Templates (Option A: JSON File | Option B: Inline JSON) ───
AUDIT_TEMPLATES_FILE=./src/config/audit-templates.json
# AUDIT_TEMPLATES_JSON='[{"serviceName":"user-service","entityType":"USER","eventType":"CREATE","eventAction":"USER_CREATED","languageCode":"en","template":"User {{metadata.name}} created."}]'

# ─── Kafka (if AUDIT_MODE is kafka or hybrid) ─────────────
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=audit.events
KAFKA_CLIENT_ID=user-service
KAFKA_SSL_ENABLED=false
KAFKA_PRODUCER_TIMEOUT_MS=5000

# ─── Audit API Fallback (Only if using central audit-api service) ──
AUDIT_API_BASE_URL=http://localhost:3001/api/v1
AUDIT_API_KEY=your-shared-secret-key
AUDIT_API_ENABLED=false
AUDIT_API_TIMEOUT_MS=8000

# ─── Local Buffer (safety net when all transports fail) ───
AUDIT_LOCAL_STORAGE_ENABLED=true
AUDIT_LOCAL_STORAGE_TYPE=file
AUDIT_LOCAL_STORAGE_PATH=./.audit-buffer.json
AUDIT_LOCAL_STORAGE_MAX_SIZE=5000
AUDIT_SDK_RETRY_LIMIT=3
AUDIT_SDK_RETRY_DELAY_MS=500

# ─── Event Filtering ──────────────────────────────────────
AUDIT_CAPTURE_ALL=true
AUDIT_EXCLUDED_EVENTS_JSON='["user-service.SYSTEM.HEALTH_CHECK"]'

# ─── PII Protection ───────────────────────────────────────
AUDIT_PII_STRATEGY=mask             # mask | hash | encrypt | none
AUDIT_PII_FIELDS_JSON='["metadata.email","metadata.phone"]'
AUDIT_PII_MASK_CONFIG_JSON='{"email":{"showFirst":2,"showDomain":true}}'
# AUDIT_PII_ENCRYPT_KEY=<32-byte-base64-key>   # required only for encrypt strategy

# ─── Localization ─────────────────────────────────────────
AUDIT_DEFAULT_LANGUAGE=en
AUDIT_TEMPLATE_FALLBACK_LANGUAGE=en

# ─── Observability ────────────────────────────────────────
AUDIT_SDK_LOG_LEVEL=info
AUDIT_SDK_LOG_FAILURES=true
```

### Step 2.1 — Adding Message Templates via JSON File (`audit-templates.json`)

To avoid long `.env` strings, define your service's message templates in a dedicated JSON file (e.g. `./src/config/audit-templates.json`):

```json
[
  {
    "serviceName": "user-service",
    "entityType": "USER",
    "eventType": "CREATE",
    "eventAction": "USER_CREATED",
    "languageCode": "en",
    "template": "User {{metadata.name}} ({{actorName}}) was created successfully."
  },
  {
    "serviceName": "user-service",
    "entityType": "USER",
    "eventType": "UPDATE",
    "eventAction": "USER_UPDATED",
    "languageCode": "en",
    "template": "User {{entityId}} profile updated by {{actorName}}."
  }
]
```

When `AUDIT_CONSUMER_ENABLED=true` starts up, it automatically syncs these template definitions into the shared PostgreSQL `message_templates` table.

> **Note:** Event actions without an explicit template automatically fall back to clean default formatting (e.g. `"[USER-SERVICE] USER USER_CREATED performed."`).

### Step 3 — Register the Module (NestJS)

In your root `AppModule`:

```typescript
import { Module } from '@nestjs/common';
import { AuditLoggerModule } from '@tekdi/audit-logger/nestjs';

@Module({
  imports: [
    AuditLoggerModule.forRoot(),  // reads all config from process.env
  ],
})
export class AppModule {}
```

> **Note:** If `AUDIT_CONSUMER_ENABLED=true` in `.env` and TypeORM is connected in your application, `AuditLoggerModule` automatically starts the background Kafka consumer and initializes database partitions—no extra consumer code required!

> **Note:** `AuditLoggerModule` is `@Global()` — register it once in the root module. All child modules get `AuditLoggerService` injected automatically.

### Step 4 — Emit Events in Your Service

```typescript
import { Injectable } from '@nestjs/common';
import { AuditLoggerService } from '@tekdi/audit-logger/nestjs';

@Injectable()
export class CohortService {
  constructor(private readonly audit: AuditLoggerService) {}

  async create(dto: CreateCohortDto, actor: Actor) {
    const cohort = await this.repo.save(dto);

    await this.audit.created('COHORT', cohort.id, {
      id: actor.userId,
      name: actor.name,
      role: actor.role,
    });

    return cohort;
  }

  async update(id: string, dto: UpdateCohortDto, actor: Actor, oldValue: any) {
    const updated = await this.repo.save({ id, ...dto });

    await this.audit.updated('COHORT', id, actor, { oldValue, newValue: dto });

    return updated;
  }

  async remove(id: string, actor: Actor) {
    await this.repo.delete(id);
    await this.audit.deleted('COHORT', id, actor);
  }
}
```

#### Plain Node.js / Express

```typescript
import { AuditLogger } from '@tekdi/audit-logger';

const audit = new AuditLogger(); // reads process.env automatically

await audit.emit({
  entityType: 'COHORT',
  eventAction: 'COHORT_CREATED',
  eventType: 'CREATE',
  entityId: cohort.id,
  actorId: userId,
  actorName: 'Jane Doe',
  userRole: 'admin',
  metadata: { name: cohort.name },
});
```

### SDK Transmission Modes

| Mode | Behaviour |
|---|---|
| `kafka` | Send directly to Kafka. On failure → buffer locally and retry |
| `api` | POST to Audit API REST endpoint. On failure → buffer locally and retry |
| `hybrid` | Try Kafka first → fall back to REST → fall back to local buffer |

> **Recommended:** Use `kafka` mode for high-throughput production services. Use `api` mode when Kafka is unavailable. Use `hybrid` for maximum resilience.

---

## Part B — Audit API Setup (Central Consumer Service)

`apps/audit-api` is the **central NestJS application** that receives and stores all audit events. Run it as a standalone service.

### Step 1 — Create the Database

Ensure PostgreSQL is running and create the target database:

```sql
CREATE DATABASE audit_service_db;
```

### Step 2 — Configure Environment

```bash
cd apps/audit-api
cp .env.example .env   # or create .env manually
```

Edit `apps/audit-api/.env`:

```env
# ─── Server ────────────────────────────────────────
PORT=3001
NODE_ENV=development

# ─── Database ──────────────────────────────────────
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=audit_service_db
DB_SSL=false

# ─── Kafka Consumer ────────────────────────────────
AUDIT_ENABLED=true
KAFKA_BROKERS=localhost:9092
KAFKA_TOPIC=audit.events
KAFKA_CLIENT_ID=audit-api-service

# ─── API Authentication ────────────────────────────
AUDIT_API_KEY=your-shared-secret-key   # Must match AUDIT_API_KEY in producer services

# ─── Partitioning ──────────────────────────────────
AUDIT_PARTITIONING_ENABLED=true
AUDIT_DOMAIN_MAPPING_JSON='{
  "user-service":  {"table":"audit_logs_user_service"},
  "lms-service":   {"table":"audit_logs_lms_service"},
  "event-service": {"table":"audit_logs_event_service"}
}'

# ─── Templates ─────────────────────────────────────
AUDIT_DEFAULT_LANGUAGE=en
AUDIT_TEMPLATE_FALLBACK_LANGUAGE=en
```

### Step 3 — Initialise the Database Schema

> ⚠️ **Do NOT use TypeORM `synchronize: true` in production.** The `audit_logs` table is partitioned, and TypeORM cannot create partitioned tables automatically.

The Audit API calls `initializeAuditSchema()` automatically via `DataSource` when the service boots. This creates:

- `audit_logs` — partitioned parent table
- `audit_logs_<service_name>` — per-service child partitions (from `AUDIT_DOMAIN_MAPPING_JSON`)
- `message_templates` — stores human-readable log message templates

If you need to call it manually:

```typescript
import { initializeAuditSchema } from '@tekdi/audit-logger';

await dataSource.initialize();
await initializeAuditSchema(dataSource);
```

### Step 4 — Install and Start

```bash
cd apps/audit-api
npm install
npm run start:dev     # development (hot-reload)
# npm run start:prod  # production
```

The service starts on `http://localhost:3001` (configurable via `PORT`).

You should see:

```
Audit API Service is running on: http://localhost:3001
Kafka consumer connected and subscribed to topic: audit.events
```

### Step 5 — Verify the Setup

**Check the service is up:**

```bash
curl http://localhost:3001
```

**POST a test event directly (bypassing Kafka):**

```bash
curl -X POST http://localhost:3001/api/v1/audit/log \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-shared-secret-key" \
  -d '{
    "serviceName": "user-service",
    "entityType": "USER",
    "eventAction": "USER_CREATED",
    "eventType": "CREATE",
    "entityId": "550e8400-e29b-41d4-a716-446655440000",
    "actorId": "550e8400-e29b-41d4-a716-446655440001",
    "userRole": "admin",
    "status": "SUCCESS"
  }'
```

**Query stored logs:**

```bash
curl "http://localhost:3001/api/v1/audit/logs?service_name=user-service&limit=10" \
  -H "x-api-key: your-shared-secret-key"
```

---

## Audit API REST Endpoints

All endpoints require the `x-api-key: <AUDIT_API_KEY>` header.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/audit/log` | Ingest a single audit event |
| `GET` | `/api/v1/audit/logs` | Query and filter persisted logs |
| `GET` | `/api/v1/templates` | List all message templates |
| `POST` | `/api/v1/templates` | Create a new message template |

### `GET /api/v1/audit/logs` — Query Parameters

| Parameter | Description |
|---|---|
| `service_name` | Filter by service (e.g. `user-service`) |
| `entity_type` | Filter by entity (e.g. `COHORT`) |
| `status` | Filter by status (`SUCCESS` or `FAILED`) |
| `start_date` | ISO date lower bound |
| `end_date` | ISO date upper bound |
| `search` | Full-text search on `human_message` and `event_action` |
| `page` | Page number (default: `1`) |
| `limit` | Page size (default: `10`, max: `100`) |
| `order` | `asc` or `desc` (default: `desc`) |

---

## Architecture at a Glance

```
user-service  ──┐
lms-service   ──┤── SDK (kafka/api/hybrid) ──► Kafka: audit.events ──► Audit API
event-service ──┘                          │                              │
                                           └──► REST fallback ────────────┤
                                                                           ▼
                                                                   PostgreSQL
                                                               audit_service_db
                                                         audit_logs (partitioned)
```

---

## Building the SDK (for local development)

```bash
# From the monorepo root
npm run build      # compiles TypeScript → dist/
npm test           # runs jest test suite
npm run lint       # ESLint checks
```
