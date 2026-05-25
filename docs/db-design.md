# Database Design (Audit Logger)

This document outlines the database design for the Audit API service, handled by PostgreSQL.

## Core Schema Strategy
The database is built for high-throughput and high-volume data retention, using **PostgreSQL Table Partitioning**.

### 1. `message_templates`
Stores dynamic string templates so frontend/backend systems do not need to hard-code error or success messages.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | Primary Key | Auto-generated UUID. |
| `service_name` | VARCHAR(100) | Not Null | Service domain (e.g. `user-service`). |
| `entity_type` | VARCHAR(100) | Not Null | Concept domain (e.g. `USER`). |
| `event_type` | VARCHAR(50) | Not Null | Category (e.g. `LOGIN`). |
| `event_action` | VARCHAR(100) | | Specific action (e.g. `LOGIN_SUCCESS`). |
| `language_code` | VARCHAR(10) | Default: `en` | Used for localization. |
| `template` | TEXT | Not Null | The actual message string. |

### 2. `audit_logs` (Partitioned Parent Table)
The main ledger for incoming logs. To prevent slower index scans as the table grows to millions of rows, it uses `PARTITION BY LIST (service_name)`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | Primary Key | Record ID (coupled with service_name). |
| `service_name` | VARCHAR(100) | Not Null | **Partition Key**. |
| `entity_type` | VARCHAR(100) | Not Null | Subject of the log. |
| `event_type` | VARCHAR(50) | Not Null | Event group. |
| `event_action` | VARCHAR(100) | | Exact triggered action. |
| `template_id` | UUID | | References `message_templates.id`. |
| `entity_id` | UUID | | UUID of the created/modified resource. |
| `created_by` | UUID | | Actor ID (user who did it). |
| `context` | JSONB | | Flexible block for arbitrary data. |
| `metadata` | JSONB | | System/client metadata. |
| `ip_address` | INET | | Captured IP. |

### 3. Partitions
Instead of storing everything in `audit_logs`, PostgreSQL routes incoming rows to physical sub-tables based on the `service_name`:
- `audit_logs_user_service` 
- `audit_logs_order_service`
- `audit_logs_default` (Fallback for unregistered services)

### Raw Schema Reference

For completeness, below is the raw PostgreSQL schema utilized by the central API:

```sql
-- 1. Create message_templates table
CREATE TABLE IF NOT EXISTS message_templates (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    service_name  VARCHAR(100) NOT NULL,
    entity_type   VARCHAR(100) NOT NULL,
    event_type    VARCHAR(50)  NOT NULL,
    event_action  VARCHAR(100),
    language_code VARCHAR(10)  DEFAULT 'en',
    template      TEXT         NOT NULL,
    is_active     BOOLEAN      DEFAULT TRUE,
    created_at    TIMESTAMPTZ  DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_template_unique
    ON message_templates (service_name, entity_type, event_action, language_code)
    WHERE is_active = TRUE;

-- 2. Create parent audit_logs table (PARTITIONED)
CREATE TABLE IF NOT EXISTS audit_logs (
    id               UUID        NOT NULL DEFAULT gen_random_uuid(),
    service_name     VARCHAR(100) NOT NULL,
    entity_type      VARCHAR(100) NOT NULL,
    event_type       VARCHAR(50)  NOT NULL,
    event_action     VARCHAR(100),
    template_id      UUID,
    entity_id        UUID,
    created_by       UUID,
    user_role        VARCHAR(100),
    device_platform  VARCHAR(50),
    context          JSONB,
    ip_address       INET,
    metadata         JSONB,
    human_message    TEXT,
    status           VARCHAR(20) DEFAULT 'SUCCESS',
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, service_name)
) PARTITION BY LIST (service_name);

-- 3. Create default partitions
CREATE TABLE IF NOT EXISTS audit_logs_user_service
    PARTITION OF audit_logs FOR VALUES IN ('user-service', 'user_service');

CREATE TABLE IF NOT EXISTS audit_logs_default
    PARTITION OF audit_logs DEFAULT;
```
