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
import { classifyError, calculateBackoffDelay } from './timeout.js';
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
 * const retryManager = new RetryManager(taskQueue, timeoutMonitor);
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
export class RetryManager {
    taskQueue;
    timeoutMonitor;
    activeRetries = new Map();
    maxDelayMs;
    jitterMs;
    /**
     * Creates a new retry manager.
     *
     * @param taskQueue - Task queue for updating retry counts and status
     * @param timeoutMonitor - Timeout monitor for error classification
     * @param options - Optional configuration
     */
    constructor(taskQueue, timeoutMonitor, options = {}) {
        this.taskQueue = taskQueue;
        this.timeoutMonitor = timeoutMonitor;
        this.maxDelayMs = options.maxDelayMs ?? 30000; // 30 second cap
        this.jitterMs = options.jitterMs ?? 1000; // 1 second jitter
    }
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
    shouldRetry(error, retryCount, maxRetries) {
        // Classify error as transient or permanent
        const errorType = classifyError(error);
        // Permanent errors abort immediately
        if (errorType === 'permanent') {
            return false;
        }
        // Exhausted retries
        if (retryCount >= maxRetries) {
            return false;
        }
        // Transient error with retries remaining
        return true;
    }
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
    calculateBackoff(retryCount) {
        return calculateBackoffDelay(retryCount, this.maxDelayMs, this.jitterMs);
    }
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
    async scheduleRetry(taskId, error) {
        // Get task from queue
        const task = this.taskQueue.getTask(taskId);
        if (!task) {
            throw new Error(`Task not found: ${taskId}`);
        }
        // Extract retry configuration
        const retryCount = task.retryCount ?? 0;
        const maxRetries = task.maxRetries ?? 3;
        // Check if should retry
        if (!this.shouldRetry(error, retryCount, maxRetries)) {
            // Should not retry - notify Minerva and return
            await this.notifyExhausted(taskId, error);
            return;
        }
        // Calculate backoff delay
        const delay = this.calculateBackoff(retryCount);
        const newRetryCount = retryCount + 1;
        const scheduledAt = Date.now();
        // Schedule retry with setTimeout
        const timeoutId = setTimeout(async () => {
            this.activeRetries.delete(taskId);
            // Update task status to pending for re-dispatch
            this.taskQueue.updateTaskStatus(taskId, 'pending');
            console.log(`Task ${taskId} retry scheduled, now available for re-dispatch (attempt ${newRetryCount}/${maxRetries})`);
        }, delay);
        // Store retry state
        this.activeRetries.set(taskId, {
            taskId,
            retryCount: newRetryCount,
            maxRetries,
            scheduledAt,
            delayMs: delay,
            timeoutId,
        });
        // Update task in queue
        this.taskQueue.updateTaskRetry(taskId, newRetryCount);
        console.log(`Task ${taskId} scheduled for retry in ${delay.toFixed(0)}ms (attempt ${newRetryCount}/${maxRetries})`);
    }
    /**
     * Cancel pending retry for a task.
     *
     * Removes task from activeRetries map and clears timeout.
     * Called when task completes successfully or is cancelled.
     *
     * @param taskId - Task ID to cancel retry for
     */
    cancelRetry(taskId) {
        const retryState = this.activeRetries.get(taskId);
        if (!retryState) {
            return; // No pending retry
        }
        clearTimeout(retryState.timeoutId);
        this.activeRetries.delete(taskId);
        console.log(`Cancelled retry for task ${taskId}`);
    }
    /**
     * Notify Minerva of exhausted retry attempts.
     *
     * Creates TaskResult with failure details and publishes notification.
     * Currently stubs the notification - actual Minerva integration to be implemented.
     *
     * @param taskId - Task ID that exhausted retries
     * @param error - Final error that caused failure
     */
    async notifyExhausted(taskId, error) {
        const task = this.taskQueue.getTask(taskId);
        const errorType = classifyError(error);
        // Create failure result
        const failureResult = {
            taskId,
            success: false,
            error: {
                type: errorType,
                message: error.message,
                stack: error.stack,
                reason: `Task failed after ${task?.maxRetries ?? 3} retries`,
            },
            timestamp: Date.now(),
        };
        // TODO: Publish to Minerva via guidance request or dedicated topic
        // For now, just log the failure
        console.error(`Task ${taskId} exhausted retries (${task?.maxRetries ?? 3} attempts). Error: ${error.message}`);
        // Update task status to failed
        this.taskQueue.updateTaskStatus(taskId, 'failed', undefined, errorType);
    }
    /**
     * Get count of active retries.
     *
     * @returns Number of tasks currently waiting for retry
     */
    getActiveRetryCount() {
        return this.activeRetries.size;
    }
    /**
     * Check if task is currently being retried.
     *
     * @param taskId - Task ID to check
     * @returns true if task is waiting for retry
     */
    isRetrying(taskId) {
        return this.activeRetries.has(taskId);
    }
    /**
     * Get all active retry states.
     *
     * @returns Array of active retry states
     */
    getActiveRetries() {
        return Array.from(this.activeRetries.values());
    }
    /**
     * Cancel all active retries.
     *
     * Useful for shutdown.
     */
    cancelAll() {
        for (const [taskId, retryState] of this.activeRetries) {
            clearTimeout(retryState.timeoutId);
        }
        this.activeRetries.clear();
    }
}
/**
 * Convenience function to create retry manager.
 *
 * @param taskQueue - Task queue for updating retry counts
 * @param timeoutMonitor - Timeout monitor for error classification
 * @param options - Optional configuration
 * @returns RetryManager instance
 */
export function createRetryManager(taskQueue, timeoutMonitor, options) {
    return new RetryManager(taskQueue, timeoutMonitor, options);
}
//# sourceMappingURL=retry.js.map