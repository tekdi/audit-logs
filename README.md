# Audit Logger Monorepo & SDK

> A plug-and-play, env-driven audit/activity logging SDK for NestJS/Node.js services.

## Features

- **Flexible Transmission Modes**: Supports synchronous REST (`api`), high-throughput asynchronous messaging (`kafka`), or a robust fallback mechanism (`hybrid`).
- **PII Protection**: Automatically shields Personally Identifiable Information (PII) before it leaves the service via masking, hashing, encrypting, or redacting.
- **Dynamic Localization**: Relies on a centralized template database for dynamic, multi-lingual log messages instead of hard-coded strings.
- **Partitioned Storage**: Automatically writes logs into service-specific partitions (e.g., `audit_logs_user_service`) in PostgreSQL for highly performant queries at scale.


---

## 🚀 SDK Usage in Other Services

You can install this SDK directly from the Git repository:

```bash
npm install git+https://github.com/<your-org-name>/audit-logs.git
```

### NestJS Usage

To ensure standard Node applications don't accidentally bundle Nest dependencies, we export the NestJS specific tools from a subpath. 

If you are using NestJS, import the module using the `/nestjs` suffix:

```typescript
import { AuditLoggerModule } from '@your-org/audit-logger/nestjs';

@Module({
  imports: [
    AuditLoggerModule.forRoot({
      // Your configuration here
    })
  ],
})
export class AppModule {}
```

### Standard Node.js Usage

If you are using standard Node.js (like Express, Fastify, etc.), import the SDK from the main path:

```typescript
import { AuditLogger } from '@your-org/audit-logger';

const logger = new AuditLogger({
  // Your configuration here
});
```

*(Developer Notes: Built with TypeScript. Exposes `nestjs` module via `exports` definition in `package.json`.)*

---

## 🛠️ API & Service Setup

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (for the Audit API)
- Kafka (optional, for `hybrid` or `kafka` modes)

### 2. Installation
To install the SDK directly from the Git repository into your service, run:

```bash
# Using HTTPS (requires auth if private repo)
npm install git+https://github.com/<your-org-name>/audit-logs.git

# OR using SSH (recommended for developers and CI/CD)
npm install git+ssh://git@github.com:<your-org-name>/audit-logs.git
```

### 3. Environment Variables


Copy `.env.example` to your service root to create your own configuration:
```bash
cp .env.example .env
```

Below is a complete description of the `.env` variables required to run the stack.

#### Core Configuration
| Variable | Default Value | Description |
|---|---|---|
| `AUDIT_ENABLED` | `true` | Master switch to enable/disable auditing. |
| `AUDIT_SERVICE_NAME` | `audit-api-service` | The name identifying this service. |
| `AUDIT_MODE` | `hybrid` | Transmission mode: `api` (REST), `kafka` (queue), or `hybrid` (Kafka with local buffering fallback). |

#### Database Configuration (API only)
| Variable | Default Value | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_USER` | `postgres` | User account for PostgreSQL. |
| `DB_PASSWORD` | `postgres` | Password for PostgreSQL. |
| `DB_NAME` | `audit_service_db` | Database name. |

#### API Protection
| Variable | Default Value | Description |
|---|---|---|
| `AUDIT_API_BASE_URL` | `http://localhost:3000/api/v1` | URL where the Audit API is hosted. |
| `AUDIT_API_KEY` | *(your secret)* | JWT secret or API key used for inter-service authentication via the `x-api-key` header. |

#### Advanced Features (PII & Partitions)
| Variable | Default Value | Description |
|---|---|---|
| `AUDIT_PII_STRATEGY` | `mask` | PII protection strategy: `mask`, `hash`, `encrypt`, or `redact`. |
| `AUDIT_PII_FIELDS_JSON` | `["metadata.email"]` | JSON array of dot-notated fields that contain PII. |
| `AUDIT_PARTITIONING_ENABLED` | `true` | Enables PostgreSQL table partitioning by service name. |

### 4. Database Setup (Central Audit API)

> **⚠️ WARNING:** The SDK consuming microservices **DO NOT** create or manage the database! The database is centrally owned by the separate **Audit API** service.

Furthermore, because the `audit_logs` table uses **PostgreSQL Table Partitioning** for high performance, TypeORM's `synchronize: true` **WILL NOT work correctly** (it cannot create partitioned tables).

To initialize the database for the central Audit API automatically, simply use the `initializeAuditSchema` utility provided by this SDK once your TypeORM `DataSource` connects.

```typescript
import { initializeAuditSchema } from '@your-org/audit-logger';

// When your API server initializes its Postgres DB connection:
await dataSource.initialize();
await initializeAuditSchema(dataSource);
console.log('Database partitions and tables initialized successfully');
```

**Important Note on UUIDs:**
The `audit_logs` table expects the `actorId` (mapped to `created_by` in DB) and `entityId` to be strict UUIDv4 formats.

### 5. Running the Service

#### Starting the Central Audit API
Make sure your central Audit API server is running separately with the database initialized. Once your microservice is deployed, this SDK will transmit logs to the central API via REST (`AUDIT_API_BASE_URL`) or Kafka.


#### Building and Testing the SDK
To build the SDK:
```bash
npm run build
```

To run the SDK tests:
```bash
npm test
```

## Further Documentation
Please refer to the dedicated documentation files in the `docs/` folder:

- [Technical Solution](docs/tech-sol.md): High-level architectural decisions, transmission models, and data privacy mechanisms.
- [Database Design](docs/db-design.md): Details the PostgreSQL schema, including table partitions and core components.
- [API Documentation](docs/api.md): Endpoints, expected payloads, and the standardized response envelope format.
- [Features & Architecture](docs/features.md): Details on Kafka transmission, PII masking, data partitioning, and message templating.
