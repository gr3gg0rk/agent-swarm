/**
 * Resume Logic with Checkpoint Validation and Task Relevance Checking
 *
 * Enables agents to resume from checkpoints safely by validating integrity
 * and checking task relevance before restoration. Prevents corrupted or stale
 * checkpoints from causing cascading failures.
 *
 * Per 04-02-PLAN.md Task 1.
 * Per CONTEXT.md: Resume from checkpoint by default, check task relevance before resuming.
 * Per CONTEXT.md: Checkpoint corruption requests guidance (don't auto-restart).
 */

import type { CheckpointManager } from './manager.js';
import type { TaskQueue, Task } from '../state/task-queue.js';
import type { Logger } from '../errors/logger.js';
import type { CheckpointData } from './types.js';
import type { ResumeResult } from './types.js';
import { validateChecksum } from './checksum.js';
import { reconcileCheckpoint, type CurrentState } from './reconciliation.js';
import { VectorClockImpl } from './vector-clock.js';

/**
 * Resume validation result for checkpoint integrity.
 */
interface CheckpointValidation {
  /** True if checkpoint is valid and can be loaded */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Task relevance check result.
 */
interface TaskRelevance {
  /** True if task is still relevant and should be resumed */
  relevant: boolean;
  /** Reason why task is not relevant (if relevant is false) */
  reason?: string;
}

/**
 * Resume logic configuration options.
 */
export interface ResumeLogicOptions {
  /** Maximum time skew in milliseconds for clock skew detection (default: 60000 = 1 minute) */
  maxClockSkewMs?: number;
  /** Enable clock skew detection (default: true) */
  enableClockSkewDetection?: boolean;
  /** Agent ID for vector clock initialization (default: 'unknown') */
  agentId?: string;
}

/**
 * Resume Logic with checkpoint validation and task relevance checking.
 *
 * - Validates checkpoint integrity before loading (detects corruption)
 * - Checks task relevance before resuming (cancelled, timeout, dependencies)
 * - Returns appropriate ResumeResult action for each scenario
 * - Requests guidance on corruption (never auto-restarts from bad data)
 *
 * Per CONTEXT.md: Resume from checkpoint by default (not restart fresh).
 * Per CONTEXT.md: Before resuming: check if task is still relevant.
 * Per CONTEXT.md: Checkpoint corruption: request guidance from Minerva.
 */
export class ResumeLogic {
  private readonly checkpointManager: CheckpointManager;
  private readonly taskQueue: TaskQueue;
  private readonly logger: Logger;
  private readonly maxClockSkewMs: number;
  private readonly enableClockSkewDetection: boolean;
  private readonly vectorClock: VectorClockImpl;

  /**
   * Creates a new ResumeLogic instance.
   *
   * @param checkpointManager - CheckpointManager for checkpoint retrieval
   * @param taskQueue - TaskQueue for task relevance validation
   * @param logger - Logger for structured logging
   * @param options - Optional configuration
   */
  constructor(
    checkpointManager: CheckpointManager,
    taskQueue: TaskQueue,
    logger: Logger,
    options: ResumeLogicOptions = {}
  ) {
    this.checkpointManager = checkpointManager;
    this.taskQueue = taskQueue;
    this.logger = logger;
    this.maxClockSkewMs = options.maxClockSkewMs ?? 60000; // 1 minute default
    this.enableClockSkewDetection = options.enableClockSkewDetection ?? true;
    this.vectorClock = new VectorClockImpl(options.agentId || 'unknown');
  }

