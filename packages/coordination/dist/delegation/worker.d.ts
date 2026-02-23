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
import type { MqttClient } from '../communication/mqtt.js';
import type { TaskQueue } from '../state/task-queue.js';
import type { TimeoutMonitor } from './timeout.js';
import type { RetryManager } from './retry.js';
import type { GuidanceRequest } from './guidance.js';
import type { ProgressReporter } from './progress.js';
import type { ResumeLogic } from '../checkpoint/resume.js';
import type { MemoryMonitor } from '../memory/monitor.js';
/**
 * Task result payload for completion messages.
 */
export interface TaskResultPayload {
    /** Task ID this result belongs to */
    taskId: string;
    /** Whether task execution succeeded */
    success: boolean;
    /** Structured result data (if successful) */
    result?: unknown;
    /** Partial results for failed tasks */
    partialResult?: unknown;
    /** Error details (if failed) */
    error?: {
        /** Error type for retry decision */
        type: 'transient' | 'permanent';
        /** Human-readable error message */
        message: string;
        /** Optional error code */
        code?: string;
        /** Stack trace for debugging */
        stack?: string;
    };
    /** Execution time in milliseconds */
    executionTime: number;
}
/**
 * Task cancellation payload.
 */
export interface TaskCancelPayload {
    /** Task ID to cancel */
    taskId: string;
    /** Optional cancellation reason */
    reason?: string;
}
/**
 * Progress callback type for task execution.
 * Called by agent-specific doWork implementation to report progress.
 */
export type ProgressCallback = (progress: number, message?: string) => void;
/**
 * Worker task executor options.
 */
export interface WorkerTaskExecutorOptions {
    /** Enable progress tracking (default: true) */
    enableProgress?: boolean;
    /** Optional resume logic for checkpoint recovery */
    resumeLogic?: ResumeLogic;
    /** Optional memory monitor for automatic memory tracking */
    memoryMonitor?: MemoryMonitor;
    /** Optional guidance request for ambiguous error handling (ERRO-05) */
    guidanceRequest?: GuidanceRequest;
}
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
export declare class WorkerTaskExecutor {
    protected agentId: string;
    protected mqttClient: MqttClient;
    protected taskQueue: TaskQueue;
    protected timeoutMonitor: TimeoutMonitor;
    protected retryManager: RetryManager;
    /** Active task progress reporters keyed by task ID */
    protected activeTasks: Map<string, ProgressReporter>;
    /** Task execution start times keyed by task ID */
    private taskStartTimes;
    /** Pause check intervals keyed by task ID */
    private pauseCheckIntervals;
    /** Optional resume logic for checkpoint recovery */
    private resumeLogic?;
    /** Optional memory monitor for automatic memory tracking */
    private memoryMonitor?;
    /** Optional guidance request for ambiguous error handling */
    protected guidanceRequest?: GuidanceRequest;
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
     * @param options - Optional configuration including resumeLogic, memoryMonitor, and guidanceRequest
     */
    constructor(agentId: string, mqttClient: MqttClient, taskQueue: TaskQueue, timeoutMonitor: TimeoutMonitor, retryManager: RetryManager, options?: WorkerTaskExecutorOptions);
    /**
     * Subscribe to command topic and set up message handler.
     * Called in constructor to register task command listener.
     */
    private setupCommandHandler;
    /**
     * Check if agent is overloaded before accepting task.
     *
     * Per ROUT-04: Agents can reject tasks when overloaded (CPU or memory above 85%).
     *
     * @returns true if overloaded, false if can accept task
     */
    private isOverloaded;
    /**
     * Send task rejection message.
     *
     * Per ROUT-04: Worker rejects task when overloaded.
     *
     * @param taskId - Task ID being rejected
     * @param reason - Rejection reason
     */
    private sendRejection;
    /**
     * Handle incoming command message.
     * Routes to appropriate handler based on message type.
     *
     * @param envelope - Received message envelope
     */
    private handleCommand;
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
    private executeTask;
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
    private handleFailure;
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
    requestGuidanceIfNeeded(error: Error, taskId: string): Promise<void>;
    /**
     * Handle task timeout.
     *
     * If retry count <= max retries: re-queue task as pending for re-dispatch.
     * If retry count > max retries: notify Minerva (currently logs error).
     *
     * @param taskId - Task ID that timed out
     * @param retryCount - Current retry attempt
     */
    private handleTimeout;
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
    private sendResult;
    /**
     * Handle task cancellation.
     *
     * Stops progress reporter, cancels timeout, cancels pending retry,
     * updates task status. Publishes acknowledgment to result topic.
     *
     * @param cancelPayload - Cancellation payload
     */
    private handleCancellation;
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
    protected doWork(payload: unknown, onProgress: ProgressCallback): Promise<unknown>;
    /**
     * Get count of active tasks.
     *
     * Useful for capacity checking.
     *
     * @returns Number of currently executing tasks
     */
    getActiveTaskCount(): number;
    /**
     * Check if executor is at capacity.
     *
     * @param maxCapacity - Maximum concurrent tasks
     * @returns true if at or above capacity
     */
    isAtCapacity(maxCapacity: number): boolean;
    /**
     * Start the executor and associated services.
     *
     * Starts memory monitor if configured.
     * Override in subclass for additional startup logic.
     */
    start(): void;
    /**
     * Stop the executor and cleanup resources.
     *
     * Stops memory monitor if configured.
     * Waits for active tasks to complete or timeout.
     *
     * Per 04-02-PLAN.md Task 4: Stop memory monitor in shutdown.
     */
    stop(): Promise<void>;
    /**
     * Get memory monitor instance if configured.
     *
     * Useful for testing and monitoring.
     *
     * @returns MemoryMonitor instance or undefined
     */
    getMemoryMonitor(): MemoryMonitor | undefined;
    /**
     * Get resume logic instance if configured.
     *
     * Useful for testing and checkpoint management.
     *
     * @returns ResumeLogic instance or undefined
     */
    getResumeLogic(): ResumeLogic | undefined;
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
export declare function createWorkerTaskExecutor(agentId: string, mqttClient: MqttClient, taskQueue: TaskQueue, timeoutMonitor: TimeoutMonitor, retryManager: RetryManager, options?: WorkerTaskExecutorOptions): WorkerTaskExecutor;
//# sourceMappingURL=worker.d.ts.map