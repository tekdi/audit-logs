# Audit Logs Service Configuration Guide

This document explains all the `.env` variables available in the Audit Logs Service. It is meant for developers and end-users to understand how to configure the behavior, routing, and protections of the SDK and API.

---

## Core 
| Variable | Description |
|---|---|
| `AUDIT_ENABLED` | Global toggle (`true`/`false`). If disabled, the SDK completely ignores audit logging requests and the Kafka consumer does not start. |
| `AUDIT_MODE` | Determines how the SDK sends logs. <br>**Options:** `api` (direct REST call), `kafka` (publishes to Kafka broker), `hybrid` (publishes via both/either depending on setup). |
| `AUDIT_SERVICE_NAME` | The default name identifying the service producing the logs (e.g., `audit-api-service`, `user-service`). |
| `AUDIT_ENV` | Environment identifier (e.g., `development`, `production`). Used mainly for conditional logging behaviors. |

---

## Kafka (Transport)
*These settings dictate how logs safely travel from the originating service to the Message Broker.*
| Variable | Description |
|---|---|
| `KAFKA_BROKERS` | Comma-separated list of Kafka broker URLs (e.g., `localhost:9092`). |
| `KAFKA_TOPIC` | Target topic where the audit events are pushed (`audit.events`). |
| `KAFKA_CLIENT_ID` | Identifier for the Kafka client. Used to group and identify the producer/consumer. |
| `KAFKA_SSL_ENABLED` | Toggle `true` if your Kafka brokers require SSL/TLS encrypted traffic. |
| `KAFKA_PRODUCER_TIMEOUT_MS` | Max wait time (in ms) for the SDK to confirm the Kafka broker received the message. |

---

## Audit API (Direct REST Transport)
*These settings handle direct API fallback for legacy services or when `AUDIT_MODE=api`.*
| Variable | Description |
|---|---|
| `AUDIT_API_BASE_URL` | The REST endpoint of the Audit API server (e.g., `http://localhost:3000/api/v1`). |
| `AUDIT_API_KEY` | Secure token/key passed in the `Authorization` header to authenticate inter-service requests. |
| `AUDIT_API_ENABLED` | Toggle to allow direct REST calls. |
| `AUDIT_API_TIMEOUT_MS` | Time (ms) the SDK will wait for a response before timing out and falling back to Local Buffer. |

---

## Retry & Local Buffer (SDK Safety Net)
*These settings protect against data loss when Kafka or the Audit API is down.*
| Variable | Description |
|---|---|
| `AUDIT_SDK_RETRY_LIMIT` | Number of times the SDK will attempt to send a failed log before isolating it. |
| `AUDIT_SDK_RETRY_DELAY_MS` | Milliseconds to wait between retry attempts. |
| `AUDIT_LOCAL_STORAGE_ENABLED` | If `true`, the SDK saves failed logs to a local file/cache so they can be processed once the network recovers. |
| `AUDIT_LOCAL_STORAGE_TYPE` | Storage medium (e.g., `file`, `redis`, `memory`). |
| `AUDIT_LOCAL_STORAGE_PATH` | Path where the buffer file is saved (`./.audit-buffer.json`). |
| `AUDIT_LOCAL_STORAGE_MAX_SIZE` | Max number of log objects stored locally before old logs are dropped to prevent disk space issues. |

---

## Event Filtering
| Variable | Description |
|---|---|
| `AUDIT_CAPTURE_ALL` | If `true`, catches logs bypasses granular filters. |
| `AUDIT_EXCLUDED_EVENTS_JSON` | Pass an array of strings to aggressively block specific noise events from ever leaving the SDK. |

---

## PII Protection 
| Variable | Description |
|---|---|
| `AUDIT_PII_STRATEGY` | Strategy used. Options: `mask` (e.g., `ob*****@gmail.com`), `hash`, or `encrypt`. |
| `AUDIT_PII_FIELDS_JSON` | Array of object property paths to target for protection (e.g. `["metadata.email","metadata.phone"]`). |
| `AUDIT_PII_MASK_CONFIG_JSON` | Rules engine deciding exactly how each targeted field should be masked. |

---

## Localization & Templates
| Variable | Description |
|---|---|
| `AUDIT_DEFAULT_LANGUAGE` | The expected language code of the human-readable logs (`en`, `es`). |
| `AUDIT_TEMPLATE_FALLBACK_LANGUAGE` | The language to use if the `languageCode` accompanying a log event does not have a registered template. |
| `AUDIT_TEMPLATE_MAPPING_JSON` | Maps incoming system event keys into the human-readable `templateKey` registered in the Postgres DB. |

---

## Partition Routing
*These shape how the backend database handles vast amounts of incoming data.*
| Variable | Description |
|---|---|
| `AUDIT_PARTITIONING_ENABLED` | If `true`, uses Postgres partitioned tables. If `false`, standard single-table inserts apply. |
| `AUDIT_AUTO_PARTITION_ENABLED` | If `true`, missing table partitions are generated automatically by the application (Requires app logic support). |
| `AUDIT_MATERIALIZE_ENABLED` | If `true`, aggregates metrics into materialized views for lightning-fast dashboard reports. |
| `AUDIT_DOMAIN_MAPPING_JSON` | Maps a `service_name` strictly to its named Postgres physical table partition constraint. |

---

## SDK Observability
| Variable | Description |
|---|---|
| `AUDIT_SDK_LOG_LEVEL` | Level of console noisiness from the SDK (`info`, `debug`, `error`). |
| `AUDIT_SDK_LOG_FAILURES` | If `true`, pushes errors to the console stdout when a transport failure happens. |
| `AUDIT_METRICS_ENABLED` | Toggle internal performance metrics (e.g., ms spent masking PII vs sending). |

---

## Database (Audit API Only)
| Variable | Description |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER` | Connection credentials for the Postgres relational database. |
| `DB_NAME`, `DB_PASSWORD`, `DB_SSL`| Target DB schema name, password, and whether to enforce TLS connection pooling. |
