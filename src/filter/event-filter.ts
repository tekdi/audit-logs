import { AuditConfig } from '../config/audit-config';
import { AuditEvent } from '../types/audit-event';

/**
 * Derive the event key in the format: <service_name>.<entity_type>.<event_action>
 * All uppercase, dot-separated — as documented in §9.2.
 */
export function buildEventKey(event: AuditEvent, serviceName: string): string {
  const svc = (event.serviceName ?? serviceName).toUpperCase().replace(/-/g, '_');
  return `${svc}.${event.entityType.toUpperCase()}.${event.eventAction.toUpperCase()}`;
}

/**
 * Canonical key format used by include/exclude lists in env vars.
 * Normalises hyphens to dashes so user can use either format.
 */
function normalise(key: string): string {
  return key.toUpperCase();
}

/**
 * Returns true if the event should be captured, false if it should be suppressed.
 *
 * Rules (in order):
 *   1. If the event key is in the exclude list → suppress.
 *   2. If AUDIT_CAPTURE_ALL=true → capture.
 *   3. If AUDIT_CAPTURE_ALL=false → capture only if key is in the include list.
 */
export function shouldCapture(event: AuditEvent, config: AuditConfig): boolean {
  const key = buildEventKey(event, config.serviceName);
  const normKey = normalise(key);

  // Step 1: check exclude list
  const excluded = config.excludedEvents.some(e => normalise(e) === normKey);
  if (excluded) return false;

  // Step 2 / 3: capture all vs. allowlist
  if (config.captureAll) return true;

  return config.includedEvents.some(e => normalise(e) === normKey);
}
