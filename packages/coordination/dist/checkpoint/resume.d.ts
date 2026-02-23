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
import type { TaskQueue } from '../state/task-queue.js';
import type { Logger } from '../errors/logger.js';
import type { CheckpointData } from './types.js';
import type { ResumeResult } from './types.js';
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
export declare class ResumeLogic {
    private readonly checkpointManager;
    private readonly taskQueue;
    private readonly logger;
    private readonly maxClockSkewMs;
    private readonly enableClockSkewDetection;
    private readonly vectorClock;
    /**
     * Creates a new ResumeLogic instance.
     *
     * @param checkpointManager - CheckpointManager for checkpoint retrieval
     * @param taskQueue - TaskQueue for task relevance validation
     * @param logger - Logger for structured logging
     * @param options - Optional configuration
     */
    constructor(checkpointManager: CheckpointManager, taskQueue: TaskQueue, logger: Logger, options?: ResumeLogicOptions);
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
    resumeTask(taskId: string): Promise<ResumeResult>;
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
    validateCheckpoint(checkpoint: CheckpointData): CheckpointValidation;
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
    isTaskRelevant(taskId: string, checkpoint: CheckpointData): Promise<TaskRelevance>;
    /**
     * Check if task dependencies are still valid.
     *
     * A dependency is valid if it exists and has not failed or been cancelled.
     *
     * @param dependencies - Array of dependency task IDs
     * @returns True if all dependencies are valid
     */
    private checkDependencies;
    /**
     * Get checkpoint manager instance.
     *
     * Useful for testing and dependency injection.
     *
     * @returns CheckpointManager instance
     */
    getCheckpointManager(): CheckpointManager;
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
    private getCurrentAgentState;
    /**
     * Get task queue instance.
     *
     * Useful for testing and dependency injection.
     *
     * @returns TaskQueue instance
     */
    getTaskQueue(): TaskQueue;
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
export declare function createResumeLogic(checkpointManager: CheckpointManager, taskQueue: TaskQueue, logger: Logger, options?: ResumeLogicOptions): ResumeLogic;
export {};
//# sourceMappingURL=resume.d.ts.map