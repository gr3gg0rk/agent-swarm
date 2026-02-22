/**
 * Task Queue API Routes
 *
 * REST endpoints for task queue operations.
 * Agents can query, create, and update tasks.
 *
 * Per STATE-02 (task queue queryable by all agents).
 */
import { Router } from 'express';
import { TaskQueue } from '../../state/task-queue.js';
/**
 * Creates task queue routes.
 *
 * Endpoints:
 * - GET /api/tasks - Query tasks with optional filters
 * - POST /api/tasks - Create a new task
 * - GET /api/tasks/:id - Get specific task
 * - PUT /api/tasks/:id/status - Update task status
 *
 * @param taskQueue - TaskQueue instance
 * @returns Express router with task routes
 */
export declare function createTaskRoutes(taskQueue: TaskQueue): Router;
//# sourceMappingURL=tasks.d.ts.map