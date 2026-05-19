# Audit Logger Monorepo

> A plug-and-play, env-driven audit/activity logging SDK for NestJS/Node.js services.

## Features

- **Flexible Transmission Modes**: Supports synchronous REST (`api`), high-throughput asynchronous messaging (`kafka`), or a robust fallback mechanism (`hybrid`).
- **PII Protection**: Automatically shields Personally Identifiable Information (PII) before it leaves the service via masking, hashing, encrypting, or redacting.
- **Dynamic Localization**: Relies on a centralized template database for dynamic, multi-lingual log messages instead of hard-coded strings.
- **Partitioned Storage**: Automatically writes logs into service-specific partitions (e.g., `audit_logs_user_service`) in PostgreSQL for highly performant queries at scale.

## Structure

- **`packages/audit-logger`**: The core SDK for Node.js and NestJS.
- **`apps/audit-api`**: The central Audit API service (NestJS + Partitioned PostgreSQL).

## Getting Started

### 1. Prerequisites
- Node.js (v18+)
- PostgreSQL (for the Audit API)
- Kafka (optional, for `hybrid` or `kafka` modes)

### 2. Installation
From the monorepo root:
```bash
npm install
```
This leverages npm workspaces to install dependencies for both the API service and the SDK package.

## Environment Variables

Copy `.env.example` to your service root to create your own configuration:
```bash
cp .env.example .env
```

Below is a complete description of the `.env` variables required to run the stack.

### Core Configuration
| Variable | Default Value | Description |
|---|---|---|
| `AUDIT_ENABLED` | `true` | Master switch to enable/disable auditing. |
| `AUDIT_SERVICE_NAME` | `audit-api-service` | The name identifying this service. |
| `AUDIT_MODE` | `hybrid` | Transmission mode: `api` (REST), `kafka` (queue), or `hybrid` (Kafka with local buffering fallback). |

### Database Configuration (API only)
| Variable | Default Value | Description |
|---|---|---|
| `DB_HOST` | `localhost` | PostgreSQL host. |
| `DB_PORT` | `5432` | PostgreSQL port. |
| `DB_USER` | `postgres` | User account for PostgreSQL. |
| `DB_PASSWORD` | `postgres` | Password for PostgreSQL. |
| `DB_NAME` | `audit_service_db` | Database name. |

### API Protection
| Variable | Default Value | Description |
|---|---|---|
| `AUDIT_API_BASE_URL` | `http://localhost:3000/api/v1` | URL where the Audit API is hosted. |
| `AUDIT_API_KEY` | *(your secret)* | JWT secret or API key used for inter-service authentication via the `x-api-key` header. |

### Advanced Features (PII & Partitions)
| Variable | Default Value | Description |
|---|---|---|
| `AUDIT_PII_STRATEGY` | `mask` | PII protection strategy: `mask`, `hash`, `encrypt`, or `redact`. |
| `AUDIT_PII_FIELDS_JSON` | `["metadata.email"]` | JSON array of dot-notated fields that contain PII. |
| `AUDIT_PARTITIONING_ENABLED` | `true` | Enables PostgreSQL table partitioning by service name. |

## Creating the Database Schema

Before starting the service, ensure the PostgreSQL database (`audit_service_db`) exists.

The application uses TypeORM. In development (`NODE_ENV=development`), it uses `synchronize: true` to automatically create the tables based on your entities. For production deployments, you should transition to using TypeORM migrations.

**Important Note on UUIDs:**
The `audit_logs` table expects the `actorId` (mapped to `created_by` in DB) and `entityId` to be strict UUIDv4 formats.

## Running the Service

### Starting the Audit API
Run the following from the root:
```bash
npm run start:dev --workspace=audit-api
```
*(Or navigate to `apps/audit-api` and run `npm run start:dev`)*

The service usually starts on `http://localhost:3000`.

### Building and Testing the SDK
If you intend to import the SDK package into another project, build it first:
```bash
npm run build --workspace=audit-logger
```

To run the SDK tests:
```bash
cd packages/audit-logger
npm test
```

## Further Documentation
Please refer to the dedicated documentation files in the `docs/` folder:

- [API Documentation](docs/api.md): Endpoints, expected payloads, and the standardized response envelope format.
- [Features & Architecture](docs/features.md): Details on Kafka transmission, PII masking, data partitioning, and message templating.
