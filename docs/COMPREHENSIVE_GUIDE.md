# Audit Logger: Comprehensive Guide

The Audit Logger is an enterprise-ready system designed to capture, protect (PII), and store audit events at scale using Kafka or REST.

---

## 1. Core Configuration
| Variable | Value | Description |
| :--- | :--- | :--- |
| `AUDIT_ENABLED` | `true`/`false` | Master toggle for the entire system. |
| `AUDIT_MODE` | `api` \| `kafka` \| `hybrid` | **api**: Direct REST. **kafka**: Async stream. **hybrid**: Kafka → API fallback. |
| `AUDIT_SERVICE_NAME` | `string` | Identifying name for the source service. |
| `AUDIT_API_KEY` | `string` | Secret key sent in `Authorization: Bearer <key>` header. |

---

## 2. Transmission & Reliability
| Feature | Variable | Usage |
| :--- | :--- | :--- |
| **Kafka** | `KAFKA_BROKERS` | Comma-separated list (e.g., `localhost:9092`). |
| **Local Buffer** | `AUDIT_LOCAL_STORAGE_ENABLED` | If `true`, failed logs are saved to disk/memory. |
| **Safety Net** | `AUDIT_SDK_RETRY_LIMIT` | Number of attempts before moving log to local buffer. |

---

## 3. PII Protection (Data Privacy)
| Variable | Example Value | Description |
| :--- | :--- | :--- |
| `AUDIT_PII_STRATEGY` | `mask` \| `hash` \| `encrypt` | Strategy applied to restricted fields. |
| `AUDIT_PII_FIELDS_JSON` | `["metadata.email"]` | JSON array of field paths to protect. |
| `AUDIT_PII_MASK_CONFIG_JSON` | `{"email":{"showFirst":2}}` | Specific rules for how to mask each field type. |

---

## 4. Dynamic Templates & Localization
| Variable | Description |
| :--- | :--- |
| `AUDIT_DEFAULT_LANGUAGE` | The default language of the messages (e.g., `en`). |
| `AUDIT_TEMPLATE_MAPPING_JSON` | Maps system event keys to database template keys. |

### How to use Templates:
1. **Register**: `POST /api/v1/templates` with a JSON template like `"Hello {{actorName}}!"`.
2. **Emit**: Send log data (like `actorName: "John"`) to `POST /api/v1/audit/log`.
3. **Result**: The DB stores the final sentence: `"Hello John!"`.

---

## 5. Database Partitioning (Scale)
| Variable | Description |
| :--- | :--- |
| `AUDIT_PARTITIONING_ENABLED` | Set to `true` to split logs into different table partitions. |
| `AUDIT_DOMAIN_MAPPING_JSON` | Maps service names to specific table partitions. |

---

## 6. Integration & Schema Initialization
The package `@tekdi/audit-logger` implements advanced **PostgreSQL Table Partitioning** which TypeORM cannot automatically `synchronize`. To fix this, we provide a schema initialization utility.

### Usage in NestJS/TypeORM API Setup:
```typescript
import { AuditLog, MessageTemplate, initializeAuditSchema } from '@tekdi/audit-logger';

// 1. Supply entities to TypeORM
TypeOrmModule.forRoot({
  entities: [AuditLog, MessageTemplate],
  synchronize: false, // Must be false due to partitions
});

// 2. Intialize partitions on bootstrap
await initializeAuditSchema(dataSource);
```
