# Audit Logger: Setup & Configuration Guide

This guide describes how to configure and run the Audit Logger service (`apps/audit-api`) and its companion SDK (`packages/audit-logger`).

## Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (database for the Audit API)
- Kafka (Optional, if using `hybrid` or `kafka` transmission modes)

## 1. Installation

From the monorepo root:
```bash
npm install
```
This leverages npm workspaces to install dependencies for both the API service and the SDK package.

## 2. Environment Variables

Below is a complete description of the `.env` variables required to run the stack. You can copy the `.env.example` file to create your own configuration.

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

## 3. Creating the Database Schema

Before starting the service, ensure the PostgreSQL database (`audit_service_db`) exists.

Due to the use of highly optimized **PostgreSQL Table Partitioning**, standard TypeORM `synchronize: true` will not correctly build the partitioned schema. Instead, you must use the SDK's built-in initialization utility in your `audit-api` app:

```typescript
import { initializeAuditSchema } from '@your-org/audit-logger';

// After connecting to the database
await dataSource.initialize();
await initializeAuditSchema(dataSource);
console.log('Database partitions and tables initialized successfully');
```

**Important Note on UUIDs:**
The `audit_logs` table expects the `actorId` (mapped to `created_by` in DB) and `entityId` to be strict UUIDv4 formats.

## 4. Running the Service

### Starting the Audit API
Run the following from the root:
```bash
npm run start:dev --workspace=audit-api
```
*(Or navigate to `apps/audit-api` and run `npm run start:dev`)*

The service usually starts on `http://localhost:3000`.

### Building the SDK
If you intend to import the SDK package into another project, build it first:
```bash
npm run build --workspace=audit-logger
```
