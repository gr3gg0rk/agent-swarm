/**
 * Task Queue Operations
 *
 * Provides CRUD operations for task queue management using prepared statements.
 * Supports concurrent access from multiple agents via WAL mode.
 *
 * Per RESEARCH.md Pattern 2 (Heartbeat) and STATE-02 (task queue).
 * Extended with delegation fields per Phase 3: Task Delegation.
 */
import { v4 as uuidv4 } from 'uuid';
/**
 * Task queue manager with prepared statement caching.
 *
 * Uses better-sqlite3 prepared statements for optimal performance.
 * All operations are synchronous and thread-safe.
 */
export class TaskQueue {
    insertStmt;
    selectStmt;
    selectByIdStmt;
    updateStatusStmt;
    assignStmt;
    deleteStmt;
    updateRetryStmt;
    updateProgressStmt;
    constructor(db) {
        // Prepare all statements once for reuse
        this.insertStmt = db.prepare(`
      INSERT INTO tasks (
        id, status, priority, assigned_agent, created_at, updated_at, completed_at, payload,
        dependencies, timeout_ms, retry_count, max_retries, last_progress_at, result_payload, error_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        this.selectStmt = db.prepare(`
      SELECT id, status, priority, assigned_agent as assignedAgent,
             created_at as createdAt, updated_at as updatedAt, completed_at as completedAt,
             payload, dependencies, timeout_ms as timeoutMs, retry_count as retryCount,
             max_retries as maxRetries, last_progress_at as lastProgressAt,
             result_payload as resultPayload, error_type as errorType
      FROM tasks
      WHERE 1=1
        AND (?1 IS NULL OR status = ?1)
        AND (?2 IS NULL OR assigned_agent = ?2)
      ORDER BY priority DESC, created_at ASC
      LIMIT ?3
    `);
        this.selectByIdStmt = db.prepare(`
      SELECT id, status, priority, assigned_agent as assignedAgent,
             created_at as createdAt, updated_at as updatedAt, completed_at as completedAt,
             payload, dependencies, timeout_ms as timeoutMs, retry_count as retryCount,
             max_retries as maxRetries, last_progress_at as lastProgressAt,
             result_payload as resultPayload, error_type as errorType
      FROM tasks
      WHERE id = ?
    `);
        this.updateStatusStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?, completed_at = ?,
          assigned_agent = COALESCE(?, assigned_agent),
          error_type = COALESCE(?, error_type)
      WHERE id = ?
    `);
        this.assignStmt = db.prepare(`
      UPDATE tasks
      SET status = 'in_progress', assigned_agent = ?, updated_at = ?
      WHERE id = ?
    `);
        this.deleteStmt = db.prepare(`
      DELETE FROM tasks
      WHERE id = ?
    `);
        this.updateRetryStmt = db.prepare(`
      UPDATE tasks
      SET retry_count = ?, updated_at = ?
      WHERE id = ?
    `);
        this.updateProgressStmt = db.prepare(`
      UPDATE tasks
      SET last_progress_at = ?, updated_at = ?
      WHERE id = ?
    `);
    }
    /**
     * Create a new task in the queue.
     *
     * Supports extended task fields for delegation: dependencies, timeoutMs, maxRetries.
     *
     * @param task - Task data (without id, createdAt, updatedAt)
     * @returns Created task with generated ID
     */
    createTask(task) {
        const id = uuidv4();
        const now = Math.floor(Date.now() / 1000);
        // Serialize dependencies array to JSON
        const dependenciesJson = task.dependencies ? JSON.stringify(task.dependencies) : null;
        const result = this.insertStmt.run(id, task.status, task.priority, task.assignedAgent || null, now, now, task.completedAt || null, task.payload || null, dependenciesJson, task.timeoutMs || null, task.retryCount || 0, task.maxRetries || 3, task.lastProgressAt || null, task.resultPayload || null, task.errorType || null);
        if (result.changes === 0) {
            throw new Error('Failed to create task');
        }
        return this.getTask(id);
    }
    /**
     * Get a specific task by ID.
     *
     * @param taskId - Task ID
     * @returns Task or null if not found
     */
    getTask(taskId) {
        const result = this.selectByIdStmt.get(taskId);
        if (!result) {
            return null;
        }
        // Parse dependencies from JSON
        if (result.dependencies && typeof result.dependencies === 'string') {
            try {
                result.dependencies = JSON.parse(result.dependencies);
            }
            catch {
                // If parsing fails, leave as string
            }
        }
        return result || null;
    }
    /**
     * Query tasks with optional filters.
     *
     * Results are ordered by priority DESC, then created_at ASC.
     *
     * @param filter - Optional filters
     * @returns Array of matching tasks
     */
    getTasks(filter = {}) {
        const limit = filter.limit || 100;
        const result = this.selectStmt.all(filter.status || null, filter.agentId || null, limit);
        // Parse dependencies from JSON for each task
        return result.map(task => {
            if (task.dependencies && typeof task.dependencies === 'string') {
                try {
                    task.dependencies = JSON.parse(task.dependencies);
                }
                catch {
                    // If parsing fails, leave as string
                }
            }
            return task;
        });
    }
    /**
     * Update task status.
     *
     * Optionally also updates the assigned agent and error type.
     *
     * @param taskId - Task ID
     * @param status - New status
     * @param assignedAgent - Optional new assigned agent
     * @param errorType - Optional error type classification
     */
    updateTaskStatus(taskId, status, assignedAgent, errorType) {
        const now = Math.floor(Date.now() / 1000);
        const completedAt = status === 'completed' || status === 'failed' || status === 'cancelled' ? now : null;
        const result = this.updateStatusStmt.run(status, now, completedAt, assignedAgent || null, errorType || null, taskId);
        if (result.changes === 0) {
            throw new Error(`Task not found: ${taskId}`);
        }
    }
    /**
     * Assign a task to an agent and set status to in_progress.
     *
     * @param taskId - Task ID
     * @param agentId - Agent ID to assign
     */
    assignTask(taskId, agentId) {
        const now = Math.floor(Date.now() / 1000);
        const result = this.assignStmt.run(agentId, now, taskId);
        if (result.changes === 0) {
            throw new Error(`Task not found: ${taskId}`);
        }
    }
    /**
     * Delete a task from the queue.
     *
     * @param taskId - Task ID
     */
    deleteTask(taskId) {
        const result = this.deleteStmt.run(taskId);
        if (result.changes === 0) {
            throw new Error(`Task not found: ${taskId}`);
        }
    }
    /**
     * Get next pending task with highest priority.
     *
     * Useful for agents looking for work.
     *
     * @returns Next pending task or null
     */
    getNextPendingTask() {
        const result = this.selectStmt.all('pending', null, 1);
        return result.length > 0 ? result[0] : null;
    }
    /**
     * Get task count by status.
     *
     * @param status - Task status
     * @returns Number of tasks with this status
     */
    getTaskCount(status) {
        const tasks = this.getTasks({ status, limit: 100000 });
        return tasks.length;
    }
    /**
     * Update task retry count.
     *
     * Used by timeout monitor to track retry attempts.
     *
     * @param taskId - Task ID
     * @param retryCount - New retry count
     */
    updateTaskRetry(taskId, retryCount) {
        const now = Math.floor(Date.now() / 1000);
        const result = this.updateRetryStmt.run(retryCount, now, taskId);
        if (result.changes === 0) {
            throw new Error(`Task not found: ${taskId}`);
        }
    }
    /**
     * Update task progress timestamp.
     *
     * Called by workers to indicate activity on long-running tasks.
     *
     * @param taskId - Task ID
     * @param progressData - Progress update data
     */
    updateTaskProgress(taskId, progressData) {
        const now = Math.floor(Date.now() / 1000);
        const result = this.updateProgressStmt.run(progressData.timestamp, now, taskId);
        if (result.changes === 0) {
            throw new Error(`Task not found: ${taskId}`);
        }
    }
}
/**
 * Factory function to create task queue instance.
 *
 * @param db - Database instance
 * @returns TaskQueue instance
 */
export function createTaskQueue(db) {
    return new TaskQueue(db);
}
//# sourceMappingURL=task-queue.js.map