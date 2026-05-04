import { AuditConfig } from '../config/audit-config';
import { EnrichedAuditEvent } from '../types/audit-event';
import { sdkLog, withRetry } from '../utils/sdk-utils';

/**
 * Send an enriched event to the central Audit API via HTTP POST.
 * Uses native fetch (Node 18+) or falls back to https module.
 * Throws on failure so the caller can fall back to local buffer.
 */
export async function sendToApi(event: EnrichedAuditEvent, config: AuditConfig): Promise<void> {
  if (!config.auditApiBaseUrl) {
    throw new Error('[audit-logger] AUDIT_API_BASE_URL is not configured.');
  }

  const url = `${config.auditApiBaseUrl.replace(/\/$/, '')}/audit/log`;

  await withRetry(
    async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.auditApiTimeoutMs);

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.auditApiKey
              ? { Authorization: `Bearer ${config.auditApiKey}` }
              : {}),
          },
          body: JSON.stringify(event),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
          `[audit-logger] Audit API returned ${response.status}: ${body}`,
        );
      }
    },
    config.retryLimit,
    config.retryDelayMs,
    'ApiTransport',
    config,
  );

  sdkLog(config, 'debug', `Event sent to Audit API: ${url}`);
}
