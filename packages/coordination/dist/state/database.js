/**
 * SQLite Database Connection Management
 *
 * Provides singleton database connection with WAL mode enabled for concurrent access.
 * Uses better-sqlite3 for synchronous database operations.
 *
 * Per RESEARCH.md Pattern 1 and STATE-04 (WAL mode requirement).
 */
import Database from 'better-sqlite3';
import * as fs from 'fs';
import path from 'path';
/**
 * Singleton database connection instance.
 * better-sqlite3 is synchronous and thread-safe, so a single connection
 * is recommended for optimal performance.
 */
let dbInstance = null;
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
export function createDatabase(options) {
    if (dbInstance) {
        return dbInstance;
    }
    const { dbPath, walMode = true, cacheSize = 32000, walAutocheckpoint = 1000, } = options;
    // Ensure directory exists (synchronous)
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });
    // Open database connection
    let db;
    try {
        db = new Database(dbPath, {
            // Enable verbose logging in development
            verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
        });
    }
    catch (error) {
        throw new Error(`Failed to open database at ${dbPath}: ${error instanceof Error ? error.message : String(error)}

Fix: Check database file and directory:
  1. Verify directory exists: ls -la ${dir}
  2. Check file permissions: chmod 755 ${dir}
  3. Ensure sufficient disk space: df -h
  4. Check for database lock: lsof ${dbPath} (remove .wal and .shm files if needed)
`);
    }
    // Set performance pragmas
    db.pragma('synchronous = NORMAL'); // Balance between safety and performance
    db.pragma(`cache_size = ${cacheSize}`); // 32MB cache
    db.pragma(`wal_autocheckpoint = ${walAutocheckpoint}`); // Autocheckpoint at 1000 frames
    // Enable WAL mode for concurrent access
    if (walMode) {
        const result = db.pragma('journal_mode = WAL', { simple: true });
        if (result !== 'wal') {
            throw new Error(`Pragma journal_mode failed: expected WAL, got ${result}

Fix: Ensure database directory is writable:
  1. Check directory permissions: ls -ld ${dir}
  2. Fix permissions: chmod 755 ${dir}
  3. Avoid network filesystems: WAL requires file locking
  4. Check filesystem: df -T ${dir} (NFS/CIFS may not support WAL)

Alternative: Disable WAL mode by passing { walMode: false } to createDatabase()
`);
        }
    }
    // Additional optimizations for embedded use
    db.pragma('temp_store = MEMORY'); // Use memory for temp tables
    db.pragma('mmap_size = 30000000000'); // Enable memory-mapped I/O up to 30GB
    db.pragma('page_size = 4096'); // Match typical filesystem block size
    dbInstance = db;
    return db;
}
/**
 * Returns the existing database connection without creating a new one.
 *
 * @returns Database instance or null if not initialized
 */
export function getDatabase() {
    return dbInstance;
}
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
export function closeDatabase(db) {
    const database = db || dbInstance;
    if (!database) {
        throw new Error(`Database is not open

Fix: Call createDatabase() before closeDatabase()
Example:
  const db = createDatabase({ dbPath: '/path/to/state.db' });
  // ... use database ...
  closeDatabase(db);
`);
    }
    database.close();
    dbInstance = null;
}
/**
 * Checks if the database connection is open and valid.
 *
 * @returns true if database is connected and responsive
 */
export function isDatabaseConnected() {
    if (!dbInstance) {
        return false;
    }
    try {
        // Simple query to verify connection
        dbInstance.prepare('SELECT 1 AS test').get();
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Gets database file size in bytes.
 *
 * Useful for monitoring the 50MB limit requirement (STATE-05).
 *
 * @param dbPath - Path to the database file
 * @returns File size in bytes, or 0 if file doesn't exist
 */
export function getDatabaseSize(dbPath) {
    try {
        const stats = fs.statSync(dbPath);
        return stats.size;
    }
    catch {
        return 0;
    }
}
/**
 * Gets database statistics for monitoring.
 *
 * @returns Database statistics including size and WAL info
 */
export function getDatabaseStats() {
    if (!dbInstance) {
        return null;
    }
    try {
        const walSize = dbInstance.pragma('wal_size', { simple: true });
        const checkpointedFrames = dbInstance.pragma('wal_checkpoint(PASSIVE)', { simple: true });
        const currentWalSize = dbInstance.pragma('journal_mode', { simple: true });
        return {
            walSize,
            checkpointedFrames: typeof checkpointedFrames === 'number' ? checkpointedFrames : 0,
            currentWalSize: typeof currentWalSize === 'number' ? currentWalSize : 0,
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=database.js.map