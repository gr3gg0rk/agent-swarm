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
export declare class IdempotencyTracker {
    /** Set of processed idempotency keys with timestamps */
    private processed;
    /** Deduplication window in milliseconds (5 minutes per RESEARCH.md) */
    private readonly windowMs;
    /** Maximum entries before emergency reset (prevents memory exhaustion) */
    private readonly maxEntries;
    /** Cleanup interval in milliseconds (60 seconds per plan) */
    private readonly cleanupIntervalMs;
    /** Interval timer for cleanup */
    private cleanupTimer;
    /**
     * Creates a new idempotency tracker.
     * @param windowMs - Deduplication window in milliseconds (default 5 minutes)
     */
    constructor(windowMs?: number);
    /**
     * Checks if a message should be processed (duplicate detection).
     *
     * Per COMM-04: Returns false if idempotency key was already processed
     * (duplicate), true if new. Adds new keys to tracking set.
     *
     * @param message - Message envelope to check
     * @returns true if message should be processed, false if duplicate
     */
    shouldProcess(message: MessageEnvelope): boolean;
    /**
     * Cleanup old entries outside the deduplication window.
     *
     * Per plan specification: Removes entries older than windowMs.
     * Performs emergency reset if size exceeds maxEntries.
     */
    private cleanup;
    /**
     * Starts automatic cleanup interval.
     * Runs every 60 seconds per plan specification.
     */
    private startCleanup;
    /**
     * Stops automatic cleanup interval.
     * Call during graceful shutdown.
     */
    stop(): void;
    /**
     * Gets current number of tracked entries.
     * Useful for monitoring memory usage.
     */
    get size(): number;
    /**
     * Clears all tracked entries.
     * Useful for testing or manual reset.
     */
    clear(): void;
}
/**
 * Convenience function to create an idempotency tracker.
 * @param windowMs - Deduplication window in milliseconds (default 5 minutes)
 * @returns New IdempotencyTracker instance
 */
export declare function createIdempotencyTracker(windowMs?: number): IdempotencyTracker;
//# sourceMappingURL=idempotency.d.ts.map