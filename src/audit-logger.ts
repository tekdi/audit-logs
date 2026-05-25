import { buildConfig, AuditConfig } from './config/audit-config';
import { AuditEvent, EnrichedAuditEvent } from './types/audit-event';
import { shouldCapture } from './filter/event-filter';
import { processPii } from './pii/pii-processor';
import { resolveMessage } from './templates/template-resolver';
import { KafkaTransport } from './transports/kafka-transport';
import { sendToApi } from './transports/api-transport';
import { LocalBuffer } from './buffer/local-buffer';
import { enrich, sdkLog } from './utils/sdk-utils';

export interface AuditLoggerOptions extends Partial<AuditConfig> {}

/**
 * AuditLogger — the main class that orchestrates the full audit pipeline.
 *
 * Pipeline per event:
 *   1. Validate required fields
 *   2. Apply include / exclude filter
 *   3. Enrich (add serviceName, eventType, timestamp)
 *   4. Mask / hash / encrypt PII fields
 *   5. Resolve human message / template key
 *   6. Dispatch via transport chain (Kafka → API → Local Buffer)
 */
export class AuditLogger {
  readonly config: AuditConfig;
  private readonly buffer: LocalBuffer;
  private readonly kafkaTransport: KafkaTransport;

  constructor(options: AuditLoggerOptions = {}) {
    this.config = buildConfig(options);
    this.buffer = new LocalBuffer(this.config);
    this.kafkaTransport = new KafkaTransport(this.config);

    if (this.config.localStorageEnabled) {
      this.buffer.startFlushLoop(events => this.flushBuffered(events));
    }
  }

  // -------------------------------------------------------------------------
  // Core emit
  // -------------------------------------------------------------------------

  /**
   * Emit a single audit event through the full pipeline.
   * Resolves when the event has been accepted by at least one transport, or buffered locally.
   */
  async emit(event: AuditEvent): Promise<void> {
    if (!this.config.enabled) return;

    // Step 1: validate
    if (!event.entityType || !event.eventAction) {
      throw new Error('[audit-logger] emit() requires entityType and eventAction.');
    }

    // Step 2: filter
    if (!shouldCapture(event, this.config)) {
      sdkLog(this.config, 'debug', `Event suppressed by filter: ${event.entityType}.${event.eventAction}`);
      return;
    }

    // Step 3: enrich
    const enriched: EnrichedAuditEvent = enrich(event, this.config);

    // Step 4: PII
    const safe = processPii(enriched, this.config) as EnrichedAuditEvent;

    // Step 5: human message
    safe.humanMessage = resolveMessage(safe, this.config);

    // Step 6: transport chain
    await this.dispatch(safe);
  }

  // -------------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------------

  async created(
    entityType: string,
    entityId: string,
    actor: { id: string; name: string; role: string },
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.emit({
      entityType,
      eventAction: `${entityType}_CREATED`,
      eventType: 'CREATE',
      entityId,
      actorId: actor.id,
      actorName: actor.name,
      userRole: actor.role,
      metadata,
    });
  }

  async updated(
    entityType: string,
    entityId: string,
    actor: { id: string; name: string; role: string },
    diff?: { oldValue?: Record<string, unknown>; newValue?: Record<string, unknown> },
  ): Promise<void> {
    return this.emit({
      entityType,
      eventAction: `${entityType}_UPDATED`,
      eventType: 'UPDATE',
      entityId,
      actorId: actor.id,
      actorName: actor.name,
      userRole: actor.role,
      metadata: diff,
    });
  }

  async deleted(
    entityType: string,
    entityId: string,
    actor: { id: string; name: string; role: string },
  ): Promise<void> {
    return this.emit({
      entityType,
      eventAction: `${entityType}_DELETED`,
      eventType: 'DELETE',
      entityId,
      actorId: actor.id,
      actorName: actor.name,
      userRole: actor.role,
    });
  }

  async loginSuccess(
    userId: string,
    actor: { name: string; role: string },
    context?: AuditEvent['context'],
  ): Promise<void> {
    return this.emit({
      entityType: 'USER',
      eventAction: 'LOGIN_SUCCESS',
      eventType: 'AUTH',
      entityId: userId,
      actorId: userId,
      actorName: actor.name,
      userRole: actor.role,
      status: 'SUCCESS',
      context,
    });
  }

  async loginFailure(
    email: string,
    reason: string,
    context?: AuditEvent['context'],
  ): Promise<void> {
    return this.emit({
      entityType: 'USER',
      eventAction: 'LOGIN_FAILURE',
      eventType: 'AUTH',
      status: 'FAILED',
      metadata: { email, reason },
      context,
    });
  }

  // -------------------------------------------------------------------------
  // Transport chain
  // -------------------------------------------------------------------------

  private async dispatch(event: EnrichedAuditEvent): Promise<void> {
    const mode = this.config.mode;

    // kafka-only mode
    if (mode === 'kafka') {
      try {
        await this.kafkaTransport.send(event);
        return;
      } catch (err) {
        if (this.config.sdkLogFailures) {
          sdkLog(this.config, 'warn', `Kafka failed (kafka-only mode): ${String(err)}`);
        }
        await this.bufferLocally(event);
        return;
      }
    }

    // api-only mode
    if (mode === 'api') {
      try {
        await sendToApi(event, this.config);
        return;
      } catch (err) {
        if (this.config.sdkLogFailures) {
          sdkLog(this.config, 'warn', `API failed (api-only mode): ${String(err)}`);
        }
        await this.bufferLocally(event);
        return;
      }
    }

    // hybrid mode: Kafka → API → Buffer
    try {
      await this.kafkaTransport.send(event);
      return;
    } catch (kafkaErr) {
      if (this.config.sdkLogFailures) {
        sdkLog(this.config, 'warn', `Kafka failed, falling back to API: ${String(kafkaErr)}`);
      }
    }

    if (this.config.auditApiEnabled) {
      try {
        await sendToApi(event, this.config);
        return;
      } catch (apiErr) {
        if (this.config.sdkLogFailures) {
          sdkLog(this.config, 'warn', `API also failed, buffering locally: ${String(apiErr)}`);
        }
      }
    }

    await this.bufferLocally(event);
  }

  private async bufferLocally(event: EnrichedAuditEvent): Promise<void> {
    if (!this.config.localStorageEnabled) {
      sdkLog(this.config, 'error', 'All transports failed and local buffer is disabled. Event DROPPED.');
      return;
    }
    await this.buffer.store(event);
    sdkLog(this.config, 'warn', `Event buffered locally. Current buffer size: ${await this.buffer.getSize()}`);
  }

  private async flushBuffered(events: EnrichedAuditEvent[]): Promise<void> {
    // Try each event individually; throw if any fails so the buffer re-queues
    for (const event of events) {
      await this.dispatch(event);
    }
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Gracefully disconnect Kafka producer and stop the buffer flush loop. */
  async shutdown(): Promise<void> {
    this.buffer.stopFlushLoop();
    await this.kafkaTransport.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Factory function (plain Node.js / Express usage)
// ---------------------------------------------------------------------------

export function createAuditLogger(options?: AuditLoggerOptions): AuditLogger {
  return new AuditLogger(options);
}
