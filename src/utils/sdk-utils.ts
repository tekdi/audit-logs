import { AuditConfig } from '../config/audit-config';
import { EnrichedAuditEvent } from '../types/audit-event';

// ---------------------------------------------------------------------------
// Simple internal logger (respects AUDIT_SDK_LOG_LEVEL)
// ---------------------------------------------------------------------------

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

export function sdkLog(config: AuditConfig, level: 'debug' | 'info' | 'warn' | 'error', msg: string): void {
  if (LEVELS[level] >= LEVELS[config.sdkLogLevel]) {
    const prefix = `[audit-logger][${level.toUpperCase()}]`;
    if (level === 'error' || level === 'warn') {
      console.error(`${prefix} ${msg}`);
    } else {
      console.log(`${prefix} ${msg}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Retry helper with exponential back-off
// ---------------------------------------------------------------------------

export async function withRetry<T>(
  fn: () => Promise<T>,
  retryLimit: number,
  baseDelayMs: number,
  label: string,
  config: AuditConfig,
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retryLimit) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        sdkLog(config, 'warn', `${label} attempt ${attempt + 1} failed. Retrying in ${delay}ms…`);
        await sleep(delay);
      }
    }
  }
  throw lastError ?? new Error(`${label} failed after ${retryLimit + 1} attempts`);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Build enriched event payload (adds service_name, eventType, occurredAt)
// ---------------------------------------------------------------------------

import { AuditEvent } from '../types/audit-event';
import { inferEventType } from '../templates/template-resolver';

export function enrich(event: AuditEvent, config: AuditConfig): EnrichedAuditEvent {
  return {
    ...event,
    serviceName: event.serviceName ?? config.serviceName,
    eventType: event.eventType ?? inferEventType(event.eventAction),
    occurredAt: event.occurredAt
      ? new Date(event.occurredAt).toISOString()
      : new Date().toISOString(),
  };
}
