/**
 * SQLite Sync for Cross-Machine Checkpoint Recovery
 *
 * Provides SQLite-based checkpoint storage for 5-minute sync and shutdown.
 * Enables agents on any machine to resume from synced checkpoints.
 * Per 04-01-PLAN.md Task 3.
 */
/**
 * SQLite-based checkpoint storage for cross-machine recovery.
 *
 * Syncs local checkpoints to SQLite every 5 minutes and on shutdown.
 * Uses prepared statements for optimal performance.
 *
 * Per RESEARCH.md: Better-sqlite3 synchronous API is 11.7x faster than async alternatives.
 * Per 02-01-SUMMARY.md: Prepared statements pattern from TaskQueue.
 */
export class SQLiteSync {
    db;
    insertStmt;
    selectStmt;
    deleteStmt;
    selectByTaskStmt;
    /**
     * Creates a new SQLiteSync instance.
     *
     * Initializes the checkpoints table if not exists and prepares
     * all SQL statements for CRUD operations.
     *
     * @param options - Sync configuration options
     */
    constructor(options) {
        this.db = options.db;
        // Ensure checkpoints table exists
        this.initializeCheckpointsTable();
        // Prepare insert statement
        this.insertStmt = this.db.prepare(`
      INSERT INTO checkpoints (id, task_id, agent_id, data, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
        // Prepare select latest by task statement (for resume)
        this.selectByTaskStmt = this.db.prepare(`
      SELECT data FROM checkpoints
      WHERE task_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
        // Prepare select by checkpoint ID statement
        this.selectStmt = this.db.prepare(`
      SELECT data FROM checkpoints WHERE id = ?
    `);
        // Prepare delete statement
        this.deleteStmt = this.db.prepare(`
      DELETE FROM checkpoints WHERE id = ?
    `);
    }
    /**
     * Initializes the checkpoints table if not exists.
     * Table schema: id, task_id, agent_id, data (JSON), created_at
     */
    initializeCheckpointsTable() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      )
    `);
        // Create index for fast latest checkpoint lookup
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id)
    `);
        // Create index for created_at for checkpoint ordering
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON checkpoints(created_at)
    `);
    }
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
    saveCheckpoint(checkpointId, data) {
        try {
            // Serialize data to JSON string
            const jsonData = JSON.stringify(data);
            // Execute insert statement
            this.insertStmt.run(checkpointId, data.taskId, data.agentId, jsonData, data.timestamp);
        }
        catch (error) {
            throw new Error(`Failed to save checkpoint ${checkpointId} to SQLite: ${error}`);
        }
    }
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
    loadLatest(taskId) {
        try {
            const result = this.selectByTaskStmt.get(taskId);
            if (!result) {
                return null;
            }
            // Parse JSON and return checkpoint data
            const data = JSON.parse(result.data);
            return data;
        }
        catch (error) {
            throw new Error(`Failed to load latest checkpoint for task ${taskId}: ${error}`);
        }
    }
    /**
     * Loads a specific checkpoint by ID from SQLite.
     *
     * @param checkpointId - Checkpoint identifier
     * @returns Checkpoint data or null if not found
     * @throws Error if parse fails (corruption detected)
     */
    loadCheckpoint(checkpointId) {
        try {
            const result = this.selectStmt.get(checkpointId);
            if (!result) {
                return null;
            }
            // Parse JSON and return checkpoint data
            const data = JSON.parse(result.data);
            return data;
        }
        catch (error) {
            throw new Error(`Failed to load checkpoint ${checkpointId}: ${error}`);
        }
    }
    /**
     * Deletes a checkpoint from SQLite.
     *
     * No error if checkpoint doesn't exist (idempotent).
     *
     * @param checkpointId - Checkpoint identifier
     */
    deleteCheckpoint(checkpointId) {
        try {
            this.deleteStmt.run(checkpointId);
        }
        catch (error) {
            throw new Error(`Failed to delete checkpoint ${checkpointId}: ${error}`);
        }
    }
    /**
     * Deletes all checkpoints for a task from SQLite.
     * Useful for cleanup after task completion.
     *
     * @param taskId - Task identifier
     * @returns Number of checkpoints deleted
     */
    deleteByTask(taskId) {
        try {
            const stmt = this.db.prepare(`
        DELETE FROM checkpoints WHERE task_id = ?
      `);
            const result = stmt.run(taskId);
            return result.changes;
        }
        catch (error) {
            throw new Error(`Failed to delete checkpoints for task ${taskId}: ${error}`);
        }
    }
    /**
     * Lists all checkpoint IDs for a task.
     *
     * @param taskId - Task identifier
     * @returns Array of checkpoint IDs ordered by creation time (newest first)
     */
    listByTask(taskId) {
        try {
            const stmt = this.db.prepare(`
        SELECT id FROM checkpoints
        WHERE task_id = ?
        ORDER BY created_at DESC
      `);
            const results = stmt.all(taskId);
            return results.map((r) => r.id);
        }
        catch (error) {
            throw new Error(`Failed to list checkpoints for task ${taskId}: ${error}`);
        }
    }
    /**
     * Gets the total count of checkpoints in SQLite.
     * Useful for monitoring storage usage.
     *
     * @returns Number of checkpoints stored
     */
    getCount() {
        try {
            const result = this.db.prepare(`
        SELECT COUNT(*) AS count FROM checkpoints
      `).get();
            return result.count;
        }
        catch (error) {
            throw new Error(`Failed to get checkpoint count: ${error}`);
        }
    }
    /**
     * Gets checkpoint count per task.
     * Useful for identifying tasks with many checkpoints.
     *
     * @returns Array of { taskId, count } ordered by count DESC
     */
    getCountByTask() {
        try {
            const stmt = this.db.prepare(`
        SELECT task_id as taskId, COUNT(*) as count
        FROM checkpoints
        GROUP BY task_id
        ORDER BY count DESC
      `);
            return stmt.all();
        }
        catch (error) {
            throw new Error(`Failed to get checkpoint count by task: ${error}`);
        }
    }
    /**
     * Deletes old checkpoints for a task, keeping only the N most recent.
     * Useful for storage management.
     *
     * @param taskId - Task identifier
     * @param keep - Number of recent checkpoints to keep (default: 5)
     * @returns Number of checkpoints deleted
     */
    deleteOldCheckpoints(taskId, keep = 5) {
        try {
            // Get checkpoint IDs to keep (N most recent)
            const keepStmt = this.db.prepare(`
        SELECT id FROM checkpoints
        WHERE task_id = ?
        ORDER BY created_at DESC
        LIMIT ?
      `);
            const keepResults = keepStmt.all(taskId, keep);
            const keepIds = new Set(keepResults.map((r) => r.id));
            // Delete checkpoints not in keep set
            const deleteStmt = this.db.prepare(`
        DELETE FROM checkpoints
        WHERE task_id = ? AND id NOT IN (${Array(keepIds.size).fill('?').join(',')})
      `);
            // Build params array
            const params = [taskId, ...keepIds];
            const result = deleteStmt.run(...params);
            return result.changes;
        }
        catch (error) {
            throw new Error(`Failed to delete old checkpoints for task ${taskId}: ${error}`);
        }
    }
    /**
     * Gets the underlying database instance.
     * Useful for transactional operations.
     *
     * @returns Database instance
     */
    getDatabase() {
        return this.db;
    }
}
/**
 * Factory function to create SQLiteSync instance.
 *
 * @param options - Sync configuration options
 * @returns SQLiteSync instance
 */
export function createSQLiteSync(options) {
    return new SQLiteSync(options);
}
//# sourceMappingURL=sync.js.map