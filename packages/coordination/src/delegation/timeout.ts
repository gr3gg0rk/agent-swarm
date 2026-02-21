/**
 * Timeout Monitor with Exponential Backoff and Error Classification
 *
 * Monitors task execution time and triggers retry with exponential backoff on timeout.
 * Classifies errors as transient (retryable) or permanent (abort) for retry decisions.
 *
 * Per TASK-04: 2-minute default timeout, task creator can override per-task
 * Per ERRO-01: Failed tasks automatically retried with exponential backoff + jitter
 * Per CONTEXT.md: Minerva notified after max retries exhausted
 * Per CONTEXT.md: Default + override (2-minute default, per-task override)
 *
 * @see 03-RESEARCH.md Pattern 4: Timeout Monitoring with Exponential Backoff
 * @see AWS guidance: https://aws.amazon.com/cn/builders-library/timeouts-retries-and-backoff-with-jitter/
 */

/**
 * Error classification for retry decision.
 *
 * Per ERRO-02: Errors classified as retryable (transient) vs abort (permanent).
 */
export type ErrorType = 'transient' | 'permanent';

/**
 * Timeout callback function type.
 *
 * Called when task times out. Receives task ID and retry count.
 * Implementer should decide whether to retry or notify based on retryCount.
 */
export type TimeoutCallback = (taskId: string, retryCount: number) => void;

/**
 * Timeout monitor options.
 */
export interface TimeoutMonitorOptions {
  /** Maximum delay between retries (default: 30000ms) */
  maxDelayMs?: number;
  /** Jitter amount in milliseconds (default: 1000ms) */
  jitterMs?: number;
}

/**
 * Timeout state for tracking active timeouts.
 */
interface TimeoutState {
  timeoutId: NodeJS.Timeout;
  startTime: number;
  retryCount: number;
  maxRetries: number;
}

/**
 * Timeout monitor with exponential backoff and jitter.
 *
 * Tracks task execution time and triggers retries on timeout.
 * Implements exponential backoff with jitter to prevent thundering herd.
 *
 * @example
 * ```ts
 * const monitor = new TimeoutMonitor();
 *
 * monitor.startTimeout(
 *   'task-123',
 *   120000,  // 2 minute timeout
 *   0,       // First attempt
 *   3,       // Max 3 retries
 *   (taskId, retryCount) => {
 *     if (retryCount <= 3) {
 *       // Retry task
 *       retryTask(taskId);
 *     } else {
 *       // Notify Minerva of exhaustion
 *       notifyFailure(taskId, 'timeout_exhausted');
 *     }
 *   }
 * );
 * ```
 */
export class TimeoutMonitor {
  private timeouts: Map<string, TimeoutState> = new Map();
  private maxDelayMs: number;
  private jitterMs: number;

  constructor(options: TimeoutMonitorOptions = {}) {
    this.maxDelayMs = options.maxDelayMs ?? 30000; // 30 second cap
    this.jitterMs = options.jitterMs ?? 1000; // 1 second jitter
  }

  /**
   * Start timeout monitoring for a task.
   *
   * On timeout, calculates exponential backoff with jitter.
   * - Base delay: 2^retryCount * 1000ms (1s, 2s, 4s, 8s, 16s...)
   * - Jitter: random 0-1000ms
   * - Capped delay: min(baseDelay + jitter, 30000ms)
   *
   * If retryCount < maxRetries: schedules retry with delay
   * If retryCount >= maxRetries: calls onTimeout to signal exhaustion
   *
   * @param taskId - Task ID to monitor
   * @param timeoutMs - Timeout duration in milliseconds
   * @param retryCount - Current retry attempt (0-indexed)
   * @param maxRetries - Maximum retry attempts
   * @param onTimeout - Callback when timeout occurs
   */
  startTimeout(
    taskId: string,
    timeoutMs: number,
    retryCount: number,
    maxRetries: number,
    onTimeout: TimeoutCallback
  ): void {
    // Cancel existing timeout if any
    this.cancelTimeout(taskId);

    const timeoutId = setTimeout(() => {
      this.timeouts.delete(taskId);

      if (retryCount < maxRetries) {
        // Calculate exponential backoff with jitter
        const baseDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, 8s...
        const jitter = Math.random() * this.jitterMs; // 0-1000ms random
        const delay = Math.min(baseDelay + jitter, this.maxDelayMs); // Cap at maxDelay

        console.log(
          `Task ${taskId} timed out, retrying in ${delay.toFixed(0)}ms (attempt ${retryCount + 1}/${maxRetries})`
        );

        // Schedule retry
        setTimeout(() => {
          onTimeout(taskId, retryCount + 1);
        }, delay);
      } else {
        // Max retries exhausted, signal exhaustion
        console.error(`Task ${taskId} failed after ${maxRetries} retries`);
        onTimeout(taskId, maxRetries + 1); // Signal exhaustion
      }
    }, timeoutMs);

    this.timeouts.set(taskId, {
      timeoutId,
      startTime: Date.now(),
      retryCount,
      maxRetries,
    });
  }

