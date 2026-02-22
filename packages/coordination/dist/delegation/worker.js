/**
 * Worker Task Executor for Task Execution with Progress Tracking
 *
 * Enables worker agents to receive and execute tasks with progress tracking,
 * timeout monitoring, and result publishing.
 *
 * Per TASK-03: Worker agent receives task, executes it, and publishes completion result.
 * Per STAT-02: Agents publish progress updates when working on long-running tasks.
 * Per STAT-03: Agents publish completion results when tasks finish (success or failure).
 * Per COMM-06: Task results use QoS 1 for at-least-once delivery.
 * Per 04-02-PLAN.md Task 4: Integrated resume logic and memory monitoring.
 *
 * @see 03-RESEARCH.md Pattern: Worker Task Execution Wrapper
 */
import { v4 as uuidv4 } from 'uuid';
import { Topics } from '../communication/topics.js';
import { classifyError } from './timeout.js';
import { createProgressReporter } from './progress.js';
/**
 * Worker task executor for task execution wrapper.
 *
 * Subscribes to command topic, executes tasks with progress tracking,
 * handles timeouts and cancellation, publishes results.
 *
 * Agent-specific implementations extend this class and implement
 * the protected doWork() method with actual task logic.
 *
 * @example
 * ```ts
 * class BuilderExecutor extends WorkerTaskExecutor {
 *   protected async doWork(payload: unknown, onProgress) {
 *     onProgress(25, 'Starting build');
 *     // ... build logic
 *     onProgress(100, 'Build complete');
 *     return { buildOutput: '...' };
 *   }
 * }
 *
 * const executor = new BuilderExecutor('builder-1', mqttClient, taskQueue, timeoutMonitor);
 * // Executor automatically subscribes to command topic in constructor
 * ```
 */
