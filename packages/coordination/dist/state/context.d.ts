/**
 * Project Context Storage
 *
 * Provides centralized key-value storage for project context.
 * Context values are stored as JSON strings for flexibility.
 *
 * Per STATE-03 (project context stored centrally).
 */
import Database from 'better-sqlite3';
/**
 * Context entry from database.
 */
export interface ContextEntry {
    /** Context key */
    key: string;
    /** Context value (JSON string) */
    value: string;
    /** Last update timestamp (Unix seconds) */
    updatedAt: number;
}
/**
 * Project context store with prepared statement caching.
 *
 * Stores arbitrary JSON-serializable values keyed by string.
 * All operations are synchronous and thread-safe.
 */
export declare class ContextStore {
    private upsertStmt;
    private selectStmt;
    private selectAllStmt;
    private deleteStmt;
    constructor(db: Database.Database);
    /**
     * Store a context value.
     *
     * Values are JSON-serialized before storage.
     * Existing keys are updated (UPSERT).
     *
     * @param key - Context key
     * @param value - Value to store (must be JSON-serializable)
     */
    setContext(key: string, value: unknown): void;
    /**
     * Retrieve a context value.
     *
     * Values are parsed from JSON.
     *
     * @param key - Context key
     * @returns Parsed value or null if not found
     */
    getContext<T = unknown>(key: string): T | null;
    /**
     * Get all context entries as a record.
     *
     * @returns Object with all context key-value pairs
     */
    getAllContext(): Record<string, unknown>;
    /**
     * Delete a context key.
     *
     * @param key - Context key to delete
     * @returns true if key was deleted, false if not found
     */
    deleteContext(key: string): boolean;
    /**
     * Get context entry with metadata.
     *
     * @param key - Context key
     * @returns Context entry or null if not found
     */
    getContextEntry(key: string): ContextEntry | null;
    /**
     * Get multiple context keys at once.
     *
     * @param keys - Array of context keys
     * @returns Record of found keys with their values
     */
    getMultipleContext(keys: string[]): Record<string, unknown>;
    /**
     * Set multiple context keys at once.
     *
     * Uses a transaction for atomicity.
     *
     * @param entries - Record of key-value pairs
     */
    setMultipleContext(entries: Record<string, unknown>): void;
    /**
     * Get total context entry count.
     *
     * @returns Number of stored context entries
     */
    getContextCount(): number;
}
/**
 * Factory function to create context store instance.
 *
 * @param db - Database instance
 * @returns ContextStore instance
 */
export declare function createContextStore(db: Database.Database): ContextStore;
//# sourceMappingURL=context.d.ts.map