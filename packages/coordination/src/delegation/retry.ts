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

import { v4 as uuidv4 } from 'uuid';
import type { TaskQueue } from '../state/task-queue.js';
import type { TimeoutMonitor } from './timeout.js';
import { classifyError, calculateBackoffDelay } from './timeout.js';
import type { MqttClient } from '../communication/mqtt.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope } from '../communication/message.js';

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
 * Guidance request payload for Minerva notification.
 */
interface GuidanceRequestPayload {
  /** Request ID for tracking */
  requestId: string;
  /** Task ID that failed */
  taskId: string;
  /** Agent ID that was executing (if known) */
  agentId?: string;
  /** Error/situation description */
  situation: string;
  /** Timestamp of request */
  timestamp: number;
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
export class RetryManager {
  private activeRetries: Map<string, RetryState> = new Map();
  private maxDelayMs: number;
  private jitterMs: number;

  /**
   * Creates a new retry manager.
   *
   * @param taskQueue - Task queue for updating retry counts and status
   * @param timeoutMonitor - Timeout monitor for error classification
   * @param mqttClient - MQTT client for publishing failure notifications to Minerva
   * @param options - Optional configuration
   */
  constructor(
    private taskQueue: TaskQueue,
    private timeoutMonitor: TimeoutMonitor,
    private mqttClient: MqttClient,
    options: RetryManagerOptions = {}
  ) {
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
  shouldRetry(error: Error, retryCount: number, maxRetries: number): boolean {
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
  calculateBackoff(retryCount: number): number {
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
  async scheduleRetry(taskId: string, error: Error): Promise<void> {
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

    console.log(
      `Task ${taskId} scheduled for retry in ${delay.toFixed(0)}ms (attempt ${newRetryCount}/${maxRetries})`
    );
  }

  /**
   * Cancel pending retry for a task.
   *
   * Removes task from activeRetries map and clears timeout.
   * Called when task completes successfully or is cancelled.
   *
   * @param taskId - Task ID to cancel retry for
   */
  cancelRetry(taskId: string): void {
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
   * Creates MessageEnvelope with task_failed type and publishes to MQTT.
   * Per ERRO-04: Minerva notified when task fails after exhausting retries.
   *
   * @param taskId - Task ID that exhausted retries
   * @param error - Final error that caused failure
   */
  private async notifyExhausted(taskId: string, error: Error): Promise<void> {
    const task = this.taskQueue.getTask(taskId);
    const errorType = classifyError(error);

    // Create message envelope for Minerva notification
    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: 'retry-manager',
      to: 'minerva',
      type: 'task_failed',
      timestamp: Date.now(),
      payload: {
        taskId,
        agentId: task?.assignedAgent,
        error: {
          type: errorType,
          message: error.message,
          reason: `Task failed after ${task?.maxRetries ?? 3} retries`,
        },
      },
      qos: 1, // At-least-once delivery
      retain: false,
    };

    // Publish to guidance request topic for Minerva (ERRO-04)
    const topic = Topics.guidanceRequest();
    await this.mqttClient.publish(topic, envelope);

    console.log(
      `Task ${taskId} exhausted retries (${task?.maxRetries ?? 3} attempts), notified Minerva via MQTT`
    );

    // Update task status to failed
    this.taskQueue.updateTaskStatus(taskId, 'failed', undefined, errorType);
  }

  /**
   * Get count of active retries.
   *
   * @returns Number of tasks currently waiting for retry
   */
  getActiveRetryCount(): number {
    return this.activeRetries.size;
  }

  /**
   * Check if task is currently being retried.
   *
   * @param taskId - Task ID to check
   * @returns true if task is waiting for retry
   */
  isRetrying(taskId: string): boolean {
    return this.activeRetries.has(taskId);
  }

  /**
   * Get all active retry states.
   *
   * @returns Array of active retry states
   */
  getActiveRetries(): RetryState[] {
    return Array.from(this.activeRetries.values());
  }

  /**
   * Cancel all active retries.
   *
   * Useful for shutdown.
   */
  cancelAll(): void {
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
 * @param mqttClient - MQTT client for publishing failure notifications to Minerva
 * @param options - Optional configuration
 * @returns RetryManager instance
 */
export function createRetryManager(
  taskQueue: TaskQueue,
  timeoutMonitor: TimeoutMonitor,
  mqttClient: MqttClient,
  options?: RetryManagerOptions
): RetryManager {
  return new RetryManager(taskQueue, timeoutMonitor, mqttClient, options);
}