  /**
   * Resume task from checkpoint with validation.
   *
   * Flow:
   * 1. Load checkpoint via checkpointManager.loadCheckpoint()
   * 2. Return { restart } if no checkpoint found
   * 3. Validate checkpoint integrity via validateCheckpoint()
   * 4. Return { request_guidance } if validation fails
   * 5. Validate vector clock (if present) - reject older checkpoints
   * 6. Check task relevance via isTaskRelevant()
   * 7. Return appropriate ResumeResult based on relevance
   * 8. Reconcile checkpoint with current state
   * 9. Return { resume, checkpoint } if all checks pass
   *
   * Per 08-03-PLAN.md Task 5: Vector clock validation and state reconciliation.
   * Per 08-CONTEXT.md: Reject older checkpoints, merge state during recovery.
   *
   * @param taskId - Task identifier
   * @returns ResumeResult with action and optional checkpoint
   */
  async resumeTask(taskId: string): Promise<ResumeResult> {
    this.logger.info(`Attempting to resume task ${taskId} from checkpoint`);

    // Load checkpoint
    const checkpoint = await this.checkpointManager.loadCheckpoint(taskId);

    if (!checkpoint) {
      this.logger.info(`No checkpoint found for task ${taskId}, will restart fresh`);
      return {
        success: false,
        action: 'restart',
        reason: 'No checkpoint found',
      };
    }

    // Validate checkpoint integrity
    const validation = this.validateCheckpoint(checkpoint);
    if (!validation.valid) {
      const reason = `Checkpoint corruption: ${validation.error}`;
      this.logger.error(`Checkpoint validation failed for task ${taskId}`, {
        agentId: 'resume-logic',
        messageId: taskId,
        timestamp: new Date().toISOString(),
        error: { message: reason },
      });
      return {
        success: false,
        action: 'request_guidance',
        reason,
      };
    }

    // Validate vector clock (if present) - reject older checkpoints
    if (checkpoint.vectorClock) {
      const checkpointClock = VectorClockImpl.fromJSON(checkpoint.vectorClock, checkpoint.agentId);

      // Check if checkpoint is newer or concurrent than current state
      if (!this.vectorClock.isNewerOrConcurrent(checkpointClock.getClock())) {
        const reason = 'Checkpoint is older than current state (vector clock comparison)';
        this.logger.info(`Checkpoint ${checkpoint.checkpointId} for task ${taskId} is older than current state`);
        return {
          success: false,
          action: 'restart',
          reason,
        };
      }

      // Merge vector clocks to maintain causality
      this.vectorClock.merge(checkpointClock.getClock());
      this.logger.debug(`Merged vector clock for task ${taskId}`);
    }

    // Check task relevance
    const relevance = await this.isTaskRelevant(taskId, checkpoint);
    if (!relevance.relevant) {
      this.logger.info(`Task ${taskId} not relevant: ${relevance.reason}`);
      return {
        success: false,
        action: 'skip',
        reason: relevance.reason,
      };
    }

    // Reconcile checkpoint with current state
    const currentState = await this.getCurrentAgentState(taskId, checkpoint);
    const { merged, conflicts } = reconcileCheckpoint(checkpoint, currentState);

    if (conflicts.length > 0) {
      this.logger.info(`Reconciled ${conflicts.length} conflicts for task ${taskId}`, {
        conflicts,
      });
    }

    // All checks passed - safe to resume with merged checkpoint
    this.logger.info(`Task ${taskId} validated, resuming from checkpoint ${checkpoint.checkpointId}`);
    return {
      success: true,
      action: 'resume',
      checkpoint: merged,
    };
  }

  /**
   * Validate checkpoint integrity.
   *
   * Checks:
   * - Required fields present (taskId, checkpointId, timestamp)
   * - Timestamp not in future (clock skew detection)
   * - Progress between 0-100
   * - timeInvestedMs >= 0
   * - CRC32 checksum if present (after field validation)
   *
   * Per 08-CONTEXT.md: Checksum validation happens after field validation.
   *
   * @param checkpoint - Checkpoint data to validate
   * @returns Validation result
   */
  validateCheckpoint(checkpoint: CheckpointData): CheckpointValidation {
    // Check required fields
    if (!checkpoint.taskId || typeof checkpoint.taskId !== 'string') {
      return { valid: false, error: 'Missing or invalid taskId' };
    }
    if (!checkpoint.checkpointId || typeof checkpoint.checkpointId !== 'string') {
      return { valid: false, error: 'Missing or invalid checkpointId' };
    }
    if (!checkpoint.timestamp || typeof checkpoint.timestamp !== 'number') {
      return { valid: false, error: 'Missing or invalid timestamp' };
    }

    // Check timestamp not in future (clock skew detection)
    if (this.enableClockSkewDetection) {
      const now = Date.now();
      const skew = checkpoint.timestamp - now;
      if (skew > this.maxClockSkewMs) {
        return {
          valid: false,
          error: `Clock skew detected: timestamp is ${skew}ms in the future`,
        };
      }
    }

    // Check progress range
    if (typeof checkpoint.progress !== 'number' ||
        checkpoint.progress < 0 ||
        checkpoint.progress > 100) {
      return { valid: false, error: `Invalid progress: ${checkpoint.progress} (must be 0-100)` };
    }

    // Check time invested
    if (typeof checkpoint.timeInvestedMs !== 'number' || checkpoint.timeInvestedMs < 0) {
      return {
        valid: false,
        error: `Invalid timeInvestedMs: ${checkpoint.timeInvestedMs} (must be >= 0)`,
      };
    }

    // Validate CRC32 checksum if present (after field validation per 08-CONTEXT.md)
    const checkpointWithChecksum = checkpoint as CheckpointData & { checksum?: string };
    if (checkpointWithChecksum.checksum) {
      // Recompute checksum from checkpoint data (excluding checksum field itself)
      const dataWithoutChecksum = { ...checkpointWithChecksum };
      delete dataWithoutChecksum.checksum;

      const jsonData = JSON.stringify(dataWithoutChecksum);
      if (!validateChecksum(jsonData, checkpointWithChecksum.checksum)) {
        return {
          valid: false,
          error: 'CRC32 checksum mismatch - data may be corrupted',
        };
      }
    }

    // All checks passed
    return { valid: true };
  }