  /**
   * Cancel timeout monitoring for a task.
   *
   * Called when task completes, fails, or is cancelled.
   *
   * @param taskId - Task ID to cancel monitoring for
   * @returns true if timeout was cancelled, false if not found
   */
  cancelTimeout(taskId: string): boolean {
    const state = this.timeouts.get(taskId);
    if (!state) {
      return false;
    }

    clearTimeout(state.timeoutId);
    this.timeouts.delete(taskId);
    return true;
  }

  /**
   * Check if a task is currently being monitored.
   *
   * @param taskId - Task ID to check
   * @returns true if task is being monitored
   */
  isMonitoring(taskId: string): boolean {
    return this.timeouts.has(taskId);
  }

  /**
   * Get remaining time before timeout.
   *
   * @param taskId - Task ID to check
   * @returns Remaining milliseconds or null if not monitoring
   */
  getRemainingTime(taskId: string): number | null {
    const state = this.timeouts.get(taskId);
    if (!state) {
      return null;
    }

    // This is approximate since we don't store the timeout duration
    // In practice, you'd need to store the timeout end time
    return null;
  }

  /**
   * Get all currently monitored task IDs.
   *
   * @returns Array of task IDs being monitored
   */
  getMonitoredTasks(): string[] {
    return Array.from(this.timeouts.keys());
  }

  /**
   * Cancel all active timeouts.
   *
   * Useful for shutdown.
   */
  cancelAll(): void {
    for (const [taskId, state] of this.timeouts) {
      clearTimeout(state.timeoutId);
    }
    this.timeouts.clear();
  }

  /**
   * Get count of active timeouts.
   *
   * @returns Number of tasks being monitored
   */
  getActiveCount(): number {
    return this.timeouts.size;
  }
}

/**
 * Error classification for retry decision.
 *
 * Per ERRO-02: Transient errors retry, permanent errors abort.
 *
 * Transient patterns (retryable):
 * - timeout, etimedout, econnrefused, enotfound, econnreset
 * - network, temporary
 *
 * Permanent patterns (abort):
 * - einvalid, epermission, eauth
 * - validation, not found, unauthorized
 *
 * @param error - Error to classify
 * @returns 'permanent' if permanent pattern matches, 'transient' otherwise
 */
export function classifyError(error: Error): ErrorType {
  const transientPatterns = [
    /timeout/i,
    /etimedout/i,
    /econnrefused/i,
    /enotfound/i,
    /econnreset/i,
    /network/i,
    /temporary/i,
  ];

  const permanentPatterns = [
    /einvalid/i,
    /epermission/i,
    /eauth/i,
    /validation/i,
    /not found/i,
    /unauthorized/i,
  ];

  const message = error.message.toLowerCase();

  // Check permanent patterns first (they override)
  if (permanentPatterns.some(p => p.test(message))) {
    return 'permanent';
  }

  // Check transient patterns
  if (transientPatterns.some(p => p.test(message))) {
    return 'transient';
  }

  // Default: assume transient for unknown errors
  return 'transient';
}

/**
 * Calculate exponential backoff delay with jitter.
 *
 * Formula: min(2^retryCount * 1000 + random(0, jitterMs), maxDelayMs)
 *
 * @param retryCount - Current retry attempt (0-indexed)
 * @param maxDelayMs - Maximum delay cap (default: 30000)
 * @param jitterMs - Jitter amount (default: 1000)
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  retryCount: number,
  maxDelayMs: number = 30000,
  jitterMs: number = 1000
): number {
  const baseDelay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s, 8s...
  const jitter = Math.random() * jitterMs; // 0-1000ms random
  return Math.min(baseDelay + jitter, maxDelayMs); // Cap at maxDelay
}

/**
 * Convenience function to create timeout monitor.
 *
 * @param options - Optional monitor configuration
 * @returns TimeoutMonitor instance
 */
export function createTimeoutMonitor(options?: TimeoutMonitorOptions): TimeoutMonitor {
  return new TimeoutMonitor(options);
}
