# Audit Logger Features & Architecture

This document covers the advanced capabilities built into the Audit Logger SDK and API.

## 1. Transmission Modes (Kafka vs API)

The SDK supports three transmission modes configured via `AUDIT_MODE`:
- `api`: Synchronous REST transmission directly to the Audit API.
- `kafka`: Asynchronous, high-throughput transmission via Apache Kafka.
- `hybrid`: Attempts Kafka first. If Kafka fails, it buffers logs locally and retries.

## 2. PII Protection

Data privacy is a core concern. The SDK can automatically manipulate Personally Identifiable Information (PII) before logs hit the database or Kafka transport.

Configured via `AUDIT_PII_STRATEGY`, you can:
- **Mask:** Partially obscure fields (e.g., `j***@example.com`).
- **Hash:** Convert values to non-reversible hashes.
- **Encrypt:** Secure values (requires KMS/Encryption implementation).
- **Redact:** Completely remove the field.

You tell the SDK which fields to target via the `AUDIT_PII_FIELDS_JSON` environment variable arrays.

## 3. Dynamic Message Templates (Localization)

Instead of hard-coding log human-readable strings across your microservices, the SDK leverages a centralized template system.

If a microservice emits `eventType="LOGIN"` and `eventAction="LOGIN_SUCCESS"`, the Audit API intercepts this event and pulls the corresponding template from the `message_templates` table. It interpolates the data context dynamically based on the requested language (`languageCode`).

## 4. Partitioned Logging 

High volume domains benefit from PostgreSQL Table Partitioning. When `AUDIT_PARTITIONING_ENABLED` is `true`, the Audit API maps events to specific sub-tables dynamically:
- Event from `user-service` writes to `audit_logs_user_service`
- Event from `order-service` writes to `audit_logs_order_service`

This ensures querying logs for a specific service remains highly performant at scale.
