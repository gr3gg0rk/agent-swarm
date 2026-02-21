/**
 * Task Cancellation for Cancellation and Acknowledgment
 *
 * Manages task cancellation commands and tracks worker acknowledgments.
 * Implements optimistic cancellation with 5-second acknowledgment timeout.
 *
 * Per TASK-05: Minerva can cancel in-progress tasks and workers acknowledge cancellation.
 * Per COMM-06: Cancellation commands use QoS 1 for at-least-once delivery.
 *
 * @see 03-RESEARCH.md Pattern: Cancellation via MQTT command message with ack response
 */

import { v4 as uuidv4 } from 'uuid';
import type { MqttClient } from '../communication/mqtt.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope } from '../communication/message.js';
import type { TaskQueue, Task } from '../state/task-queue.js';

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
 * Task acknowledgment timeout duration (5 seconds).
 * Workers must acknowledge cancellation within this window.
 */
const ACKNOWLEDGEMENT_TIMEOUT_MS = 5000;

/**
 * Pending cancellation state.
 */
interface PendingCancellation {
  /** Timeout timer ID */
  timeoutId: NodeJS.Timeout;
  /** Agent ID that should acknowledge */
  agentId: string;
  /** Cancellation reason */
  reason?: string;
}

/**
 * Task cancellation manager.
 *
 * Handles cancellation command publishing and acknowledgment tracking.
 * Uses optimistic cancellation (task status updated immediately, then
 * waits for worker acknowledgment).
 *
 * If worker doesn't acknowledge within 5 seconds, logs warning but
 * cancellation stands (optimistic update is not rolled back).
 *
 * @example
 * ```ts
 * const cancellation = new TaskCancellation(mqttClient, taskQueue);
 *
 * // Cancel task
 * await cancellation.cancelTask('task-123', 'User requested stop');
 *
 * // Worker acknowledgment (called by WorkerTaskExecutor)
 * await cancellation.acknowledgeCancellation('task-123', 'worker-1');
 * ```
 */
export class TaskCancellation {
  /** Pending cancellations awaiting acknowledgment */
  private pendingCancellations: Map<string, PendingCancellation>;

  /**
   * Creates a new task cancellation manager.
   *
   * @param mqttClient - MQTT client for publishing cancellations
   * @param taskQueue - Task queue for status updates
   */
  constructor(
    private mqttClient: MqttClient,
    private taskQueue: TaskQueue
  ) {
    this.pendingCancellations = new Map();
  }

  /**
   * Set up cancellation handler for an agent.
   *
   * Subscribes to agent's cancel topic and routes cancellation
   * commands to acknowledgeCancellation.
   *
   * @param agentId - Agent ID to set up handler for
   */
  setupCancellationHandler(agentId: string): void {
    const topic = Topics.taskCancel(agentId);

    // Subscribe to cancellation topic
    this.mqttClient.subscribe(topic, 1).catch(error => {
      console.error(`Failed to subscribe to cancellation topic for ${agentId}:`, error);
    });

    // Set up message listener
    this.mqttClient.on('message', (envelope: MessageEnvelope, receivedTopic: string) => {
      if (receivedTopic === topic && envelope.type === 'cancel') {
        const payload = envelope.payload as TaskCancelPayload;
        this.acknowledgeCancellation(payload.taskId, agentId).catch(error => {
          console.error(`Error acknowledging cancellation for ${payload.taskId}:`, error);
        });
      }
    });
  }

