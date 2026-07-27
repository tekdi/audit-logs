import { DataSource } from 'typeorm';

/**
 * Automatically creates the required schema, including the partitioned audit_logs table
 * and message_templates table. This handles what TypeORM synchronize cannot do automatically.
 */
export async function initializeAuditSchema(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    // 1. Create message_templates table
    await queryRunner.query(`
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
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_template_unique
      ON message_templates (service_name, entity_type, event_action, language_code)
      WHERE is_active = TRUE;
    `);

    // 2. Create parent audit_logs table (PARTITIONED)
    await queryRunner.query(`
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
    `);

    // 3. Create default partition
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs_default
      PARTITION OF audit_logs DEFAULT;
    `);

    // 4. Create dynamic partitions based on AUDIT_DOMAIN_MAPPING_JSON
    const mappingJson = process.env.AUDIT_DOMAIN_MAPPING_JSON;
    if (mappingJson) {
      try {
        const mapping = JSON.parse(mappingJson);
        const services = Object.keys(mapping);
        for (const service of services) {
          const safeName = service.replace(/-/g, '_');
          if (!/^[a-z0-9_]+$/.test(safeName)) {
            console.error(`Skipping unsafe service name: ${service}`);
            continue;
          }
          const tableName = `audit_logs_${safeName}`;
          await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS ${tableName}
            PARTITION OF audit_logs FOR VALUES IN ('${service}');
          `);
        }
      } catch (e) {
        console.error('Failed to parse AUDIT_DOMAIN_MAPPING_JSON', e);
      }
    }

    // 5. Indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_service_name ON audit_logs (service_name);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_entity_type ON audit_logs (entity_type);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs (created_at DESC);`);

    // GIN indexes for JSONB columns
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_context_gin ON audit_logs USING GIN (context jsonb_path_ops);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_audit_metadata_gin ON audit_logs USING GIN (metadata jsonb_path_ops);`);

  } finally {
    await queryRunner.release();
  }
}
