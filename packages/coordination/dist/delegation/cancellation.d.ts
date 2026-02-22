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
import type { MqttClient } from '../communication/mqtt.js';
import type { TaskQueue } from '../state/task-queue.js';
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
export declare class TaskCancellation {
    private mqttClient;
    private taskQueue;
    /** Pending cancellations awaiting acknowledgment */
    private pendingCancellations;
    /**
     * Creates a new task cancellation manager.
     *
     * @param mqttClient - MQTT client for publishing cancellations
     * @param taskQueue - Task queue for status updates
     */
    constructor(mqttClient: MqttClient, taskQueue: TaskQueue);
    /**
     * Set up cancellation handler for an agent.
     *
     * Subscribes to agent's cancel topic and routes cancellation
     * commands to acknowledgeCancellation.
     *
     * @param agentId - Agent ID to set up handler for
     */
    setupCancellationHandler(agentId: string): void;
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
    cancelTask(taskId: string, reason?: string): Promise<void>;
    /**
     * Acknowledge task cancellation.
     *
     * Called by worker when it receives and processes cancellation command.
     * Clears the acknowledgment timeout and removes from pending map.
     *
     * @param taskId - Task ID being acknowledged
     * @param agentId - Agent ID acknowledging cancellation
     */
    acknowledgeCancellation(taskId: string, agentId: string): Promise<void>;
    /**
     * Handle cancellation timeout.
     *
     * Called when worker doesn't acknowledge cancellation within 5 seconds.
     * Logs warning but cancellation stands (optimistic update is not rolled back).
     *
     * @param taskId - Task ID that timed out
     */
    private handleCancellationTimeout;
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
    private publishCancelCommand;
    /**
     * Get count of pending cancellations.
     *
     * @returns Number of cancellations awaiting acknowledgment
     */
    getPendingCount(): number;
    /**
     * Check if task cancellation is pending acknowledgment.
     *
     * @param taskId - Task ID to check
     * @returns true if cancellation is pending
     */
    isPending(taskId: string): boolean;
    /**
     * Cancel all pending acknowledgment timeouts.
     *
     * Useful for shutdown to clear all pending state.
     */
    cancelAll(): void;
}
/**
 * Convenience function to create task cancellation manager.
 *
 * @param mqttClient - MQTT client for publishing cancellations
 * @param taskQueue - Task queue for status updates
 * @returns TaskCancellation instance
 */
export declare function createTaskCancellation(mqttClient: MqttClient, taskQueue: TaskQueue): TaskCancellation;
//# sourceMappingURL=cancellation.d.ts.map