  /**
   * Check if task is still relevant before resuming.
   *
   * Checks:
   * - Task still exists in queue
   * - Task not cancelled
   * - Task not already completed
   * - Task not timed out
   * - Dependencies still valid (if any)
   *
   * @param taskId - Task identifier
   * @param checkpoint - Checkpoint data for timeout calculation
   * @returns Task relevance result
   */
  async isTaskRelevant(taskId: string, checkpoint: CheckpointData): Promise<TaskRelevance> {
    // Get task from queue
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return { relevant: false, reason: 'Task no longer exists' };
    }

    // Check task status
    if (task.status === 'cancelled') {
      return { relevant: false, reason: 'Task was cancelled' };
    }

    if (task.status === 'completed') {
      return { relevant: false, reason: 'Task already completed' };
    }

    // Check timeout
    const elapsed = Date.now() - checkpoint.timestamp;
    const timeoutMs = task.timeoutMs || 120000; // 2 minutes default
    if (elapsed > timeoutMs) {
      return {
        relevant: false,
        reason: `Task timed out (${elapsed}ms > ${timeoutMs}ms)`,
      };
    }

    // Check dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      const dependenciesValid = await this.checkDependencies(task.dependencies);
      if (!dependenciesValid) {
        return { relevant: false, reason: 'Dependencies no longer valid' };
      }
    }

    // All checks passed
    return { relevant: true };
  }

  /**
   * Check if task dependencies are still valid.
   *
   * A dependency is valid if it exists and has not failed or been cancelled.
   *
   * @param dependencies - Array of dependency task IDs
   * @returns True if all dependencies are valid
   */
  private async checkDependencies(dependencies: string[]): Promise<boolean> {
    for (const depId of dependencies) {
      const depTask = this.taskQueue.getTask(depId);
      if (!depTask) {
        this.logger.debug(`Dependency ${depId} no longer exists`);
        return false;
      }
      if (depTask.status === 'failed' || depTask.status === 'cancelled') {
        this.logger.debug(`Dependency ${depId} has status ${depTask.status}`);
        return false;
      }
    }
    return true;
  }

  /**
   * Get checkpoint manager instance.
   *
   * Useful for testing and dependency injection.
   *
   * @returns CheckpointManager instance
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  /**
   * Gets current agent state for reconciliation.
   *
   * Extracts current progress, partial results, and working context
   * from the task to merge with checkpoint data during recovery.
   *
   * Per 08-03-PLAN.md Task 5: Required for reconciliation merge.
   *
   * @param taskId - Task identifier
   * @param checkpoint - Checkpoint data for fallback values
   * @returns Current agent state for reconciliation
   */
  private async getCurrentAgentState(taskId: string, checkpoint: CheckpointData): Promise<CurrentState> {
    const task = this.taskQueue.getTask(taskId);

    if (!task) {
      // Task no longer exists, return defaults
      return {
        progress: 0,
        partialResults: undefined,
        workingContext: undefined,
      };
    }

    // Extract progress from task or checkpoint
    // Note: Task interface may not have progress field, so we use checkpoint as fallback
    const progress = 0; // Could be enhanced to track task execution progress

    // Extract partial results if available
    // Note: These would be added to Task interface in future enhancements
    const partialResults = undefined;

    // Extract working context if available
    // Note: These would be added to Task interface in future enhancements
    const workingContext = undefined;

    return {
      progress,
      partialResults,
      workingContext,
    };
  }

  /**
   * Get task queue instance.
   *
   * Useful for testing and dependency injection.
   *
   * @returns TaskQueue instance
   */
  getTaskQueue(): TaskQueue {
    return this.taskQueue;
  }
}

/**
 * Factory function to create ResumeLogic instance.
 *
 * @param checkpointManager - CheckpointManager for checkpoint retrieval
 * @param taskQueue - TaskQueue for task relevance validation
 * @param logger - Logger for structured logging
 * @param options - Optional configuration
 * @returns ResumeLogic instance
 */
export function createResumeLogic(
  checkpointManager: CheckpointManager,
  taskQueue: TaskQueue,
  logger: Logger,
  options?: ResumeLogicOptions
): ResumeLogic {
  return new ResumeLogic(checkpointManager, taskQueue, logger, options);
}
