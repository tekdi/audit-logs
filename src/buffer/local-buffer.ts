import * as fs from 'fs/promises';
import * as path from 'path';
import { AuditConfig } from '../config/audit-config';
import { EnrichedAuditEvent } from '../types/audit-event';
import { sdkLog } from '../utils/sdk-utils';

// ---------------------------------------------------------------------------
// In-memory ring buffer (Pointer-based for O(1) ops)
// ---------------------------------------------------------------------------

class RingBuffer<T> {
  private items: (T | undefined)[];
  private head = 0;
  private tail = 0;
  private length = 0;

  constructor(private readonly maxSize: number) {
    this.items = new Array(maxSize);
  }

  push(item: T): void {
    this.items[this.tail] = item;
    this.tail = (this.tail + 1) % this.maxSize;
    if (this.length < this.maxSize) {
      this.length++;
    } else {
      // Overwriting oldest entry, move head
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  drain(): T[] {
    const all: T[] = [];
    for (let i = 0; i < this.length; i++) {
      all.push(this.items[(this.head + i) % this.maxSize] as T);
    }
    this.items.fill(undefined);
    this.head = 0;
    this.tail = 0;
    this.length = 0;
    return all;
  }

  get size(): number {
    return this.length;
  }
}

// ---------------------------------------------------------------------------
// File-based persistent buffer
// ---------------------------------------------------------------------------

async function ensureDir(filePath: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
}

/** Reads NDJSON file and returns array of events */
async function readNdjson(filePath: string): Promise<EnrichedAuditEvent[]> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return raw
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as EnrichedAuditEvent);
  } catch (err: any) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

/** Appends a single event to NDJSON file */
async function appendNdjson(filePath: string, event: EnrichedAuditEvent): Promise<void> {
  await ensureDir(filePath);
  await fs.appendFile(filePath, JSON.stringify(event) + '\n', 'utf-8');
}

/** Overwrites NDJSON file with multiple events */
async function writeNdjson(filePath: string, events: EnrichedAuditEvent[]): Promise<void> {
  await ensureDir(filePath);
  const data = events.map((e) => JSON.stringify(e)).join('\n') + (events.length > 0 ? '\n' : '');
  await fs.writeFile(filePath, data, 'utf-8');
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
  async store(event: EnrichedAuditEvent): Promise<void> {
    if (this.config.localStorageType === 'file') {
      // For file-based, we use NDJSON appends for O(1)
      // Note: Strict maxSize enforcement here would require a full read/write,
      // so we enforce maxSize during drain() to maintain O(1) appends here.
      await appendNdjson(this.config.localStoragePath, event);
    } else {
      this.memBuffer.push(event);
    }
    sdkLog(this.config, 'debug', `Event buffered locally. Buffer size incremented.`);
  }

  /** Drain all buffered events (empty and return them). */
  async drain(): Promise<EnrichedAuditEvent[]> {
    if (this.config.localStorageType === 'file') {
      const events = await readNdjson(this.config.localStoragePath);
      await writeNdjson(this.config.localStoragePath, []); // Clear file
      
      // Enforce max size on the events we just read (in case file grew too large)
      if (events.length > this.config.localStorageMaxSize) {
        return events.slice(-this.config.localStorageMaxSize);
      }
      return events;
    }
    return this.memBuffer.drain();
  }

  /** Current buffer size (approximate for file). */
  async getSize(): Promise<number> {
    if (this.config.localStorageType === 'file') {
      const events = await readNdjson(this.config.localStoragePath);
      return events.length;
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
      const currentSize = await this.getSize();
      if (currentSize === 0) {
        // Nothing buffered — sleep and try again
        this.flushTimer = setTimeout(() => { void poll(1); }, this.config.retryDelayMs * 2);
        return;
      }

      if (this.flushing) return;
      this.flushing = true;

      const buffered = await this.drain();
      try {
        await flushFn(buffered);
        sdkLog(this.config, 'info', `Local buffer flushed ${buffered.length} event(s) successfully.`);
        this.flushing = false;
        this.flushTimer = setTimeout(() => { void poll(1); }, this.config.retryDelayMs * 2);
      } catch {
        // Re-buffer everything we failed to flush
        // Batch re-buffering to avoid O(N^2)
        if (this.config.localStorageType === 'file') {
            await writeNdjson(this.config.localStoragePath, buffered);
        } else {
            buffered.forEach(e => this.memBuffer.push(e));
        }
        
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
