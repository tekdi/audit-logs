import * as crypto from 'crypto';
import { AuditConfig } from '../config/audit-config';
import { AuditEvent } from '../types/audit-event';

// ---------------------------------------------------------------------------
// Dot-path utilities
// ---------------------------------------------------------------------------

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cursor: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cursor[key] === undefined || cursor[key] === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Masking
// ---------------------------------------------------------------------------

function maskEmail(value: string, rule: { showFirst?: number; showDomain?: boolean }): string {
  const [local, domain] = value.split('@');
  if (!local) return '***';
  const showN = rule.showFirst ?? 0;
  const visible = local.slice(0, showN);
  const masked = '***';
  if (rule.showDomain && domain) {
    return `${visible}${masked}@${domain}`;
  }
  return `${visible}${masked}`;
}

function maskDefault(value: string, rule: { showFirst?: number; showLast?: number }): string {
  const str = String(value);
  if (rule.showFirst) {
    const visible = str.slice(0, rule.showFirst);
    return `${visible}***`;
  }
  if (rule.showLast) {
    const visible = str.slice(-rule.showLast);
    return `***${visible}`;
  }
  return '***';
}

function applyMask(fieldName: string, value: unknown, config: AuditConfig): string {
  if (typeof value !== 'string') return '***';
  const rule = config.piiMaskConfig[fieldName] ?? {};
  // Detect email by presence of '@'
  if (value.includes('@') && rule.showDomain !== undefined) {
    return maskEmail(value, rule);
  }
  return maskDefault(value, rule);
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

function applyHash(value: unknown, algorithm: string): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash(algorithm).update(str).digest('hex');
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

function applyEncrypt(value: unknown, key: string, ivLength: number): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const keyBuf = Buffer.from(key, 'base64');
  const iv = crypto.randomBytes(ivLength);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Encode as: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a deep-cloned copy of the event with PII fields transformed.
 * The original event object is never mutated.
 */
export function processPii(event: AuditEvent, config: AuditConfig): AuditEvent {
  if (config.piiStrategy === 'none' || config.piiFields.length === 0) {
    return event;
  }

  // Deep clone to avoid mutating the caller's object
  const cloned: AuditEvent = JSON.parse(JSON.stringify(event)) as AuditEvent;
  const root = cloned as unknown as Record<string, unknown>;

  for (const fieldPath of config.piiFields) {
    const rawValue = getPath(root, fieldPath);
    if (rawValue === undefined || rawValue === null) continue;

    let transformed: unknown;
    const fieldName = fieldPath.split('.').pop() ?? fieldPath;

    switch (config.piiStrategy) {
      case 'mask':
        transformed = applyMask(fieldName, rawValue, config);
        break;
      case 'hash':
        transformed = applyHash(rawValue, config.piiHashAlgorithm);
        break;
      case 'encrypt':
        transformed = applyEncrypt(rawValue, config.piiEncryptKey!, config.piiEncryptIvLength);
        break;
      default:
        transformed = rawValue;
    }

    setPath(root, fieldPath, transformed);
  }

  return cloned;
}
