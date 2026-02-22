/**
 * SQLite Database Connection Management
 *
 * Provides singleton database connection with WAL mode enabled for concurrent access.
 * Uses better-sqlite3 for synchronous database operations.
 *
 * Per RESEARCH.md Pattern 1 and STATE-04 (WAL mode requirement).
 */
import Database from 'better-sqlite3';
/**
 * Database connection options for optimal performance on resource-constrained hardware.
 */
export interface DatabaseOptions {
    /** Path to the SQLite database file */
    dbPath: string;
    /** Enable WAL mode for concurrent access (default: true) */
    walMode?: boolean;
    /** Cache size in KB (default: 32000 = 32MB) */
    cacheSize?: number;
    /** Autocheckpoint threshold in WAL frames (default: 1000) */
    walAutocheckpoint?: number;
}
/**
 * Creates or retrieves the singleton database connection.
 *
 * @param options - Database connection options
 * @returns Database instance
 * @throws Error if database cannot be opened or initialized
 *
 * @example
 * ```ts
 * const db = createDatabase({ dbPath: '/var/lib/openclaw-swarm/state.db' });
 * ```
 */
export declare function createDatabase(options: DatabaseOptions): Database.Database;
/**
 * Returns the existing database connection without creating a new one.
 *
 * @returns Database instance or null if not initialized
 */
export declare function getDatabase(): Database.Database | null;
/**
 * Closes the database connection gracefully.
 *
 * Should be called during shutdown to ensure all data is flushed.
 * After calling this, you must call createDatabase again to resume operations.
 *
 * @throws Error if database is not open or close fails
 *
 * @example
 * ```ts
 * process.on('SIGTERM', async () => {
 *   await closeDatabase(db);
 *   process.exit(0);
 * });
 * ```
 */
export declare function closeDatabase(db?: Database.Database): void;
/**
 * Checks if the database connection is open and valid.
 *
 * @returns true if database is connected and responsive
 */
export declare function isDatabaseConnected(): boolean;
/**
 * Gets database file size in bytes.
 *
 * Useful for monitoring the 50MB limit requirement (STATE-05).
 *
 * @param dbPath - Path to the database file
 * @returns File size in bytes, or 0 if file doesn't exist
 */
export declare function getDatabaseSize(dbPath: string): number;
/**
 * Gets database statistics for monitoring.
 *
 * @returns Database statistics including size and WAL info
 */
export declare function getDatabaseStats(): {
    walSize: number;
    checkpointedFrames: number;
    currentWalSize: number;
} | null;
//# sourceMappingURL=database.d.ts.map