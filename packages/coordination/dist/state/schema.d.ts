/**
 * Database Schema Initialization
 *
 * Creates and manages the database schema for task queue, agent status,
 * project context, and archive tables. Uses WAL mode for concurrent access.
 *
 * Per RESEARCH.md Pattern 1 and STATE-04 (WAL mode requirement).
 */
import Database from 'better-sqlite3';
/**
 * Initializes the database schema with all required tables and indexes.
 *
 * Creates:
 * - tasks: Task queue for agent coordination
 * - agent_status: Real-time agent heartbeat tracking
 * - project_context: Centralized project state storage
 * - tasks_archive: Historical task records
 * - status_archive: Historical agent status records
 *
 * All tables use IF NOT EXISTS for idempotency.
 *
 * @param db - Database instance to initialize
 * @throws Error if schema initialization fails
 *
 * @example
 * ```ts
 * const db = createDatabase({ dbPath: '/var/lib/openclaw-swarm/state.db' });
 * initializeSchema(db);
 * ```
 */
export declare function initializeSchema(db: Database.Database): void;
/**
 * Validates the database schema by checking for expected tables.
 *
 * @param db - Database instance to validate
 * @returns true if all expected tables exist
 */
export declare function validateSchema(db: Database.Database): boolean;
/**
 * Gets table row counts for monitoring.
 *
 * @param db - Database instance
 * @returns Object with row counts for each table
 */
export declare function getTableCounts(db: Database.Database): {
    tasks: number;
    agent_status: number;
    project_context: number;
    tasks_archive: number;
    status_archive: number;
    checkpoints: number;
    context_refs: number;
};
/**
 * Drops all tables (useful for testing).
 *
 * WARNING: This will delete all data.
 *
 * @param db - Database instance
 */
export declare function dropAllTables(db: Database.Database): void;
/**
 * Creates a prepared statement for context reference garbage collection.
 *
 * Per 07-RESEARCH.md: Delete contexts unused > 7 days OR with low access count.
 * Policy: Keep frequently-used contexts while cleaning up old/unused ones.
 *
 * @param db - Database instance
 * @returns Prepared statement for garbage collection
 *
 * @example
 * ```ts
 * const gcQuery = createGarbageCollectionQuery(db);
 * const result = gcQuery.run();
 * console.log(`Deleted ${result.changes} old contexts`);
 * ```
 */
export declare function createGarbageCollectionQuery(db: Database.Database): any;
//# sourceMappingURL=schema.d.ts.map