/**
 * Throttle Controller for Graceful Task Pausing and GC
 *
 * Pauses non-critical tasks when memory exceeds 85%, resumes when drops below 80%.
 * Implements graceful degradation by prioritizing task continuation over killing.
 *
 * Per 04-02-PLAN.md Task 3.
 * Per CONTEXT.md: "Throttle action: pause in-progress tasks to free memory"
 * Per CONTEXT.md: "Graceful degradation: prefer pausing over killing"
 */

import type { TaskQueue, Task } from '../state/task-queue.js';
import type { MemoryStats, ThrottleAction, ThrottleConfig } from './types.js';
import { DEFAULT_THROTTLE_CONFIG } from './types.js';

/**
 * Throttle Controller for graceful task pausing and resume.
 *
 * - Pauses non-critical tasks (priority < 100) at 85% memory usage
 * - Requests GC with global.gc() if available
 * - Resumes paused tasks when memory drops below 80%
 * - Tracks paused tasks in Set for state management
 *
 * Per CONTEXT.md: "Pause tasks, don't kill them - gives system chance to recover"
 * Per RESEARCH.md: "Pause only non-critical tasks (priority < 100). Request GC with global.gc()"
 */
export class ThrottleController {
  private readonly taskQueue: TaskQueue;
  private readonly config: ThrottleConfig;
  private readonly pausedTasks: Set<string>;
  private readonly logger?: any; // Optional logger

  /**
   * Creates a new ThrottleController instance.
   *
   * @param taskQueue - TaskQueue for task status updates
   * @param config - Throttle configuration (uses defaults if not provided)
   * @param logger - Optional logger for structured logging
   */
  constructor(
    taskQueue: TaskQueue,
    config: Partial<ThrottleConfig> = {},
    logger?: any
  ) {
    this.taskQueue = taskQueue;
    this.config = { ...DEFAULT_THROTTLE_CONFIG, ...config };
    this.pausedTasks = new Set();
    this.logger = logger;
  }

  /**
   * Throttle task execution based on memory pressure.
   *
   * Flow:
   * 1. Log warning with current memory usage
   * 2. Get all in-progress tasks
   * 3. For each task with priority < threshold:
   *    - Update status to 'paused'
   *    - Add to pausedTasks set
   *    - Log info message
   * 4. Request GC if global.gc exists
   *
   * Per CONTEXT.md: "Throttle action: pause in-progress tasks to free memory"
   *
   * @param stats - Memory statistics
   */
  async throttle(stats: MemoryStats): Promise<void> {
    const usagePercent = (stats.usagePercent * 100).toFixed(1);
    const message = `Memory at ${usagePercent}%, pausing non-critical tasks`;

    if (this.logger) {
      this.logger.info(message);
    } else {
      console.warn(message);
    }

    // Get all in-progress tasks
    const inProgressTasks = this.taskQueue.getTasks({ status: 'in_progress' });

    let pausedCount = 0;
    for (const task of inProgressTasks) {
      // Skip if already paused
      if (this.pausedTasks.has(task.id)) {
        continue;
      }

      // Pause non-critical tasks (priority < threshold)
      if (task.priority < this.config.priorityThreshold) {
        try {
          // Update task status to paused
          this.taskQueue.updateTaskStatus(task.id, 'paused');
          this.pausedTasks.add(task.id);
          pausedCount++;

          const msg = `Paused non-critical task ${task.id} (priority: ${task.priority})`;
          if (this.logger) {
            this.logger.info(msg);
          } else {
            console.info(msg);
          }
        } catch (error) {
          const errMsg = `Failed to pause task ${task.id}: ${error}`;
          if (this.logger) {
            this.logger.error(errMsg, {
              agentId: 'throttle-controller',
              messageId: task.id,
              timestamp: new Date().toISOString(),
              error: { message: String(error) },
            });
          } else {
            console.error(errMsg);
          }
        }
      }
    }

    // Request garbage collection if available
    if (typeof global.gc === 'function') {
      try {
        global.gc();
        const gcMsg = 'Requested garbage collection';
        if (this.logger) {
          this.logger.debug(gcMsg);
        } else {
          console.debug(gcMsg);
        }
      } catch (error) {
        const errMsg = `GC request failed: ${error}`;
        if (this.logger) {
          this.logger.warn(errMsg);
        } else {
          console.warn(errMsg);
        }
      }
    }

    if (pausedCount > 0) {
      const summary = `Paused ${pausedCount} non-critical tasks due to memory pressure`;
      if (this.logger) {
        this.logger.info(summary);
      } else {
        console.info(summary);
      }
    }
  }

