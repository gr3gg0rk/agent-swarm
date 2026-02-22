/**
 * Task Queue Operations
 *
 * Provides CRUD operations for task queue management using prepared statements.
 * Supports concurrent access from multiple agents via WAL mode.
 *
 * Per RESEARCH.md Pattern 2 (Heartbeat) and STATE-02 (task queue).
 * Extended with delegation fields per Phase 3: Task Delegation.
 */
import Database from 'better-sqlite3';
import type { Task as DelegationTask, TaskCreate as DelegationTaskCreate, TaskProgress } from '../delegation/types.js';
/**
 * Task status enumeration.
 * Includes 'paused' for memory throttling per Phase 4 Plan 02.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled';
/**
 * Task record from database.
 *
 * Re-exports Task from delegation/types.ts for extended fields:
 * - dependencies, timeoutMs, retryCount, maxRetries, lastProgressAt, resultPayload, errorType
 */
export type Task = DelegationTask;
/**
 * Task creation parameters (without auto-generated fields).
 */
export type TaskCreate = DelegationTaskCreate;
/**
 * Task filter for query operations.
 */
export interface TaskFilter {
    /** Filter by status */
    status?: TaskStatus;
    /** Filter by assigned agent */
    agentId?: string;
    /** Maximum number of results */
    limit?: number;
}
/**
 * Task queue manager with prepared statement caching.
 *
 * Uses better-sqlite3 prepared statements for optimal performance.
 * All operations are synchronous and thread-safe.
 */
export declare class TaskQueue {
    private insertStmt;
    private selectStmt;
    private selectByIdStmt;
    private updateStatusStmt;
    private assignStmt;
    private deleteStmt;
    private updateRetryStmt;
    private updateProgressStmt;
    constructor(db: Database.Database);
    /**
     * Create a new task in the queue.
     *
     * Supports extended task fields for delegation: dependencies, timeoutMs, maxRetries.
     *
     * @param task - Task data (without id, createdAt, updatedAt)
     * @returns Created task with generated ID
     */
    createTask(task: TaskCreate): Task;
    /**
     * Get a specific task by ID.
     *
     * @param taskId - Task ID
     * @returns Task or null if not found
     */
    getTask(taskId: string): Task | null;
    /**
     * Query tasks with optional filters.
     *
     * Results are ordered by priority DESC, then created_at ASC.
     *
     * @param filter - Optional filters
     * @returns Array of matching tasks
     */
    getTasks(filter?: TaskFilter): Task[];
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
    updateTaskStatus(taskId: string, status: TaskStatus, assignedAgent?: string, errorType?: 'transient' | 'permanent'): void;
    /**
     * Assign a task to an agent and set status to in_progress.
     *
     * @param taskId - Task ID
     * @param agentId - Agent ID to assign
     */
    assignTask(taskId: string, agentId: string): void;
    /**
     * Delete a task from the queue.
     *
     * @param taskId - Task ID
     */
    deleteTask(taskId: string): void;
    /**
     * Get next pending task with highest priority.
     *
     * Useful for agents looking for work.
     *
     * @returns Next pending task or null
     */
    getNextPendingTask(): Task | null;
    /**
     * Get task count by status.
     *
     * @param status - Task status
     * @returns Number of tasks with this status
     */
    getTaskCount(status?: TaskStatus): number;
    /**
     * Update task retry count.
     *
     * Used by timeout monitor to track retry attempts.
     *
     * @param taskId - Task ID
     * @param retryCount - New retry count
     */
    updateTaskRetry(taskId: string, retryCount: number): void;
    /**
     * Update task progress timestamp.
     *
     * Called by workers to indicate activity on long-running tasks.
     *
     * @param taskId - Task ID
     * @param progressData - Progress update data
     */
    updateTaskProgress(taskId: string, progressData: TaskProgress): void;
}
/**
 * Factory function to create task queue instance.
 *
 * @param db - Database instance
 * @returns TaskQueue instance
 */
export declare function createTaskQueue(db: Database.Database): TaskQueue;
//# sourceMappingURL=task-queue.d.ts.map