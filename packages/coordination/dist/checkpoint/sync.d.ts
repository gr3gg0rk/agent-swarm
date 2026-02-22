/**
 * SQLite Sync for Cross-Machine Checkpoint Recovery
 *
 * Provides SQLite-based checkpoint storage for 5-minute sync and shutdown.
 * Enables agents on any machine to resume from synced checkpoints.
 * Per 04-01-PLAN.md Task 3.
 */
import Database from 'better-sqlite3';
import type { CheckpointData } from './types.js';
/**
 * Configuration for SQLiteSync.
 */
export interface SQLiteSyncOptions {
    /** Database instance (from state/database.ts) */
    db: Database.Database;
}
/**
 * SQLite-based checkpoint storage for cross-machine recovery.
 *
 * Syncs local checkpoints to SQLite every 5 minutes and on shutdown.
 * Uses prepared statements for optimal performance.
 *
 * Per RESEARCH.md: Better-sqlite3 synchronous API is 11.7x faster than async alternatives.
 * Per 02-01-SUMMARY.md: Prepared statements pattern from TaskQueue.
 */
export declare class SQLiteSync {
    private readonly db;
    private readonly insertStmt;
    private readonly selectStmt;
    private readonly deleteStmt;
    private readonly selectByTaskStmt;
    /**
     * Creates a new SQLiteSync instance.
     *
     * Initializes the checkpoints table if not exists and prepares
     * all SQL statements for CRUD operations.
     *
     * @param options - Sync configuration options
     */
    constructor(options: SQLiteSyncOptions);
    /**
     * Initializes the checkpoints table if not exists.
     * Table schema: id, task_id, agent_id, data (JSON), created_at
     */
    private initializeCheckpointsTable;
    /**
     * Saves checkpoint data to SQLite.
     *
     * Serializes data to JSON string and inserts into checkpoints table.
     * Wraps in try-catch for database error handling.
     *
     * @param checkpointId - Checkpoint identifier
     * @param data - Checkpoint data to save
     * @throws Error if database operation fails
     */
    saveCheckpoint(checkpointId: string, data: CheckpointData): void;
    /**
     * Loads the most recent checkpoint for a task from SQLite.
     *
     * Queries checkpoints table ordered by created_at DESC, returns first result.
     * Returns null if no checkpoints found for the task.
     *
     * @param taskId - Task identifier
     * @returns Most recent checkpoint data or null
     * @throws Error if parse fails (corruption detected)
     */
    loadLatest(taskId: string): CheckpointData | null;
    /**
     * Loads a specific checkpoint by ID from SQLite.
     *
     * @param checkpointId - Checkpoint identifier
     * @returns Checkpoint data or null if not found
     * @throws Error if parse fails (corruption detected)
     */
    loadCheckpoint(checkpointId: string): CheckpointData | null;
    /**
     * Deletes a checkpoint from SQLite.
     *
     * No error if checkpoint doesn't exist (idempotent).
     *
     * @param checkpointId - Checkpoint identifier
     */
    deleteCheckpoint(checkpointId: string): void;
    /**
     * Deletes all checkpoints for a task from SQLite.
     * Useful for cleanup after task completion.
     *
     * @param taskId - Task identifier
     * @returns Number of checkpoints deleted
     */
    deleteByTask(taskId: string): number;
    /**
     * Lists all checkpoint IDs for a task.
     *
     * @param taskId - Task identifier
     * @returns Array of checkpoint IDs ordered by creation time (newest first)
     */
    listByTask(taskId: string): string[];
    /**
     * Gets the total count of checkpoints in SQLite.
     * Useful for monitoring storage usage.
     *
     * @returns Number of checkpoints stored
     */
    getCount(): number;
    /**
     * Gets checkpoint count per task.
     * Useful for identifying tasks with many checkpoints.
     *
     * @returns Array of { taskId, count } ordered by count DESC
     */
    getCountByTask(): Array<{
        taskId: string;
        count: number;
    }>;
    /**
     * Deletes old checkpoints for a task, keeping only the N most recent.
     * Useful for storage management.
     *
     * @param taskId - Task identifier
     * @param keep - Number of recent checkpoints to keep (default: 5)
     * @returns Number of checkpoints deleted
     */
    deleteOldCheckpoints(taskId: string, keep?: number): number;
    /**
     * Gets the underlying database instance.
     * Useful for transactional operations.
     *
     * @returns Database instance
     */
    getDatabase(): Database.Database;
}
/**
 * Factory function to create SQLiteSync instance.
 *
 * @param options - Sync configuration options
 * @returns SQLiteSync instance
 */
export declare function createSQLiteSync(options: SQLiteSyncOptions): SQLiteSync;
//# sourceMappingURL=sync.d.ts.map