import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { AuditLogger, AuditLoggerOptions } from '../audit-logger';
import { AuditEvent } from '../types/audit-event';

@Injectable()
export class AuditLoggerService implements OnApplicationShutdown {
  private readonly logger: AuditLogger;

  constructor(options: AuditLoggerOptions) {
    this.logger = new AuditLogger(options);
  }

  /**
   * Emit an audit event.
   * Resolves when the event is accepted by a transport or buffered locally.
   */
  async emit(event: AuditEvent): Promise<void> {
    return this.logger.emit(event);
  }

  // --- Convenience methods ---

  async created(
    entityType: string,
    entityId: string,
    actor: { id: string; name: string; role: string },
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    return this.logger.created(entityType, entityId, actor, metadata);
  }

  async updated(
    entityType: string,
    entityId: string,
    actor: { id: string; name: string; role: string },
    diff?: { oldValue?: Record<string, unknown>; newValue?: Record<string, unknown> },
  ): Promise<void> {
    return this.logger.updated(entityType, entityId, actor, diff);
  }

  async deleted(
    entityType: string,
    entityId: string,
    actor: { id: string; name: string; role: string },
  ): Promise<void> {
    return this.logger.deleted(entityType, entityId, actor);
  }

  async loginSuccess(
    userId: string,
    actor: { name: string; role: string },
    context?: AuditEvent['context'],
  ): Promise<void> {
    return this.logger.loginSuccess(userId, actor, context);
  }

  async loginFailure(
    email: string,
    reason: string,
    context?: AuditEvent['context'],
  ): Promise<void> {
    return this.logger.loginFailure(email, reason, context);
  }

  /** Lifecycle hook: ensure Kafka producer disconnects and buffer flush stops. */
  async onApplicationShutdown(): Promise<void> {
    await this.logger.shutdown();
  }
}
