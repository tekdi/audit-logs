import { AuditConfig } from '../config/audit-config';
import { AuditEvent } from '../types/audit-event';

// ---------------------------------------------------------------------------
// Dot-path resolution for template interpolation
// ---------------------------------------------------------------------------

function resolvePath(obj: Record<string, unknown>, path: string): string {
  const val = path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
  if (val === undefined || val === null) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

/**
 * Interpolate a template string using {{dot.path}} syntax.
 * Unresolved tokens are replaced with an empty string.
 */
export function interpolate(template: string, event: AuditEvent): string {
  const root = event as unknown as Record<string, unknown>;
  return template.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
    return resolvePath(root, path.trim());
  });
}

/**
 * Infer a high-level eventType from the eventAction string.
 * e.g. 'USER_CREATED' → 'CREATE', 'ORDER_CANCELLED' → 'UPDATE', 'ACCOUNT_DELETED' → 'DELETE'
 */
export function inferEventType(eventAction: string): string {
  const upper = eventAction.toUpperCase();
  if (
    upper.includes('CREAT') ||
    upper.includes('ADD') ||
    upper.includes('REGISTER') ||
    upper.includes('SIGNUP') ||
    upper.includes('JOIN')
  ) {
    return 'CREATE';
  }
  if (upper.includes('DELET') || upper.includes('REMOV') || upper.includes('PURGE')) return 'DELETE';
  if (upper.includes('LOGIN') || upper.includes('LOGOUT') || upper.includes('AUTH') || upper.includes('PASSWORD')) return 'AUTH';
  return 'UPDATE';
}

/**
 * Resolve a human-readable message for the event.
 *
 * Resolution order:
 *  1. Check AUDIT_TEMPLATE_MAPPING_JSON for a templateKey.
 *     → If found, return the mapping info (the Audit API will resolve the final string from DB).
 *  2. Auto-generate a generic fallback message.
 *
 * Note: The SDK itself only has access to in-process template mappings (via env vars).
 * Full DB-driven template lookup happens on the Audit API side when the event arrives there.
 */
export function resolveMessage(event: AuditEvent, config: AuditConfig): string {
  const svc = (event.serviceName ?? config.serviceName).toLowerCase();
  const entityType = event.entityType.toUpperCase();
  const action = event.eventAction.toUpperCase();
  const eventKey = `${svc}.${entityType.toLowerCase()}.${action.toLowerCase()}`;

  // Check template mapping (case-insensitive)
  const keys = Object.keys(config.templateMappingJson);
  const matchKey = keys.find(k => k.toLowerCase() === eventKey);
  if (matchKey) {
    // Return a placeholder; the Audit API resolves the real template from DB
    return `[TEMPLATE:${config.templateMappingJson[matchKey].templateKey}]`;
  }

  // Generic fallback
  const serviceLabel = `[${svc.toUpperCase()}]`;
  const actor = event.actorName ? `by ${event.actorName}` : '';
  const entity = event.entityId ? `on entity ${event.entityId}` : '';
  return `${serviceLabel} ${entityType} ${action} action performed ${actor} ${entity}`.replace(/\s+/g, ' ').trim() + '.';
}

/**
 * Resolve the final display message from a DB-stored template string.
 * Used by the Audit API after fetching the template row.
 */
export function resolveFromTemplate(templateString: string, event: AuditEvent): string {
  return interpolate(templateString, event);
}
