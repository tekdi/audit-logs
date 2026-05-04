import * as fs from 'fs';
import * as path from 'path';
import { AuditConfig } from '../config/audit-config';
import { EnrichedAuditEvent } from '../types/audit-event';
import { sdkLog, sleep } from '../utils/sdk-utils';

// ---------------------------------------------------------------------------
// In-memory ring buffer
// ---------------------------------------------------------------------------

class RingBuffer<T> {
  private items: T[] = [];
  constructor(private readonly maxSize: number) {}

  push(item: T): void {
    if (this.items.length >= this.maxSize) {
      this.items.shift(); // drop oldest
    }
    this.items.push(item);
  }

  drain(): T[] {
    const all = [...this.items];
    this.items = [];
    return all;
  }

  get size(): number {
    return this.items.length;
  }
}

// ---------------------------------------------------------------------------
// File-based persistent buffer
// ---------------------------------------------------------------------------

function readFile(filePath: string): EnrichedAuditEvent[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as EnrichedAuditEvent[];
  } catch {
    return [];
  }
}

function writeFile(filePath: string, events: EnrichedAuditEvent[]): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(events, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// LocalBuffer — public interface
// ---------------------------------------------------------------------------

type FlushFn = (events: EnrichedAuditEvent[]) => Promise<void>;

export class LocalBuffer {
  private readonly memBuffer: RingBuffer<EnrichedAuditEvent>;
  private flushTimer: NodeJS.Timeout | null = null;
  private flushing = false;

  constructor(private readonly config: AuditConfig) {
    this.memBuffer = new RingBuffer<EnrichedAuditEvent>(config.localStorageMaxSize);
  }

  /** Store an event in the buffer. */
  store(event: EnrichedAuditEvent): void {
    if (this.config.localStorageType === 'file') {
      const events = readFile(this.config.localStoragePath);
      if (events.length >= this.config.localStorageMaxSize) {
        events.shift(); // drop oldest to enforce max size
      }
      events.push(event);
      writeFile(this.config.localStoragePath, events);
    } else {
      this.memBuffer.push(event);
    }
    sdkLog(this.config, 'debug', `Event buffered locally. Buffer size: ${this.getSize()}`);
  }

  /** Drain all buffered events (empty and return them). */
  drain(): EnrichedAuditEvent[] {
    if (this.config.localStorageType === 'file') {
      const events = readFile(this.config.localStoragePath);
      writeFile(this.config.localStoragePath, []);
      return events;
    }
    return this.memBuffer.drain();
  }

  /** Current buffer size. */
  getSize(): number {
    if (this.config.localStorageType === 'file') {
      return readFile(this.config.localStoragePath).length;
    }
    return this.memBuffer.size;
  }

  /**
   * Start the background flush loop.
   * The flushFn should try all transports and throw if all fail.
   */
  startFlushLoop(flushFn: FlushFn): void {
    if (this.flushTimer) return;

    const poll = async (delayMultiplier = 1) => {
      if (this.getSize() === 0) {
        // Nothing buffered — sleep and try again
        this.flushTimer = setTimeout(() => { void poll(1); }, this.config.retryDelayMs * 2);
        return;
      }

      if (this.flushing) return;
      this.flushing = true;

      const buffered = this.drain();
      try {
        await flushFn(buffered);
        sdkLog(this.config, 'info', `Local buffer flushed ${buffered.length} event(s) successfully.`);
        this.flushing = false;
        this.flushTimer = setTimeout(() => { void poll(1); }, this.config.retryDelayMs * 2);
      } catch {
        // Re-buffer everything we failed to flush
        buffered.forEach(e => this.store(e));
        this.flushing = false;
        const newDelay = Math.min(this.config.retryDelayMs * 2 * delayMultiplier, 60_000);
        sdkLog(this.config, 'warn', `Buffer flush failed. Retrying in ${newDelay}ms…`);
        this.flushTimer = setTimeout(() => { void poll(delayMultiplier * 2); }, newDelay);
      }
    };

    void poll();
  }

  /** Stop the background flush loop. */
  stopFlushLoop(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
