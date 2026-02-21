/**
 * Idempotency Tracker for Duplicate Message Detection
 *
 * Per RESEARCH.md Pattern 4: Track processed idempotency keys to discard
 * duplicates from QoS 1 re-deliveries. Enables at-least-once delivery
 * without duplicate work (COMM-04).
 *
 * Per RESEARCH.md: 5-minute deduplication window balances memory and
 * re-delivery window. Emergency reset at 10000 entries prevents memory
 * exhaustion from message storms.
 */

import type { MessageEnvelope } from '../communication/message.js';

/**
 * Entry tracking when an idempotency key was processed.
 */
interface ProcessedEntry {
  /** Unix timestamp (milliseconds) when the key was processed */
  timestamp: number;
}

/**
 * Idempotency tracker for duplicate message detection.
 *
 * Per COMM-04: All task-related messages use idempotency keys to prevent
 * duplicate processing. Tracks processed keys in-memory with automatic
 * cleanup of expired entries.
 *
 * Per RESEARCH.md Pitfall 4: Missing idempotency causes incorrect state
 * from duplicate messages. This tracker ensures each message is processed
 * at most once.
 */
export class IdempotencyTracker {
  /** Set of processed idempotency keys with timestamps */
  private processed: Map<string, ProcessedEntry>;

  /** Deduplication window in milliseconds (5 minutes per RESEARCH.md) */
  private readonly windowMs: number;

  /** Maximum entries before emergency reset (prevents memory exhaustion) */
  private readonly maxEntries: number;

  /** Cleanup interval in milliseconds (60 seconds per plan) */
  private readonly cleanupIntervalMs: number;

  /** Interval timer for cleanup */
  private cleanupTimer: NodeJS.Timeout | null;

  /**
   * Creates a new idempotency tracker.
   * @param windowMs - Deduplication window in milliseconds (default 5 minutes)
   */
  constructor(windowMs: number = 5 * 60 * 1000) {
    this.processed = new Map();
    this.windowMs = windowMs;
    this.maxEntries = 10000;
    this.cleanupIntervalMs = 60000; // 60 seconds
    this.cleanupTimer = null;

    // Start automatic cleanup
    this.startCleanup();
  }

  /**
   * Checks if a message should be processed (duplicate detection).
   *
   * Per COMM-04: Returns false if idempotency key was already processed
   * (duplicate), true if new. Adds new keys to tracking set.
   *
   * @param message - Message envelope to check
   * @returns true if message should be processed, false if duplicate
   */
  shouldProcess(message: MessageEnvelope): boolean {
    const key = message.idempotencyKey;

    // Missing idempotency key - always process (legacy messages)
    if (!key) {
      return true;
    }

    const existing = this.processed.get(key);

    // Check if already processed
    if (existing) {
      // Check if entry is expired (still within window?)
      const now = Date.now();
      if (now - existing.timestamp < this.windowMs) {
        // Within window - duplicate detected
        return false;
      }
      // Entry expired - will be replaced below
    }

    // Mark as processed
    this.processed.set(key, {
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Cleanup old entries outside the deduplication window.
   *
   * Per plan specification: Removes entries older than windowMs.
   * Performs emergency reset if size exceeds maxEntries.
   */
  private cleanup(): void {
    const now = Date.now();

    // Emergency reset if map is too large
    if (this.processed.size > this.maxEntries) {
      this.processed.clear();
      return;
    }

    // Remove entries older than window
    const cutoffTime = now - this.windowMs;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.processed.entries()) {
      if (entry.timestamp < cutoffTime) {
        keysToDelete.push(key);
      }
    }

    // Delete expired entries
    for (const key of keysToDelete) {
      this.processed.delete(key);
    }
  }

  /**
   * Starts automatic cleanup interval.
   * Runs every 60 seconds per plan specification.
   */
  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);

    // Don't block process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stops automatic cleanup interval.
   * Call during graceful shutdown.
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Gets current number of tracked entries.
   * Useful for monitoring memory usage.
   */
  get size(): number {
    return this.processed.size;
  }

  /**
   * Clears all tracked entries.
   * Useful for testing or manual reset.
   */
  clear(): void {
    this.processed.clear();
  }
}

/**
 * Convenience function to create an idempotency tracker.
 * @param windowMs - Deduplication window in milliseconds (default 5 minutes)
 * @returns New IdempotencyTracker instance
 */
export function createIdempotencyTracker(
  windowMs: number = 5 * 60 * 1000
): IdempotencyTracker {
  return new IdempotencyTracker(windowMs);
}