  /**
   * Cancel task and publish cancellation command.
   *
   * 1. Validates task exists and is in_progress
   * 2. Publishes cancellation command to agent
   * 3. Sets 5-second acknowledgment timeout
   * 4. Updates task status to cancelled (optimistic)
   *
   * Per TASK-05: Minerva can cancel in-progress tasks and workers acknowledge.
   *
   * @param taskId - Task ID to cancel
   * @param reason - Optional cancellation reason
   * @throws Error if task not found or not in progress
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    // Get task from queue
    const task = this.taskQueue.getTask(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'in_progress') {
      throw new Error(`Task not in progress: ${taskId} (status: ${task.status})`);
    }

    if (!task.assignedAgent) {
      throw new Error(`Task has no assigned agent: ${taskId}`);
    }

    const agentId = task.assignedAgent;

    // Publish cancellation command
    await this.publishCancelCommand(agentId, taskId, reason);

    // Set acknowledgment timeout (5 seconds)
    const timeoutId = setTimeout(() => {
      this.handleCancellationTimeout(taskId);
    }, ACKNOWLEDGEMENT_TIMEOUT_MS);

    // Store pending cancellation
    this.pendingCancellations.set(taskId, {
      timeoutId,
      agentId,
      reason,
    });

    // Update task status to cancelled (optimistic update)
    this.taskQueue.updateTaskStatus(taskId, 'cancelled');
  }

  /**
   * Acknowledge task cancellation.
   *
   * Called by worker when it receives and processes cancellation command.
   * Clears the acknowledgment timeout and removes from pending map.
   *
   * @param taskId - Task ID being acknowledged
   * @param agentId - Agent ID acknowledging cancellation
   */
  async acknowledgeCancellation(taskId: string, agentId: string): Promise<void> {
    const pending = this.pendingCancellations.get(taskId);

    if (!pending) {
      // No pending cancellation - might be duplicate acknowledgment
      console.warn(`Received cancellation acknowledgment for ${taskId} but no pending cancellation found`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeoutId);

    // Remove from pending map
    this.pendingCancellations.delete(taskId);

    // Log acknowledgment
    console.log(`Task ${taskId} cancellation acknowledged by ${agentId}${pending.reason ? ` (reason: ${pending.reason})` : ''}`);
  }

  /**
   * Handle cancellation timeout.
   *
   * Called when worker doesn't acknowledge cancellation within 5 seconds.
   * Logs warning but cancellation stands (optimistic update is not rolled back).
   *
   * @param taskId - Task ID that timed out
   */
  private handleCancellationTimeout(taskId: string): void {
    const pending = this.pendingCancellations.get(taskId);

    if (!pending) {
      return; // Already acknowledged
    }

    // Remove from pending map
    this.pendingCancellations.delete(taskId);

    // Log warning
    console.warn(`Task ${taskId} cancellation not acknowledged after ${ACKNOWLEDGEMENT_TIMEOUT_MS}ms (agent: ${pending.agentId})`);

    // Task status remains 'cancelled' (optimistic update stands)
    // Worker may still be running task but system considers it cancelled
  }

  /**
   * Publish cancellation command to agent via MQTT.
   *
   * Creates MessageEnvelope with cancellation payload and publishes to
   * agent/{id}/cancel topic with QoS 1.
   *
   * @param agentId - Target agent ID
   * @param taskId - Task ID to cancel
   * @param reason - Optional cancellation reason
   */
  private async publishCancelCommand(agentId: string, taskId: string, reason?: string): Promise<void> {
    const payload: TaskCancelPayload = {
      taskId,
      reason,
    };

    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: 'minerva',
      to: agentId,
      type: 'cancel',
      timestamp: Date.now(),
      payload,
      qos: 1, // At-least-once delivery per COMM-06
      retain: false,
    };

    const topic = Topics.taskCancel(agentId);

    await this.mqttClient.publish(topic, envelope);
  }

  /**
   * Get count of pending cancellations.
   *
   * @returns Number of cancellations awaiting acknowledgment
   */
  getPendingCount(): number {
    return this.pendingCancellations.size;
  }

  /**
   * Check if task cancellation is pending acknowledgment.
   *
   * @param taskId - Task ID to check
   * @returns true if cancellation is pending
   */
  isPending(taskId: string): boolean {
    return this.pendingCancellations.has(taskId);
  }

  /**
   * Cancel all pending acknowledgment timeouts.
   *
   * Useful for shutdown to clear all pending state.
   */
  cancelAll(): void {
    for (const [taskId, pending] of this.pendingCancellations) {
      clearTimeout(pending.timeoutId);
    }
    this.pendingCancellations.clear();
  }
}

/**
 * Convenience function to create task cancellation manager.
 *
 * @param mqttClient - MQTT client for publishing cancellations
 * @param taskQueue - Task queue for status updates
 * @returns TaskCancellation instance
 */
export function createTaskCancellation(
  mqttClient: MqttClient,
  taskQueue: TaskQueue
): TaskCancellation {
  return new TaskCancellation(mqttClient, taskQueue);
}
