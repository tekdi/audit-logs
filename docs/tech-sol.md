# Technical Solution Details

This document provides a high-level overview of the architectural decisions and technical solutions implemented in the Audit Logger system.

## 1. System Architecture
The system employs a **hub-and-spoke model**:
- **Spokes (Audit Logger SDK):** A lightweight NPM package installed across node-based microservices. It automatically scrubs PII and pushes events out.
- **Hub (Audit API Service):** A centralized NestJS application responsible for receiving logs, fetching translation templates, and piping data into the PostgreSQL partitioned database. 

## 2. Transmission Strategies (`AUDIT_MODE`)
Services communicate with the hub using one of three modes depending on scale requirements:
- **`api` (Synchronous REST):** The SDK posts logs to `/api/v1/audit/log` over HTTP. Best for simpler installations or small-scale apps.
- **`kafka` (Asynchronous):** The SDK streams logs into a Kafka topic (`audit.events`). The Hub listens to this topic. Best for zero-blocking, high-throughput architectures.
- **`hybrid` (Resilient):** Attempts Kafka first. If Kafka goes down, the SDK buffers logs locally via ring buffers and falls back to syncing via the REST API to ensure 0% data loss.

## 3. PII Offloading Mechanism
To comply with GDPR and local data protection regulations, **Personally Identifiable Information (PII) must be masked at the source (the SDK)**, ensuring the central database NEVER sees cleartext sensitive data (like emails or credit cards).

The mechanism maps dot-notated fields (e.g. `metadata.email`) using strategies:
1. **Mask**: Retains partial visibility (e.g. `a***@gmail.com`).
2. **Hash**: Standard SHA digest.
3. **Redact**: Entirely drops the key.
4. **Encrypt**: Encrypts the payload (Requires external KMS).

## 4. Multi-tenant / Multi-service Query Isolation
Since the Audit API aggregates logs from numerous distinct services, a traditional table would suffer from index bloat.
**Solution:** Table Partitioning. 

**How it works:**
Partitioning is managed **entirely by the Audit API (Consumer)**. The SDK producers never interact with the database.

During startup, the Audit API runs the `initializeAuditSchema()` utility. This utility:
1. Creates the parent `audit_logs` table partitioned by `service_name` (PostgreSQL `LIST` partitioning).
2. Reads the `AUDIT_DOMAIN_MAPPING_JSON` environment variable to dynamically execute `CREATE TABLE ... PARTITION OF audit_logs` for every registered service (e.g., `audit_logs_user_service`, `audit_logs_lms_service`).
3. Creates a default catch-all partition (`audit_logs_default`) to safely handle logs from unregistered services without crashing.

When the Audit API persists a log, PostgreSQL automatically routes the record into the correct physical partition based on the `serviceName` field. Queries specific to `payment-service` only scan the physical disk blocks belonging to `audit_logs_payment_service`, granting essentially $O(1)$ scaling capability across microservices.