export class WorkerTaskExecutor {
    agentId;
    mqttClient;
    taskQueue;
    timeoutMonitor;
    retryManager;
    /** Active task progress reporters keyed by task ID */
    activeTasks;
    /** Task execution start times keyed by task ID */
    taskStartTimes;
    /** Optional resume logic for checkpoint recovery */
    resumeLogic;
    /** Optional memory monitor for automatic memory tracking */
    memoryMonitor;
    /**
     * Creates a new worker task executor.
     *
     * Automatically subscribes to command topic in constructor.
     * Starts memory monitor if provided.
     *
     * @param agentId - This agent's ID
     * @param mqttClient - MQTT client for publishing results
     * @param taskQueue - Task queue for status updates
     * @param timeoutMonitor - Timeout monitor for task timeout tracking
     * @param retryManager - Retry manager for error handling
     * @param options - Optional configuration including resumeLogic and memoryMonitor
     */
    constructor(agentId, mqttClient, taskQueue, timeoutMonitor, retryManager, options = {}) {
        this.agentId = agentId;
        this.mqttClient = mqttClient;
        this.taskQueue = taskQueue;
        this.timeoutMonitor = timeoutMonitor;
        this.retryManager = retryManager;
        this.activeTasks = new Map();
        this.taskStartTimes = new Map();
        // Store optional components
        this.resumeLogic = options.resumeLogic;
        this.memoryMonitor = options.memoryMonitor;
        // Set up command handler (subscribe to task topic)
        this.setupCommandHandler();
    }
    /**
     * Subscribe to command topic and set up message handler.
     * Called in constructor to register task command listener.
     */
    setupCommandHandler() {
        const topic = Topics.taskCommand(this.agentId);
        // Subscribe to command topic via mqtt client's event system
        this.mqttClient.on('message', (envelope, receivedTopic) => {
            if (receivedTopic === topic) {
                this.handleCommand(envelope).catch(error => {
                    console.error('Error handling command:', error);
                });
            }
        });
    }
    /**
     * Handle incoming command message.
     * Routes to appropriate handler based on message type.
     *
     * @param envelope - Received message envelope
     */
    async handleCommand(envelope) {
        if (envelope.type === 'task') {
            await this.executeTask(envelope.payload);
        }
        else if (envelope.type === 'cancel') {
            await this.handleCancellation(envelope.payload);
        }
    }
    /**
     * Execute task with progress tracking and timeout monitoring.
     *
     * Flow:
     * 1. Check for resume logic and attempt to resume from checkpoint
     * 2. Update task status to 'in_progress'
     * 3. Create ProgressReporter and start monitoring
     * 4. Start timeout monitoring
     * 5. Call doWork() with progress callback (or resume state)
     * 6. Send result (success or failure)
     * 7. Cleanup: cancel timeout, stop progress reporter
     *
     * Per 04-02-PLAN.md Task 4: Resume from checkpoint by default.
     *
     * @param command - Task command payload
     */
    async executeTask(command) {
        const { taskId, payload, timeoutMs, maxRetries = 3 } = command;
        const startTime = Date.now();
        // Attempt to resume from checkpoint if resume logic is available
        let workingContext;
        if (this.resumeLogic) {
            try {
                const result = await this.resumeLogic.resumeTask(taskId);
                if (result.success && result.action === 'resume' && result.checkpoint) {
                    // Load checkpoint state for resuming
                    workingContext = result.checkpoint.workingContext;
                    console.info(`Resumed task ${taskId} from checkpoint ${result.checkpoint.checkpointId}`);
                }
                else if (result.action === 'restart') {
                    console.info(`No checkpoint for task ${taskId}, starting fresh`);
                }
                else if (result.action === 'skip') {
                    console.info(`Skipping task ${taskId}: ${result.reason}`);
                    // Send skipped result
                    await this.sendResult(taskId, {
                        taskId,
                        success: false,
                        error: {
                            type: 'permanent',
                            message: result.reason || 'Task skipped',
                        },
                        executionTime: 0,
                    });
                    return;
                }
                else if (result.action === 'request_guidance') {
                    console.warn(`Checkpoint corruption for task ${taskId}, requesting guidance`);
                    // TODO: Implement guidance request system
                    await this.sendResult(taskId, {
                        taskId,
                        success: false,
                        error: {
                            type: 'permanent',
                            message: result.reason || 'Checkpoint corruption detected, guidance requested',
                        },
                        executionTime: 0,
                    });
                    return;
                }
            }
            catch (error) {
                console.error(`Resume logic failed for task ${taskId}: ${error}`);
                // Continue with fresh start on resume failure
            }
        }
        // Store start time
        this.taskStartTimes.set(taskId, startTime);
        // Update task status to in_progress
        this.taskQueue.updateTaskStatus(taskId, 'in_progress', this.agentId);
        // Create and start progress reporter
        const progressReporter = createProgressReporter(taskId, this.agentId, this.mqttClient);
        progressReporter.start(0);
        this.activeTasks.set(taskId, progressReporter);
        // Progress callback for doWork implementation
        const onProgress = (progress, message) => {
            progressReporter.update(progress, message);
            // Update task in database with progress timestamp
            const progressData = {
                taskId,
                agentId: this.agentId,
                progress,
                message,
                timestamp: Date.now(),
            };
            this.taskQueue.updateTaskProgress(taskId, progressData);
        };
        // Start timeout monitoring
        this.timeoutMonitor.startTimeout(taskId, timeoutMs, 0, // Initial attempt (retryCount 0)
        maxRetries, (tid, retryCount) => this.handleTimeout(tid, retryCount));
        try {
            // Execute task with resume context if available
            const taskPayload = workingContext !== undefined ? workingContext : payload;
            const result = await this.doWork(taskPayload, onProgress);
            // Calculate execution time
            const executionTime = Date.now() - startTime;
            // Send success result
            await this.sendResult(taskId, {
                taskId,
                success: true,
                result,
                executionTime,
            });
            // Cleanup
            this.timeoutMonitor.cancelTimeout(taskId);
            progressReporter.stop();
            this.activeTasks.delete(taskId);
            this.taskStartTimes.delete(taskId);
            // Update task status to completed
            this.taskQueue.updateTaskStatus(taskId, 'completed');
        }
        catch (error) {
            // Handle failure via dedicated method
            await this.handleFailure(taskId, error, progressReporter);
        }
    }
    /**
     * Handle task failure.
     *
     * Classifies error, checks if should retry, and either schedules retry
     * or sends failure result to Minerva.
     *
     * Per ERRO-02: Errors classified as retryable (transient) vs abort (permanent)
     * Per ERRO-01: Failed tasks automatically retried with exponential backoff
     *
     * @param taskId - Task ID that failed
     * @param error - Error that occurred
     * @param progressReporter - Progress reporter to clean up
     */
    async handleFailure(taskId, error, progressReporter) {
        // Classify error
        const errorType = classifyError(error);
        // Get task for retry configuration
        const task = this.taskQueue.getTask(taskId);
        if (!task) {
            console.warn(`Task not found for failure handling: ${taskId}`);
            return;
        }
        const retryCount = task.retryCount ?? 0;
        const maxRetries = task.maxRetries ?? 3;
        const executionTime = this.taskStartTimes.get(taskId)
            ? Date.now() - this.taskStartTimes.get(taskId)
            : 0;
        // Check if should retry
        if (this.retryManager.shouldRetry(error, retryCount, maxRetries)) {
            // Calculate backoff
            const backoff = this.retryManager.calculateBackoff(retryCount);
            // Schedule retry via RetryManager
            await this.retryManager.scheduleRetry(taskId, error);
            // Cleanup: progressReporter, timeoutMonitor, activeTasks
            progressReporter.stop();
            this.timeoutMonitor.cancelTimeout(taskId);
            this.activeTasks.delete(taskId);
            this.taskStartTimes.delete(taskId);
            // Update task status to pending for re-dispatch
            this.taskQueue.updateTaskStatus(taskId, 'pending');
            console.log(`Task ${taskId} failed with ${errorType} error, scheduled retry in ${backoff.toFixed(0)}ms`);
        }
        else {
            // Should not retry (permanent error or exhausted)
            // Send failure result
            await this.sendResult(taskId, {
                taskId,
                success: false,
                error: {
                    type: errorType,
                    message: error.message,
                    code: error.code,
                    stack: error.stack,
                },
                executionTime,
            });
            // Cleanup: progressReporter, timeoutMonitor, activeTasks
            progressReporter.stop();
            this.timeoutMonitor.cancelTimeout(taskId);
            this.activeTasks.delete(taskId);
            this.taskStartTimes.delete(taskId);
            // Update task status to failed
            this.taskQueue.updateTaskStatus(taskId, 'failed', undefined, errorType);
            console.log(`Task ${taskId} failed with ${errorType} error, no retry`);
        }
    }
    /**
     * Request guidance if error indicates ambiguous situation.
     *
     * Checks error message for patterns indicating need for human guidance.
     * If found, creates GuidanceRequest and calls requestGuidance().
     *
     * Per ERRO-05: Agents can request guidance from Minerva when encountering ambiguous situations
     *
     * @param error - Error to check for ambiguity
     * @param taskId - Task ID for context
     */
    async requestGuidanceIfNeeded(error, taskId) {
        const ambiguousPatterns = [
            /ambiguous/i,
            /unclear/i,
            /multiple options/i,
            /guidance/i,
            /uncertain/i,
        ];
        const message = error.message.toLowerCase();
        const isAmbiguous = ambiguousPatterns.some(p => p.test(message));
        if (!isAmbiguous) {
            return; // Not ambiguous, no guidance needed
        }
        // Create guidance request and request guidance
        // TODO: Integrate GuidanceRequest class when available
        // For now, just log the situation
        console.warn(`Ambiguous situation encountered for task ${taskId}: ${error.message}`);
        console.warn(`Agent ${this.agentId} should request guidance from Minerva`);
    }
    /**
     * Handle task timeout.
     *
     * If retry count <= max retries: re-queue task as pending for re-dispatch.
     * If retry count > max retries: notify Minerva (currently logs error).
     *
     * @param taskId - Task ID that timed out
     * @param retryCount - Current retry attempt
     */
    async handleTimeout(taskId, retryCount) {
        const task = this.taskQueue.getTask(taskId);
        if (!task || task.status !== 'in_progress') {
            return; // Task already completed/failed/cancelled
        }
        const maxRetries = task.maxRetries ?? 3;
        if (retryCount <= maxRetries) {
            // Retry: re-queue task as pending for re-dispatch
            this.taskQueue.updateTaskStatus(taskId, 'pending');
            console.log(`Task ${taskId} timed out, re-queued for retry (${retryCount}/${maxRetries})`);
        }
        else {
            // Max retries exhausted: notify Minerva
            // TODO: Implement proper Minerva notification system
            console.error(`Task ${taskId} failed after ${maxRetries} retries (timeout exhausted)`);
        }
    }
    /**
     * Send task result via MQTT.
     *
     * Creates MessageEnvelope with result payload and publishes to
     * agent/{id}/result topic with QoS 1 (at-least-once delivery).
     *
     * Per COMM-06: Task results use QoS 1 for at-least-once delivery.
     *
     * @param taskId - Task ID
     * @param result - Result payload
     */
    async sendResult(taskId, result) {
        const envelope = {
            messageId: uuidv4(),
            idempotencyKey: uuidv4(),
            from: this.agentId,
            type: 'result',
            timestamp: Date.now(),
            payload: result,
            qos: 1, // At-least-once delivery per COMM-06
            retain: false,
        };
        const topic = Topics.taskResult(this.agentId);
        await this.mqttClient.publish(topic, envelope);
    }
    /**
     * Handle task cancellation.
     *
     * Stops progress reporter, cancels timeout, cancels pending retry,
     * updates task status. Publishes acknowledgment to result topic.
     *
     * @param cancelPayload - Cancellation payload
     */
    async handleCancellation(cancelPayload) {
        const { taskId } = cancelPayload;
        // Get progress reporter
        const progressReporter = this.activeTasks.get(taskId);
        if (progressReporter) {
            // Stop progress reporting
            progressReporter.stop();
            this.activeTasks.delete(taskId);
        }
        // Cancel timeout
        this.timeoutMonitor.cancelTimeout(taskId);
        // Cancel pending retry if task is being retried
        this.retryManager.cancelRetry(taskId);
        // Update task status to cancelled
        this.taskQueue.updateTaskStatus(taskId, 'cancelled');
        // Publish acknowledgment
        await this.sendResult(taskId, {
            taskId,
            success: false,
            error: {
                type: 'permanent',
                message: 'Task cancelled by orchestrator',
            },
            executionTime: this.taskStartTimes.get(taskId)
                ? Date.now() - this.taskStartTimes.get(taskId)
                : 0,
        });
        // Clean up start time
        this.taskStartTimes.delete(taskId);
        console.log(`Task ${taskId} cancellation acknowledged by ${this.agentId}`);
    }
    /**
     * Agent-specific work implementation.
     *
     * This method MUST be implemented by agent subclass.
     * Contains the actual task execution logic.
     *
     * @param payload - Task-specific payload data
     * @param onProgress - Callback to report progress during execution
     * @returns Task result data
     */
    async doWork(payload, onProgress) {
        throw new Error('doWork must be implemented by agent subclass');
    }
    /**
     * Get count of active tasks.
     *
     * Useful for capacity checking.
     *
     * @returns Number of currently executing tasks
     */
    getActiveTaskCount() {
        return this.activeTasks.size;
    }
    /**
     * Check if executor is at capacity.
     *
     * @param maxCapacity - Maximum concurrent tasks
     * @returns true if at or above capacity
     */
    isAtCapacity(maxCapacity) {
        return this.activeTasks.size >= maxCapacity;
    }
    /**
     * Start the executor and associated services.
     *
     * Starts memory monitor if configured.
     * Override in subclass for additional startup logic.
     */
    start() {
        if (this.memoryMonitor && !this.memoryMonitor.isMonitoring()) {
            this.memoryMonitor.start();
            console.info(`Memory monitor started for agent ${this.agentId}`);
        }
    }
    /**
     * Stop the executor and cleanup resources.
     *
     * Stops memory monitor if configured.
     * Waits for active tasks to complete or timeout.
     *
     * Per 04-02-PLAN.md Task 4: Stop memory monitor in shutdown.
     */
    async stop() {
        // Stop memory monitor
        if (this.memoryMonitor && this.memoryMonitor.isMonitoring()) {
            this.memoryMonitor.stop();
            console.info(`Memory monitor stopped for agent ${this.agentId}`);
        }
        // Note: Active tasks are allowed to complete naturally.
        // For graceful shutdown with task completion, use GracefulShutdown.
    }
    /**
     * Get memory monitor instance if configured.
     *
     * Useful for testing and monitoring.
     *
     * @returns MemoryMonitor instance or undefined
     */
    getMemoryMonitor() {
        return this.memoryMonitor;
    }
    /**
     * Get resume logic instance if configured.
     *
     * Useful for testing and checkpoint management.
     *
     * @returns ResumeLogic instance or undefined
     */
    getResumeLogic() {
        return this.resumeLogic;
    }
}
/**
 * Convenience function to create worker task executor.
 *
 * @param agentId - This agent's ID
 * @param mqttClient - MQTT client for publishing results
 * @param taskQueue - Task queue for status updates
 * @param timeoutMonitor - Timeout monitor for task timeout tracking
 * @param retryManager - Retry manager for error handling
 * @param options - Optional configuration
 * @returns WorkerTaskExecutor instance
 */
export function createWorkerTaskExecutor(agentId, mqttClient, taskQueue, timeoutMonitor, retryManager, options) {
    return new WorkerTaskExecutor(agentId, mqttClient, taskQueue, timeoutMonitor, retryManager, options);
}
//# sourceMappingURL=worker.js.map