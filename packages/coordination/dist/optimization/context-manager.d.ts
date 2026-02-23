/**
 * Context Manager - Hash-based context reference passing
 *
 * Per OPTI-05: Context payloads larger than 10KB are passed by reference ID
 * instead of full content to reduce bandwidth and improve throughput.
 *
 * Per OPTI-06: Context manager stores large contexts in SQLite with hash-based
 * deduplication using SHA-256 hash as reference ID and primary key.
 *
 * Per 07-RESEARCH.md Pattern 3: WITHOUT ROWID optimization for hash primary key.
 * Per 07-RESEARCH.md: Don't hand-roll crypto - use built-in crypto.createHash('sha256').
 */
import Database from 'better-sqlite3';
/**
 * Context reference for message payloads.
 *
 * Contains the SHA-256 hash as reference ID, original size, and compression flag.
 * When included in a task payload, the receiver retrieves the full content via
 * ContextManager.getContext(ref).
 */
export interface ContextReference {
    /** SHA-256 hash as hex string (64 characters) */
    ref: string;
    /** Original content size in bytes */
    size: number;
    /** Whether content is compressed (currently always false) */
    compressed: boolean;
}
/**
 * Context manager configuration options.
 */
export interface ContextOptions {
    /** Size threshold for reference passing in bytes (default: 10KB per OPTI-05) */
    thresholdBytes?: number;
    /** Compress content before storage (default: false, can add zlib later) */
    enableCompression?: boolean;
    /** Garbage collection retention in days (default: 7 per 07-RESEARCH.md) */
    retentionDays?: number;
}
/**
 * Context manager for hash-based context storage and retrieval.
 *
 * Stores large contexts (>10KB) in SQLite with SHA-256 hash as primary key.
 * Provides automatic deduplication via hash collision detection and access
 * tracking for garbage collection.
 *
 * Per 07-RESEARCH.md Pattern 3: Hash-based deduplication using WITHOUT ROWID.
 * Per 07-RESEARCH.md: Start with 7-day TTL, monitor usage, adjust based on disk space.
 *
 * @example
 * ```ts
 * const contextManager = new ContextManager(db, { thresholdBytes: 10240 });
 *
 * // Store large context and get reference
 * const content = Buffer.from(largeJsonString);
 * const ref = contextManager.storeContext(content);
 * if (ref) {
 *   console.log(`Stored ${ref.size} bytes as ${ref.ref}`);
 * }
 *
 * // Retrieve context by reference
 * const retrieved = contextManager.getContext(ref.ref);
 * if (retrieved) {
 *   console.log(`Retrieved ${retrieved.length} bytes`);
 * }
 *
 * // Run garbage collection periodically
 * const deleted = contextManager.runGarbageCollection();
 * console.log(`Deleted ${deleted} old contexts`);
 * ```
 */
export declare class ContextManager {
    private db;
    private options;
    constructor(db: Database.Database, options?: ContextOptions);
    /**
     * Store context content and return reference if large enough.
     *
     * Only stores content above the threshold (default 10KB per OPTI-05).
     * Returns null for small content that should be sent inline.
     *
     * Automatic deduplication: If content with same hash exists, updates
     * access_count and last_accessed instead of storing duplicate.
     *
     * @param content - Context content as Buffer
     * @returns ContextReference if stored, null if content too small
     */
    storeContext(content: Buffer): ContextReference | null;
    /**
     * Retrieve context content by reference hash.
     *
     * Returns null if reference not found (may have been garbage collected).
     * Updates access tracking (access_count, last_accessed) on every retrieval.
     *
     * @param ref - SHA-256 hash as hex string (from ContextReference.ref)
     * @returns Context content as Buffer, or null if not found
     */
    getContext(ref: string): Buffer | null;
    /**
     * Check if content should use reference passing based on size threshold.
     *
     * @param content - Content buffer to check
     * @returns true if content is large enough for reference passing
     */
    shouldUseReference(content: Buffer): boolean;
    /**
     * Run garbage collection to clean up old contexts.
     *
     * Per 07-RESEARCH.md Open Question 2: Delete contexts unused > 7 days OR
     * with low access count (<3) AND old (>3 days).
     *
     * @returns Number of contexts deleted
     */
    runGarbageCollection(): number;
    /**
     * Get context storage statistics.
     *
     * @returns Statistics about stored contexts
     */
    getStats(): {
        totalContexts: number;
        totalBytes: number;
        thresholdBytes: number;
        retentionDays: number;
    };
    /**
     * Compress content (placeholder for future zlib integration).
     * Currently returns content uncompressed.
     */
    private compressContent;
    /**
     * Decompress content (placeholder for future zlib integration).
     * Currently returns content as-is.
     */
    private decompressContent;
}
/**
 * Prepare message payload by replacing large content with context reference.
 *
 * Checks if payload has large context content, stores it via ContextManager,
 * and replaces inline content with reference ID if above threshold.
 *
 * Per OPTI-05: Context payloads >10KB passed by reference ID.
 *
 * @param payload - Message payload to prepare
 * @param contextManager - Context manager instance
 * @returns Prepared payload with context reference (if large) or unchanged
 */
export declare function prepareMessagePayload(payload: any, contextManager: ContextManager): Promise<any>;
/**
 * Resolve message payload by replacing context reference with actual content.
 *
 * Checks if payload has context reference, retrieves content via ContextManager,
 * and replaces reference with actual content.
 *
 * @param payload - Message payload to resolve
 * @param contextManager - Context manager instance
 * @returns Resolved payload with actual content (if reference) or unchanged
 */
export declare function resolveMessagePayload(payload: any, contextManager: ContextManager): Promise<any>;
//# sourceMappingURL=context-manager.d.ts.map