  /**
   * Resume paused tasks when memory pressure decreases.
   *
   * Flow:
   * 1. Check if any tasks are paused
   * 2. Return immediately if none
   * 3. Check if memory is below resume threshold (80%)
   * 4. For each paused task:
   *    - Update status to 'pending' (re-queue for execution)
   *    - Log info message
   * 5. Clear pausedTasks set
   *
   * Per CONTEXT.md: "Resume when pressure decreases"
   *
   * @param stats - Memory statistics
   */
  async recover(stats: MemoryStats): Promise<void> {
    // Return immediately if no paused tasks
    if (this.pausedTasks.size === 0) {
      return;
    }

    // Check if memory is below resume threshold
    if (stats.usagePercent >= this.config.resumeThresholdPercent) {
      return; // Not ready to recover yet
    }

    const usagePercent = (stats.usagePercent * 100).toFixed(1);
    const message = `Memory recovered to ${usagePercent}%, resuming paused tasks`;

    if (this.logger) {
      this.logger.info(message);
    } else {
      console.info(message);
    }

    const resumedTasks: string[] = [];
    const failedTasks: string[] = [];

    // Resume all paused tasks
    for (const taskId of this.pausedTasks) {
      try {
        const task = this.taskQueue.getTask(taskId);

        // Only resume if task exists and is still paused
        if (task && (task.status === 'paused' as any)) {
          // Update status to pending to re-queue for execution
          this.taskQueue.updateTaskStatus(taskId, 'pending');
          resumedTasks.push(taskId);

          const msg = `Resumed task ${taskId}`;
          if (this.logger) {
            this.logger.info(msg);
          } else {
            console.info(msg);
          }
        } else {
          // Task no longer exists or not paused - skip but don't fail
          failedTasks.push(taskId);
        }
      } catch (error) {
        const errMsg = `Failed to resume task ${taskId}: ${error}`;
        if (this.logger) {
          this.logger.error(errMsg, {
            agentId: 'throttle-controller',
            messageId: taskId,
            timestamp: new Date().toISOString(),
            error: { message: String(error) },
          });
        } else {
          console.error(errMsg);
        }
        failedTasks.push(taskId);
      }
    }

    // Clear paused tasks set (all have been processed)
    this.pausedTasks.clear();

    if (resumedTasks.length > 0) {
      const summary = `Resumed ${resumedTasks.length} tasks`;
      if (this.logger) {
        this.logger.info(summary);
      } else {
        console.info(summary);
      }
    }

    if (failedTasks.length > 0) {
      const warnMsg = `Failed to resume ${failedTasks.length} tasks`;
      if (this.logger) {
        this.logger.warn(warnMsg);
      } else {
        console.warn(warnMsg);
      }
    }
  }

  /**
   * Get count of currently paused tasks.
   *
   * Useful for monitoring and capacity planning.
   *
   * @returns Number of paused tasks
   */
  getPausedTaskCount(): number {
    return this.pausedTasks.size;
  }

  /**
   * Get list of currently paused task IDs.
   *
   * Useful for debugging and monitoring.
   *
   * @returns Array of paused task IDs
   */
  getPausedTaskIds(): string[] {
    return Array.from(this.pausedTasks);
  }

  /**
   * Check if a specific task is paused.
   *
   * @param taskId - Task ID to check
   * @returns True if task is paused
   */
  isTaskPaused(taskId: string): boolean {
    return this.pausedTasks.has(taskId);
  }

  /**
   * Get current throttle configuration.
   *
   * @returns Throttle configuration
   */
  getConfig(): ThrottleConfig {
    return { ...this.config };
  }
}

/**
 * Factory function to create ThrottleController instance.
 *
 * @param taskQueue - TaskQueue for task status updates
 * @param config - Optional throttle configuration
 * @param logger - Optional logger for structured logging
 * @returns ThrottleController instance
 */
export function createThrottleController(
  taskQueue: TaskQueue,
  config?: Partial<ThrottleConfig>,
  logger?: any
): ThrottleController {
  return new ThrottleController(taskQueue, config, logger);
}
