/**
 * Retry Manager for Automatic Task Retry with Exponential Backoff
 *
 * Manages task retry logic with exponential backoff and jitter.
 * Decides whether to retry based on error classification and retry count.
 * Notifies Minerva when max retries exhausted.
 *
 * Per ERRO-01: Failed tasks automatically retried with exponential backoff (max 3 retries)
 * Per ERRO-02: Errors classified as retryable (transient) vs abort (permanent)
 * Per ERRO-04: Minerva notified when task fails after exhausting retries
 * Per CONTEXT.md: Auto-retry first, Minerva notified after exhaustion
 * Per CONTEXT.md: Per-task retry limit set at delegation
 *
 * @see 03-RESEARCH.md Pattern 4: Exponential backoff with jitter per AWS guidance
 */
import type { TaskQueue } from '../state/task-queue.js';
import type { TimeoutMonitor } from './timeout.js';
import type { MqttClient } from '../communication/mqtt.js';
/**
 * Active retry state.
 */
interface RetryState {
    /** Task ID being retried */
    taskId: string;
    /** Current retry count */
    retryCount: number;
    /** Maximum retries allowed */
    maxRetries: number;
    /** When the retry is scheduled (timestamp) */
    scheduledAt: number;
    /** Retry delay in milliseconds */
    delayMs: number;
    /** Timeout ID for the retry timer */
    timeoutId: NodeJS.Timeout;
}
/**
 * Retry manager options.
 */
export interface RetryManagerOptions {
    /** Maximum delay between retries (default: 30000ms) */
    maxDelayMs?: number;
    /** Jitter amount in milliseconds (default: 1000ms) */
    jitterMs?: number;
}
/**
 * Retry manager for automatic task retry with exponential backoff.
 *
 * Decides whether to retry based on:
 * 1. Error classification (permanent vs transient)
 * 2. Current retry count vs max retries
 *
 * Calculates exponential backoff with jitter:
 * - Base delay: 2^retryCount * 1000ms (1s, 2s, 4s, 8s...)
 * - Jitter: random 0-1000ms
 * - Capped: min(baseDelay + jitter, 30000ms)
 *
 * @example
 * ```ts
 * const retryManager = new RetryManager(taskQueue, timeoutMonitor, mqttClient);
 *
 * // Schedule retry for transient error
 * await retryManager.scheduleRetry('task-123', timeoutError);
 *
 * // Permanent error - will notify Minerva instead of retry
 * await retryManager.scheduleRetry('task-456', validationError);
 *
 * // Cancel pending retry
 * retryManager.cancelRetry('task-123');
 * ```
 */
export declare class RetryManager {
    private taskQueue;
    private timeoutMonitor;
    private mqttClient;
    private activeRetries;
    private maxDelayMs;
    private jitterMs;
    /**
     * Creates a new retry manager.
     *
     * @param taskQueue - Task queue for updating retry counts and status
     * @param timeoutMonitor - Timeout monitor for error classification
     * @param mqttClient - MQTT client for publishing failure notifications to Minerva
     * @param options - Optional configuration
     */
    constructor(taskQueue: TaskQueue, timeoutMonitor: TimeoutMonitor, mqttClient: MqttClient, options?: RetryManagerOptions);
    /**
     * Determine if task should be retried.
     *
     * Decision logic:
     * - Returns false if error is permanent (validation, permission errors)
     * - Returns false if retryCount >= maxRetries (exhausted retries)
     * - Returns true if error is transient and retryCount < maxRetries
     *
     * @param error - Error that occurred
     * @param retryCount - Current retry attempt
     * @param maxRetries - Maximum retry attempts
     * @returns true if should retry, false otherwise
     */
    shouldRetry(error: Error, retryCount: number, maxRetries: number): boolean;
    /**
     * Calculate exponential backoff delay with jitter.
     *
     * Uses the same formula as TimeoutMonitor:
     * - Base delay: 2^retryCount * 1000ms
     * - Jitter: random 0-1000ms
     * - Capped at 30 seconds
     *
     * @param retryCount - Current retry attempt (0-indexed)
     * @returns Delay in milliseconds
     */
    calculateBackoff(retryCount: number): number;
    /**
     * Schedule retry for a failed task.
     *
     * Process:
     * 1. Gets task from TaskQueue
     * 2. Extracts retryCount and maxRetries
     * 3. Checks shouldRetry() with error classification
     * 4. If should not retry: calls notifyExhausted()
     * 5. If should retry:
     *    - Calculates backoff delay
     *    - Increments retryCount
     *    - Updates task in TaskQueue
     *    - Updates task status to 'pending' for re-dispatch
     *    - Stores in activeRetries map
     *    - Logs retry message
     *
     * @param taskId - Task ID to retry
     * @param error - Error that caused failure
     * @throws Error if task not found
     */
    scheduleRetry(taskId: string, error: Error): Promise<void>;
    /**
     * Cancel pending retry for a task.
     *
     * Removes task from activeRetries map and clears timeout.
     * Called when task completes successfully or is cancelled.
     *
     * @param taskId - Task ID to cancel retry for
     */
    cancelRetry(taskId: string): void;
    /**
     * Notify Minerva of exhausted retry attempts.
     *
     * Creates MessageEnvelope with task_failed type and publishes to MQTT.
     * Per ERRO-04: Minerva notified when task fails after exhausting retries.
     *
     * @param taskId - Task ID that exhausted retries
     * @param error - Final error that caused failure
     */
    private notifyExhausted;
    /**
     * Get count of active retries.
     *
     * @returns Number of tasks currently waiting for retry
     */
    getActiveRetryCount(): number;
    /**
     * Check if task is currently being retried.
     *
     * @param taskId - Task ID to check
     * @returns true if task is waiting for retry
     */
    isRetrying(taskId: string): boolean;
    /**
     * Get all active retry states.
     *
     * @returns Array of active retry states
     */
    getActiveRetries(): RetryState[];
    /**
     * Cancel all active retries.
     *
     * Useful for shutdown.
     */
    cancelAll(): void;
}
/**
 * Convenience function to create retry manager.
 *
 * @param taskQueue - Task queue for updating retry counts
 * @param timeoutMonitor - Timeout monitor for error classification
 * @param mqttClient - MQTT client for publishing failure notifications to Minerva
 * @param options - Optional configuration
 * @returns RetryManager instance
 */
export declare function createRetryManager(taskQueue: TaskQueue, timeoutMonitor: TimeoutMonitor, mqttClient: MqttClient, options?: RetryManagerOptions): RetryManager;
export {};
//# sourceMappingURL=retry.d.ts.map