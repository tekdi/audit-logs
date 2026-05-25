// Public SDK API — main entry point
export { AuditLogger, createAuditLogger } from './audit-logger';
export type { AuditLoggerOptions } from './audit-logger';
export type { AuditEvent, AuditContext, EnrichedAuditEvent } from './types/audit-event';
export type { AuditConfig, PiiMaskRule, TemplateMapping, DomainMapping } from './config/audit-config';
export { buildConfig } from './config/audit-config';

// TypeORM Entities for consumers
export { AuditLog } from './entities/audit-log.entity';
export { MessageTemplate } from './entities/message-template.entity';

// Database Schema Initialization Utility
export { initializeAuditSchema } from './database/schema-init';
