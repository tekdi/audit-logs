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
    PRIMARY KEY (id, service_name) -- Primary key must include partition key
) PARTITION BY LIST (service_name);

-- 3. Create default partitions
CREATE TABLE IF NOT EXISTS audit_logs_user_service
    PARTITION OF audit_logs FOR VALUES IN ('user-service', 'user_service');

CREATE TABLE IF NOT EXISTS audit_logs_order_service
    PARTITION OF audit_logs FOR VALUES IN ('order-service', 'order_service');

CREATE TABLE IF NOT EXISTS audit_logs_default
    PARTITION OF audit_logs DEFAULT;

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_audit_service_name  ON audit_logs (service_name);
CREATE INDEX IF NOT EXISTS idx_audit_entity_type   ON audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_created_at    ON audit_logs (created_at DESC);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_audit_context_gin  ON audit_logs USING GIN (context  jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_audit_metadata_gin ON audit_logs USING GIN (metadata jsonb_path_ops);
