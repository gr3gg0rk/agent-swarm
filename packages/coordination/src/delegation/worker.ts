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
export class WorkerTaskExecutor {
  /** Active task progress reporters keyed by task ID */
  protected activeTasks: Map<string, ProgressReporter>;

  /** Task execution start times keyed by task ID */
  private taskStartTimes: Map<string, number>;

  /** Pause check intervals keyed by task ID */
  private pauseCheckIntervals: Map<string, NodeJS.Timeout>;

  /** Optional resume logic for checkpoint recovery */
  private resumeLogic?: ResumeLogic;

  /** Optional memory monitor for automatic memory tracking */
  private memoryMonitor?: MemoryMonitor;

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
    this.pauseCheckIntervals = new Map();

    // Store optional components
    this.resumeLogic = options.resumeLogic;
    this.memoryMonitor = options.memoryMonitor;
    this.guidanceRequest = options.guidanceRequest;

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
  private async executeTask(command: TaskCommandPayload): Promise<void> {
    const { taskId, payload, timeoutMs, maxRetries = 3 } = command;
    const startTime = Date.now();

    // Attempt to resume from checkpoint if resume logic is available
    let workingContext: unknown | undefined;
    if (this.resumeLogic) {
      try {
        const result = await this.resumeLogic.resumeTask(taskId);

        if (result.success && result.action === 'resume' && result.checkpoint) {
          // Load checkpoint state for resuming
          workingContext = result.checkpoint.workingContext;
          console.info(`Resumed task ${taskId} from checkpoint ${result.checkpoint.checkpointId}`);
        } else if (result.action === 'restart') {
          console.info(`No checkpoint for task ${taskId}, starting fresh`);
        } else if (result.action === 'skip') {
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
        } else if (result.action === 'request_guidance') {
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
      } catch (error) {
        console.error(`Resume logic failed for task ${taskId}: ${error}`);
        // Continue with fresh start on resume failure
      }
    }

    // Store start time
    this.taskStartTimes.set(taskId, startTime);

    // Check if task is paused by memory throttle controller (HARD-04)
    const task = this.taskQueue.getTask(taskId);
    if (task && task.status === 'paused') {
      console.info(`Task ${taskId} is paused, skipping execution`);
      return;
    }

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

    // Start pause status monitoring (HARD-04)
    // Check task status every 1 second during execution
    const pauseCheckInterval = setInterval(() => {
      const currentTask = this.taskQueue.getTask(taskId);
      if (currentTask && currentTask.status === 'paused') {
        clearInterval(pauseCheckInterval);
        this.pauseCheckIntervals.delete(taskId);
        throw new Error('Task paused by memory throttle controller');
      }
    }, 1000);
    this.pauseCheckIntervals.set(taskId, pauseCheckInterval);

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
      const pauseInterval = this.pauseCheckIntervals.get(taskId);
      if (pauseInterval) {
        clearInterval(pauseInterval);
        this.pauseCheckIntervals.delete(taskId);
      }
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

    // Request guidance for ambiguous errors (ERRO-05)
    // Call before retry decision so guidance can inform retry behavior
    await this.requestGuidanceIfNeeded(error, taskId);

    // Check if should retry
    if (this.retryManager.shouldRetry(error, retryCount, maxRetries)) {
      // Calculate backoff
      const backoff = this.retryManager.calculateBackoff(retryCount);

      // Schedule retry via RetryManager
      await this.retryManager.scheduleRetry(taskId, error);

      // Cleanup: pauseCheckInterval, progressReporter, timeoutMonitor, activeTasks
      const pauseInterval = this.pauseCheckIntervals.get(taskId);
      if (pauseInterval) {
        clearInterval(pauseInterval);
        this.pauseCheckIntervals.delete(taskId);
      }
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

      // Cleanup: pauseCheckInterval, progressReporter, timeoutMonitor, activeTasks
      const pauseInterval = this.pauseCheckIntervals.get(taskId);
      if (pauseInterval) {
        clearInterval(pauseInterval);
        this.pauseCheckIntervals.delete(taskId);
      }
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

    // Request guidance from Minerva (ERRO-05)
    if (this.guidanceRequest) {
      try {
        const guidance = await this.guidanceRequest.requestGuidance(taskId, error.message);

        if (guidance) {
          // Guidance received
          console.info(`Guidance received for task ${taskId}: ${guidance}`);
          // Store guidance or apply it - for now just log it
          // The guidance could be used to retry with different parameters
        } else {
          // Timeout - no guidance received within 30 seconds
          console.warn(`Guidance request timed out for task ${taskId}, proceeding with default behavior`);
        }
      } catch (guidanceError) {
        console.error(`Guidance request failed for task ${taskId}: ${guidanceError}`);
        // Proceed with default behavior on guidance request failure
      }
    } else {
      // No guidance request available - log for manual intervention
      console.warn(`Ambiguous situation encountered for task ${taskId}: ${error.message}`);
      console.warn(`Agent ${this.agentId} should request guidance from Minerva (GuidanceRequest not configured)`);
    }
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
      // Max retries exhausted: notify Minerva via MQTT
      const envelope: MessageEnvelope = {
        messageId: uuidv4(),
        idempotencyKey: uuidv4(),
        from: this.agentId,
        to: 'minerva',
        type: 'task_failed',
        timestamp: Date.now(),
        payload: {
          taskId,
          agentId: this.agentId,
          error: {
            type: 'permanent',
            message: `Task timed out after ${maxRetries} retries`,
            reason: 'Timeout exhausted',
          },
        },
        qos: 1,
        retain: false,
      };

      const topic = Topics.guidanceRequest();
      await this.mqttClient.publish(topic, envelope);
      console.error(`Task ${taskId} failed after ${maxRetries} retries (timeout exhausted), notified Minerva`);
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

  /**
   * Start the executor and associated services.
   *
   * Starts memory monitor if configured.
   * Override in subclass for additional startup logic.
   */
  start(): void {
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
  async stop(): Promise<void> {
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
  getMemoryMonitor(): MemoryMonitor | undefined {
    return this.memoryMonitor;
  }

  /**
   * Get resume logic instance if configured.
   *
   * Useful for testing and checkpoint management.
   *
   * @returns ResumeLogic instance or undefined
   */
  getResumeLogic(): ResumeLogic | undefined {
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
