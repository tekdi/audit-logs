/**
 * AuditEvent — the data structure emitted by callers.
 * All fields except entityType and eventAction are optional.
 */
export interface AuditEvent {
  /** Logical service name. Defaults to AUDIT_SERVICE_NAME env var if omitted. */
  serviceName?: string;
  /** Domain entity type, e.g. 'USER', 'ORDER', 'DOCUMENT' */
  entityType: string;
  /** High-level event category, e.g. 'CREATE' | 'UPDATE' | 'DELETE'. Inferred from eventAction if omitted. */
  eventType?: string;
  /** Specific action key, e.g. 'USER_CREATED', 'ORDER_CANCELLED' */
  eventAction: string;
  /** UUID of the affected record */
  entityId?: string;
  /** UUID of the user performing the action */
  actorId?: string;
  actorName?: string;
  userRole?: string;
  /** Arbitrary structured payload */
  metadata?: Record<string, unknown>;
  context?: AuditContext;
  status?: 'SUCCESS' | 'FAILED' | 'PENDING';
  /** Overrides AUDIT_DEFAULT_LANGUAGE for this event only */
  languageCode?: string;
  /** Auto-filled to NOW() if omitted */
  occurredAt?: Date | string;
}

export interface AuditContext {
  platform?: string;
  browser?: string;
  os?: string;
  ipAddress?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/** Internal enriched event with resolved fields */
export interface EnrichedAuditEvent extends AuditEvent {
  serviceName: string;
  eventType: string;
  occurredAt: string;
  humanMessage?: string;
}
