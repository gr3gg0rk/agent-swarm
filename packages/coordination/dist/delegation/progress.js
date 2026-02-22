/**
 * Progress Reporter for Periodic Progress Updates
 *
 * Manages periodic progress updates during long-running task execution.
 * Publishes progress updates at fixed intervals (30s) or on 10% milestones.
 *
 * Per STAT-02: Agents publish progress updates when working on long-running tasks.
 * Per CONTEXT.md: Periodic updates every 10% or 30s (whichever comes first).
 * Per COMM-07: Progress updates use QoS 0 (fire-and-forget messaging).
 *
 * @see 03-RESEARCH.md Pattern 5: Task Progress Reporting
 */
import { v4 as uuidv4 } from 'uuid';
import { Topics } from '../communication/topics.js';
/**
 * Progress reporter for periodic progress updates.
 *
 * Publishes progress updates to agent/{id}/progress topic at:
 * - Fixed intervals (every 30s by default)
 * - 10% milestones (immediate publish on >=10% change)
 *
 * This ensures visibility for long tasks without message storms.
 *
 * @example
 * ```ts
 * const reporter = new ProgressReporter('task-123', 'worker-1', mqttClient);
 * reporter.start(0); // Start at 0%
 *
 * // During task execution
 * reporter.update(50, 'Halfway done'); // Publishes immediately (50% change >= 10%)
 * reporter.update(55, 'Still working'); // Waits for interval (5% change < 10%)
 *
 * reporter.stop(); // Stop when task completes/fails
 * ```
 */
export class ProgressReporter {
    taskId;
    agentId;
    mqttClient;
    updateInterval;
    progressInterval;
    lastProgress;
    startTime;
    /**
     * Creates a new progress reporter.
     *
     * @param taskId - Task ID to report progress for
     * @param agentId - Agent ID sending the updates
     * @param mqttClient - MQTT client for publishing updates
     * @param options - Optional configuration
     */
    constructor(taskId, agentId, mqttClient, options = {}) {
        this.taskId = taskId;
        this.agentId = agentId;
        this.mqttClient = mqttClient;
        this.updateInterval = options.updateInterval ?? 30000; // 30 second default
        this.lastProgress = 0;
        this.startTime = Date.now();
    }
    /**
     * Start periodic progress reporting.
     *
     * Sets up interval timer that publishes progress every updateInterval ms.
     * Initial progress value is stored for comparison on future updates.
     *
     * @param initialProgress - Starting progress percentage (0-100, default: 0)
     */
    start(initialProgress = 0) {
        this.lastProgress = initialProgress;
        // Publish initial progress
        this.publish(initialProgress);
        // Start interval timer
        this.progressInterval = setInterval(() => {
            this.publish(this.lastProgress);
        }, this.updateInterval);
    }
    /**
     * Update progress with optional message.
     *
     * Publishes immediately if progress change >= 10%.
     * Otherwise waits for next interval (no-op).
     *
     * This threshold prevents message storms while ensuring visibility
     * for significant progress milestones.
     *
     * @param progress - New progress percentage (0-100)
     * @param message - Optional human-readable status message
     */
    update(progress, message) {
        const progressChange = Math.abs(progress - this.lastProgress);
        // Publish immediately if 10% or more change
        if (progressChange >= 10) {
            this.publish(progress, message);
            this.lastProgress = progress;
        }
        // Otherwise: wait for next interval (no-op)
    }
    /**
     * Stop progress reporting.
     *
     * Clears interval timer if active. Called when task completes,
     * fails, or is cancelled.
     */
    stop() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = undefined;
        }
    }
    /**
     * Publish progress update via MQTT.
     *
     * Creates MessageEnvelope with TaskProgressPayload and publishes
     * to agent/{id}/progress topic with QoS 0 (fire-and-forget).
     *
     * @param progress - Progress percentage (0-100)
     * @param message - Optional status message
     */
    publish(progress, message) {
        const progressData = {
            taskId: this.taskId,
            agentId: this.agentId,
            progress,
            message: message || `Task ${this.taskId} in progress (${progress}%)`,
            timestamp: Date.now(),
        };
        const envelope = {
            messageId: uuidv4(),
            idempotencyKey: uuidv4(),
            from: this.agentId,
            type: 'progress',
            timestamp: Date.now(),
            payload: progressData,
            qos: 0, // Fire-and-forget per COMM-07
            retain: false,
        };
        const topic = Topics.taskProgress(this.agentId);
        this.mqttClient
            .publish(topic, envelope)
            .catch(error => console.error('Failed to publish progress:', error));
    }
}
/**
 * Convenience function to create progress reporter.
 *
 * @param taskId - Task ID to report progress for
 * @param agentId - Agent ID sending the updates
 * @param mqttClient - MQTT client for publishing updates
 * @param options - Optional configuration
 * @returns ProgressReporter instance
 */
export function createProgressReporter(taskId, agentId, mqttClient, options) {
    return new ProgressReporter(taskId, agentId, mqttClient, options);
}
//# sourceMappingURL=progress.js.map