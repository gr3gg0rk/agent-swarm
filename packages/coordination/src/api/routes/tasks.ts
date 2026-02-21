/**
 * Task Queue API Routes
 *
 * REST endpoints for task queue operations.
 * Agents can query, create, and update tasks.
 *
 * Per STATE-02 (task queue queryable by all agents).
 */

import { Router, type Request, type Response } from 'express';
import { TaskQueue, type TaskFilter } from '../../state/task-queue.js';

/**
 * Request body for creating a task.
 */
interface CreateTaskBody {
  status?: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority?: number;
  assignedAgent?: string;
  payload?: unknown;
}

/**
 * Request body for updating task status.
 */
interface UpdateTaskStatusBody {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  assignedAgent?: string;
}

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
export function createTaskRoutes(taskQueue: TaskQueue): Router {
  const router = Router();

  /**
   * GET /api/tasks
   *
   * Query tasks with optional filters.
   * Query params: status, agentId, limit
   *
   * @example
   * GET /api/tasks?status=pending&limit=10
   * GET /api/tasks?agentId=worker-1
   */
  router.get('/tasks', (req: Request, res: Response) => {
    try {
      const { status, agentId, limit } = req.query;

      // Build filter object
      const filter: TaskFilter = {};
      if (status && typeof status === 'string') {
        filter.status = status as 'pending' | 'in_progress' | 'completed' | 'failed';
      }
      if (agentId && typeof agentId === 'string') {
        filter.agentId = agentId;
      }
      if (limit && typeof limit === 'string') {
        filter.limit = parseInt(limit, 10);
      }

      const tasks = taskQueue.getTasks(filter);
      res.json({ tasks, count: tasks.length });
    } catch (error) {
      console.error('Error querying tasks:', error);
      res.status(500).json({ error: 'Failed to query tasks' });
    }
  });

  /**
   * POST /api/tasks
   *
   * Create a new task.
   * Body: { status?, priority?, assignedAgent?, payload? }
   *
   * @example
   * POST /api/tasks
   * { "priority": 10, "payload": { "type": "code", "target": "test.js" } }
   */
  router.post('/tasks', (req: Request, res: Response) => {
    try {
      const body = req.body as CreateTaskBody;

      // Validate input
      if (body.status && !['pending', 'in_progress', 'completed', 'failed'].includes(body.status)) {
        return res.status(400).json({ error: 'Invalid task status' });
      }

      const task = taskQueue.createTask({
        status: body.status || 'pending',
        priority: body.priority || 0,
        assignedAgent: body.assignedAgent,
        payload: body.payload ? JSON.stringify(body.payload) : undefined,
      });

      res.status(201).json({ task });
    } catch (error) {
      console.error('Error creating task:', error);
      res.status(500).json({ error: 'Failed to create task' });
    }
  });

  /**
   * GET /api/tasks/:id
   *
   * Get a specific task by ID.
   *
   * @example
   * GET /api/tasks/550e8400-e29b-41d4-a716-446655440000
   */
  router.get('/tasks/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const task = taskQueue.getTask(id);

      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      // Parse payload if it exists
      const response = {
        ...task,
        payload: task.payload ? JSON.parse(task.payload) : undefined,
      };

      res.json({ task: response });
    } catch (error) {
      console.error('Error getting task:', error);
      res.status(500).json({ error: 'Failed to get task' });
    }
  });

  /**
   * PUT /api/tasks/:id/status
   *
   * Update task status.
   * Body: { status, assignedAgent? }
   *
   * @example
   * PUT /api/tasks/550e8400-e29b-41d4-a716-446655440000/status
   * { "status": "in_progress", "assignedAgent": "worker-1" }
   */
  router.put('/tasks/:id/status', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const body = req.body as UpdateTaskStatusBody;

      // Validate status
      if (!body.status || !['pending', 'in_progress', 'completed', 'failed'].includes(body.status)) {
        return res.status(400).json({ error: 'Invalid task status' });
      }

      taskQueue.updateTaskStatus(id, body.status, body.assignedAgent);

      // Get updated task
      const task = taskQueue.getTask(id);
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      const response = {
        ...task,
        payload: task.payload ? JSON.parse(task.payload) : undefined,
      };

      res.json({ task: response });
    } catch (error) {
      console.error('Error updating task status:', error);
      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: 'Task not found' });
      }
      res.status(500).json({ error: 'Failed to update task status' });
    }
  });

  /**
   * GET /api/tasks/pending/next
   *
   * Get next pending task (useful for agents looking for work).
   *
   * @example
   * GET /api/tasks/pending/next
   */
  router.get('/tasks/pending/next', (req: Request, res: Response) => {
    try {
      const task = taskQueue.getNextPendingTask();

      if (!task) {
        return res.status(404).json({ error: 'No pending tasks' });
      }

      const response = {
        ...task,
        payload: task.payload ? JSON.parse(task.payload) : undefined,
      };

      res.json({ task: response });
    } catch (error) {
      console.error('Error getting next pending task:', error);
      res.status(500).json({ error: 'Failed to get next pending task' });
    }
  });

  return router;
}
