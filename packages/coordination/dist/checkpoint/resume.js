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
    checkpointManager;
    taskQueue;
    logger;
    maxClockSkewMs;
    enableClockSkewDetection;
    /**
     * Creates a new ResumeLogic instance.
     *
     * @param checkpointManager - CheckpointManager for checkpoint retrieval
     * @param taskQueue - TaskQueue for task relevance validation
     * @param logger - Logger for structured logging
     * @param options - Optional configuration
     */
    constructor(checkpointManager, taskQueue, logger, options = {}) {
        this.checkpointManager = checkpointManager;
        this.taskQueue = taskQueue;
        this.logger = logger;
        this.maxClockSkewMs = options.maxClockSkewMs ?? 60000; // 1 minute default
        this.enableClockSkewDetection = options.enableClockSkewDetection ?? true;
    }
    /**
     * Resume task from checkpoint with validation.
     *
     * Flow:
     * 1. Load checkpoint via checkpointManager.loadCheckpoint()
     * 2. Return { restart } if no checkpoint found
     * 3. Validate checkpoint integrity via validateCheckpoint()
     * 4. Return { request_guidance } if validation fails
     * 5. Check task relevance via isTaskRelevant()
     * 6. Return appropriate ResumeResult based on relevance
     * 7. Return { resume, checkpoint } if all checks pass
     *
     * @param taskId - Task identifier
     * @returns ResumeResult with action and optional checkpoint
     */
    async resumeTask(taskId) {
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
        // All checks passed - safe to resume
        this.logger.info(`Task ${taskId} validated, resuming from checkpoint ${checkpoint.checkpointId}`);
        return {
            success: true,
            action: 'resume',
            checkpoint,
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
     *
     * @param checkpoint - Checkpoint data to validate
     * @returns Validation result
     */
    validateCheckpoint(checkpoint) {
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
    async isTaskRelevant(taskId, checkpoint) {
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
    async checkDependencies(dependencies) {
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
    getCheckpointManager() {
        return this.checkpointManager;
    }
    /**
     * Get task queue instance.
     *
     * Useful for testing and dependency injection.
     *
     * @returns TaskQueue instance
     */
    getTaskQueue() {
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
export function createResumeLogic(checkpointManager, taskQueue, logger, options) {
    return new ResumeLogic(checkpointManager, taskQueue, logger, options);
}
//# sourceMappingURL=resume.js.map