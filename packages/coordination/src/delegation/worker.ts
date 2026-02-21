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
 *
 * @see 03-RESEARCH.md Pattern: Worker Task Execution Wrapper
 */

import { v4 as uuidv4 } from 'uuid';
import type { MqttClient } from '../communication/mqtt.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope } from '../communication/message.js';
import type { TaskQueue, Task } from '../state/task-queue.js';
import type { TimeoutMonitor } from './timeout.js';
import { classifyError } from './timeout.js';
import type { RetryManager } from './retry.js';
import type { GuidanceRequest } from './guidance.js';
import type { ProgressReporter } from './progress.js';
import { createProgressReporter } from './progress.js';
import type { TaskCommandPayload, TaskResult, TaskProgress } from './types.js';

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
export class WorkerTaskExecutor {
  /** Active task progress reporters keyed by task ID */
  protected activeTasks: Map<string, ProgressReporter>;

  /** Task execution start times keyed by task ID */
  private taskStartTimes: Map<string, number>;

  /**
   * Creates a new worker task executor.
   *
   * Automatically subscribes to command topic in constructor.
   *
   * @param agentId - This agent's ID
   * @param mqttClient - MQTT client for publishing results
   * @param taskQueue - Task queue for status updates
   * @param timeoutMonitor - Timeout monitor for task timeout tracking
   * @param retryManager - Retry manager for error handling
   * @param options - Optional configuration
   */
  constructor(
    protected agentId: string,
    protected mqttClient: MqttClient,
    protected taskQueue: TaskQueue,
    protected timeoutMonitor: TimeoutMonitor,
    protected retryManager: RetryManager,
    options: WorkerTaskExecutorOptions = {}
  ) {
    this.activeTasks = new Map();
    this.taskStartTimes = new Map();

    // Set up command handler (subscribe to task topic)
    this.setupCommandHandler();
  }

  /**
   * Subscribe to command topic and set up message handler.
   * Called in constructor to register task command listener.
   */
  private setupCommandHandler(): void {
    const topic = Topics.taskCommand(this.agentId);

    // Subscribe to command topic via mqtt client's event system
    this.mqttClient.on('message', (envelope: MessageEnvelope, receivedTopic: string) => {
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
  private async handleCommand(envelope: MessageEnvelope): Promise<void> {
    if (envelope.type === 'task') {
      await this.executeTask(envelope.payload as TaskCommandPayload);
    } else if (envelope.type === 'cancel') {
      await this.handleCancellation(envelope.payload as TaskCancelPayload);
    }
  }

  /**
   * Execute task with progress tracking and timeout monitoring.
   *
   * 1. Updates task status to 'in_progress'
   * 2. Creates ProgressReporter and starts monitoring
   * 3. Starts timeout monitoring
   * 4. Calls doWork() with progress callback
   * 5. Sends result (success or failure)
   * 6. Cleanup: cancel timeout, stop progress reporter
   *
   * @param command - Task command payload
   */
  private async executeTask(command: TaskCommandPayload): Promise<void> {
    const { taskId, payload, timeoutMs, maxRetries = 3 } = command;
    const startTime = Date.now();

    // Store start time
    this.taskStartTimes.set(taskId, startTime);

    // Update task status to in_progress
    this.taskQueue.updateTaskStatus(taskId, 'in_progress', this.agentId);

    // Create and start progress reporter
    const progressReporter = createProgressReporter(taskId, this.agentId, this.mqttClient);
    progressReporter.start(0);
    this.activeTasks.set(taskId, progressReporter);

    // Progress callback for doWork implementation
    const onProgress: ProgressCallback = (progress: number, message?: string) => {
      progressReporter.update(progress, message);
      // Update task in database with progress timestamp
      const progressData: TaskProgress = {
        taskId,
        agentId: this.agentId,
        progress,
        message,
        timestamp: Date.now(),
      };
      this.taskQueue.updateTaskProgress(taskId, progressData);
    };

    // Start timeout monitoring
    this.timeoutMonitor.startTimeout(
      taskId,
      timeoutMs,
      0, // Initial attempt (retryCount 0)
      maxRetries,
      (tid, retryCount) => this.handleTimeout(tid, retryCount)
    );

    try {
      // Execute task (agent-specific implementation)
      const result = await this.doWork(payload, onProgress);

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

    } catch (error) {
      // Handle failure via dedicated method
      await this.handleFailure(taskId, error as Error, progressReporter);
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
  private async handleFailure(
    taskId: string,
    error: Error,
    progressReporter: ProgressReporter
  ): Promise<void> {
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
      ? Date.now() - this.taskStartTimes.get(taskId)!
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

      console.log(
        `Task ${taskId} failed with ${errorType} error, scheduled retry in ${backoff.toFixed(0)}ms`
      );
    } else {
      // Should not retry (permanent error or exhausted)
      // Send failure result
      await this.sendResult(taskId, {
        taskId,
        success: false,
        error: {
          type: errorType,
          message: error.message,
          code: (error as any).code,
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
  async requestGuidanceIfNeeded(error: Error, taskId: string): Promise<void> {
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
  private async handleTimeout(taskId: string, retryCount: number): Promise<void> {
    const task = this.taskQueue.getTask(taskId);

    if (!task || task.status !== 'in_progress') {
      return; // Task already completed/failed/cancelled
    }

    const maxRetries = task.maxRetries ?? 3;

    if (retryCount <= maxRetries) {
      // Retry: re-queue task as pending for re-dispatch
      this.taskQueue.updateTaskStatus(taskId, 'pending');
      console.log(`Task ${taskId} timed out, re-queued for retry (${retryCount}/${maxRetries})`);
    } else {
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
  private async sendResult(taskId: string, result: TaskResultPayload): Promise<void> {
    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: this.agentId,
      type: 'result',
      timestamp: Date.now(),
      payload: result as TaskResultPayload,
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
  private async handleCancellation(cancelPayload: TaskCancelPayload): Promise<void> {
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
        ? Date.now() - this.taskStartTimes.get(taskId)!
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
  protected async doWork(payload: unknown, onProgress: ProgressCallback): Promise<unknown> {
    throw new Error('doWork must be implemented by agent subclass');
  }

  /**
   * Get count of active tasks.
   *
   * Useful for capacity checking.
   *
   * @returns Number of currently executing tasks
   */
  getActiveTaskCount(): number {
    return this.activeTasks.size;
  }

  /**
   * Check if executor is at capacity.
   *
   * @param maxCapacity - Maximum concurrent tasks
   * @returns true if at or above capacity
   */
  isAtCapacity(maxCapacity: number): boolean {
    return this.activeTasks.size >= maxCapacity;
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
export function createWorkerTaskExecutor(
  agentId: string,
  mqttClient: MqttClient,
  taskQueue: TaskQueue,
  timeoutMonitor: TimeoutMonitor,
  retryManager: RetryManager,
  options?: WorkerTaskExecutorOptions
): WorkerTaskExecutor {
  return new WorkerTaskExecutor(agentId, mqttClient, taskQueue, timeoutMonitor, retryManager, options);
}
