/**
 * Performance Store for Historical Task Execution Tracking
 *
 * Tracks task execution results in SQLite for weighted scoring algorithm.
 * Per ROUT-03: Router uses 30% historical performance in routing decisions.
 * Per RESEARCH.md Pitfall 3: Keep only last 1000 tasks per agent to prevent unbounded growth.
 */
/**
 * Performance store for SQLite-backed task execution history.
 *
 * Records task results and provides historical performance data
 * for weighted scoring in router.
 */
export class PerformanceStore {
    db;
    maxRecordsPerAgent;
    constructor(db, options = {}) {
        this.db = db;
        this.maxRecordsPerAgent = options.maxRecordsPerAgent || 1000;
        this.initializeSchema();
    }
    /**
     * Create performance_history table if not exists.
     */
    initializeSchema() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_history (
        task_id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        success INTEGER NOT NULL,
        execution_time INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_performance_agent_id
        ON performance_history(agent_id, timestamp DESC);

      CREATE INDEX IF NOT EXISTS idx_performance_timestamp
        ON performance_history(timestamp DESC);
    `);
    }
    /**
     * Record task execution result.
     *
     * @param record - Performance record to store
     */
    recordTaskResult(record) {
        const stmt = this.db.prepare(`
      INSERT INTO performance_history (task_id, agent_id, success, execution_time, timestamp, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(task_id) DO UPDATE SET
        agent_id = excluded.agent_id,
        success = excluded.success,
        execution_time = excluded.execution_time,
        timestamp = excluded.timestamp,
        created_at = excluded.created_at
    `);
        stmt.run(record.taskId, record.agentId, record.success ? 1 : 0, record.executionTime, record.timestamp, Date.now());
        // Prune old records for this agent (Pitfall 3: prevent unbounded growth)
        this.pruneOldRecords(record.agentId);
    }
    /**
     * Get performance history for an agent.
     *
     * Returns last N records ordered by timestamp (most recent first).
     *
     * @param agentId - Agent ID to query
     * @param limit - Maximum records to return (default 100)
     * @returns Performance records
     */
    getPerformanceHistory(agentId, limit = 100) {
        const stmt = this.db.prepare(`
      SELECT task_id, agent_id, success, execution_time, timestamp
      FROM performance_history
      WHERE agent_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
        const rows = stmt.all(agentId, limit);
        return rows.map(row => ({
            taskId: row.task_id,
            agentId: row.agent_id,
            success: row.success === 1,
            executionTime: row.execution_time,
            timestamp: row.timestamp,
        }));
    }
    /**
     * Prune old performance records for an agent.
     *
     * Keeps only maxRecordsPerAgent most recent records.
     *
     * @param agentId - Agent ID to prune
     */
    pruneOldRecords(agentId) {
        // Delete records older than the max we want to keep
        // Uses subquery to find the cutoff timestamp
        this.db.prepare(`
      DELETE FROM performance_history
      WHERE agent_id = ?
        AND task_id NOT IN (
          SELECT task_id
          FROM performance_history
          WHERE agent_id = ?
          ORDER BY timestamp DESC
          LIMIT ?
        )
    `).run(agentId, agentId, this.maxRecordsPerAgent);
    }
    /**
     * Get average execution time for an agent.
     *
     * @param agentId - Agent ID to query
     * @returns Average execution time in ms, or undefined if no history
     */
    getAverageExecutionTime(agentId) {
        const stmt = this.db.prepare(`
      SELECT AVG(execution_time) as avg_time
      FROM performance_history
      WHERE agent_id = ?
        AND success = 1
    `);
        const result = stmt.get(agentId);
        return result?.avg_time;
    }
    /**
     * Get success rate for an agent.
     *
     * @param agentId - Agent ID to query
     * @returns Success rate (0-1), or undefined if no history
     */
    getSuccessRate(agentId) {
        const stmt = this.db.prepare(`
      SELECT
        CAST(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS REAL) /
        CAST(COUNT(*) AS REAL) as success_rate
      FROM performance_history
      WHERE agent_id = ?
    `);
        const result = stmt.get(agentId);
        return result?.success_rate;
    }
}
/**
 * Factory function to create performance store.
 *
 * @param db - Database connection
 * @param options - Optional configuration
 * @returns PerformanceStore instance
 */
export function createPerformanceStore(db, options) {
    return new PerformanceStore(db, options);
}
//# sourceMappingURL=performance-store.js.map