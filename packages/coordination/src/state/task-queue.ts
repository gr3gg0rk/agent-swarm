/**
 * Task Queue Operations
 *
 * Provides CRUD operations for task queue management using prepared statements.
 * Supports concurrent access from multiple agents via WAL mode.
 *
 * Per RESEARCH.md Pattern 2 (Heartbeat) and STATE-02 (task queue).
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

/**
 * Task status enumeration.
 */
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

/**
 * Task record from database.
 */
export interface Task {
  /** Unique task ID (UUID) */
  id: string;
  /** Current task status */
  status: TaskStatus;
  /** Task priority (higher = more important) */
  priority: number;
  /** Agent ID assigned to this task (if any) */
  assignedAgent?: string;
  /** Creation timestamp (Unix seconds) */
  createdAt: number;
  /** Last update timestamp (Unix seconds) */
  updatedAt: number;
  /** Completion timestamp (if completed) */
  completedAt?: number;
  /** Optional task payload (JSON string) */
  payload?: string;
}

/**
 * Task creation parameters (without auto-generated fields).
 */
export type TaskCreate = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

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
export class TaskQueue {
  private insertStmt: Database.Statement;
  private selectStmt: Database.Statement;
  private selectByIdStmt: Database.Statement;
  private updateStatusStmt: Database.Statement;
  private assignStmt: Database.Statement;
  private deleteStmt: Database.Statement;

  constructor(db: Database.Database) {
    // Prepare all statements once for reuse
    this.insertStmt = db.prepare(`
      INSERT INTO tasks (id, status, priority, assigned_agent, created_at, updated_at, completed_at, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.selectStmt = db.prepare(`
      SELECT id, status, priority, assigned_agent as assignedAgent, created_at as createdAt,
             updated_at as updatedAt, completed_at as completedAt, payload
      FROM tasks
      WHERE 1=1
        AND (?1 IS NULL OR status = ?1)
        AND (?2 IS NULL OR assigned_agent = ?2)
      ORDER BY priority DESC, created_at ASC
      LIMIT ?3
    `);

    this.selectByIdStmt = db.prepare(`
      SELECT id, status, priority, assigned_agent as assignedAgent, created_at as createdAt,
             updated_at as updatedAt, completed_at as completedAt, payload
      FROM tasks
      WHERE id = ?
    `);

    this.updateStatusStmt = db.prepare(`
      UPDATE tasks
      SET status = ?, updated_at = ?, completed_at = ?,
          assigned_agent = COALESCE(?, assigned_agent)
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
  }

  /**
   * Create a new task in the queue.
   *
   * @param task - Task data (without id, createdAt, updatedAt)
   * @returns Created task with generated ID
   */
  createTask(task: TaskCreate): Task {
    const id = uuidv4();
    const now = Math.floor(Date.now() / 1000);

    const result = this.insertStmt.run(
      id,
      task.status,
      task.priority,
      task.assignedAgent || null,
      now,
      now,
      task.completedAt || null,
      task.payload || null
    );

    if (result.changes === 0) {
      throw new Error('Failed to create task');
    }

    return this.getTask(id)!;
  }

  /**
   * Get a specific task by ID.
   *
   * @param taskId - Task ID
   * @returns Task or null if not found
   */
  getTask(taskId: string): Task | null {
    const result = this.selectByIdStmt.get(taskId) as Task | undefined;
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
  getTasks(filter: TaskFilter = {}): Task[] {
    const limit = filter.limit || 100;
    const result = this.selectStmt.all(
      filter.status || null,
      filter.agentId || null,
      limit
    ) as Task[];
    return result;
  }

  /**
   * Update task status.
   *
   * Optionally also updates the assigned agent.
   *
   * @param taskId - Task ID
   * @param status - New status
   * @param assignedAgent - Optional new assigned agent
   */
  updateTaskStatus(taskId: string, status: TaskStatus, assignedAgent?: string): void {
    const now = Math.floor(Date.now() / 1000);
    const completedAt = status === 'completed' || status === 'failed' ? now : null;

    const result = this.updateStatusStmt.run(status, now, completedAt, assignedAgent || null, taskId);
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
  assignTask(taskId: string, agentId: string): void {
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
  deleteTask(taskId: string): void {
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
  getNextPendingTask(): Task | null {
    const result = this.selectStmt.all('pending', null, 1) as Task[];
    return result.length > 0 ? result[0] : null;
  }

  /**
   * Get task count by status.
   *
   * @param status - Task status
   * @returns Number of tasks with this status
   */
  getTaskCount(status?: TaskStatus): number {
    const tasks = this.getTasks({ status, limit: 100000 });
    return tasks.length;
  }
}

/**
 * Factory function to create task queue instance.
 *
 * @param db - Database instance
 * @returns TaskQueue instance
 */
export function createTaskQueue(db: Database.Database): TaskQueue {
  return new TaskQueue(db);
}
