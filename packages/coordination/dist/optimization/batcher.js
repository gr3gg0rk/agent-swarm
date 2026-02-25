/**
 * Message Batching Layer
 *
 * Per 07-RESEARCH.md Pattern 1: Time-windowed batching with dual-trigger strategy.
 * Buffers high-frequency messages (progress, status, heartbeats) and publishes them
 * in batches to achieve 10x throughput improvement (OPTI-01).
 *
 * Dual-trigger: Flush on EITHER time threshold OR buffer size limit (whichever first).
 * Per 07-RESEARCH.md Pitfall 1: maxSize limits prevent unbounded buffer growth on Pi 2B.
 */
import { pack } from 'msgpackr';
/**
 * Default batch configuration per OPTI-02 requirements.
 * Tasks: 10ms window, 50 max
 * Status: 50ms window, 100 max
 * Heartbeats: 100ms window, 20 max
 */
export const DEFAULT_BATCH_CONFIG = {
    tasks: { windowMs: 10, maxSize: 50 },
    status: { windowMs: 50, maxSize: 100 },
    heartbeats: { windowMs: 100, maxSize: 20 },
};
export class MessageBatcher {
    /** Message buffers per type */
    buffers = new Map();
    /** Flush timers per type */
    timers = new Map();
    /** Wrapped MQTT client for direct publish fallback */
    mqttClient;
    /** Batch configuration per type */
    config;
    /**
     * Creates a new MessageBatcher instance.
     * @param mqttClient - MqttClient instance for publishing batches
     * @param config - Batch configuration (default: DEFAULT_BATCH_CONFIG)
     */
    constructor(mqttClient, config = DEFAULT_BATCH_CONFIG) {
        this.mqttClient = mqttClient;
        this.config = config;
    }
    /**
     * Publishes a message, optionally batching it based on type.
     * Task assignments bypass batching for low latency (per 07-RESEARCH.md Open Question 4).
     *
     * @param topic - MQTT topic to publish to
     * @param envelope - Message envelope to publish
     */
    async publish(topic, envelope) {
        try {
            const type = this.getMessageType(envelope);
            // CRITICAL: Don't batch task assignments (latency critical)
            if (type === 'task') {
                await this.mqttClient.publish(topic, envelope);
                return;
            }
            // Add to buffer
            if (!this.buffers.has(type)) {
                this.buffers.set(type, []);
                this.scheduleFlush(type, this.config[type].windowMs);
            }
            this.buffers.get(type).push({ envelope, topic });
            // Flush if size limit reached (dual-trigger)
            if (this.buffers.get(type).length >= this.config[type].maxSize) {
                await this.flush(type);
            }
        }
        catch (error) {
            // Fallback to direct publish on batcher failure (Pitfall 4)
            await this.mqttClient.publish(topic, envelope);
        }
    }
    /**
     * Flushes buffered messages for a type as a single batch.
     * Publishes MessagePack array of envelopes to `swarm/batch/{type}` topic.
     *
     * @param type - Message type to flush ('tasks', 'status', or 'heartbeats')
     */
    async flush(type) {
        const buffered = this.buffers.get(type) || [];
        if (buffered.length === 0)
            return;
        // Clear buffer and timer
        this.buffers.set(type, []);
        const timer = this.timers.get(type);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(type);
        }
        // Extract envelopes for batch
        const envelopes = buffered.map(b => b.envelope);
        // Publish batch as single MessagePack array
        const payload = pack(envelopes);
        // Create batch envelope with status type (valid MessageType)
        const fromAgent = buffered[0].envelope.from || 'unknown';
        const batchEnvelope = {
            messageId: `batch-${type}-${Date.now()}`,
            idempotencyKey: `batch-${type}-${Date.now()}`,
            from: fromAgent,
            type: 'status',
            timestamp: Date.now(),
            payload,
            qos: 1,
        };
        await this.mqttClient.publish(this.topicFor(type), batchEnvelope);
    }
    /**
     * Schedules a timed flush for a message type.
     * @param type - Message type to schedule flush for
     * @param windowMs - Time window in milliseconds
     */
    scheduleFlush(type, windowMs) {
        const timer = setTimeout(() => this.flush(type), windowMs);
        this.timers.set(type, timer);
    }
    /**
     * Generates batch topic for a message type.
     * Pattern: `swarm/batch/{type}` where type is 'tasks', 'status', or 'heartbeats'
     *
     * @param type - Message type
     * @returns Batch topic string
     */
    topicFor(type) {
        return `swarm/batch/${type}`;
    }
    /**
     * Maps message envelope type to batch config key.
     *
     * Mapping per OPTI-02 requirements:
     * - 'task', 'result', 'cancel' → 'tasks' (10ms window, 50 max)
     * - 'progress' → 'status' (50ms window, 100 max)
     * - 'heartbeat', 'load_metrics' → 'heartbeats' (100ms window, 20 max)
     * - All other types → 'status' (default)
     *
     * @param envelope - Message envelope
     * @returns Batch config key ('tasks', 'status', or 'heartbeats')
     */
    getMessageType(envelope) {
        const type = envelope.type;
        if (type === 'task' || type === 'result' || type === 'cancel')
            return 'tasks';
        if (type === 'progress')
            return 'status';
        if (type === 'heartbeat' || type === 'load_metrics')
            return 'heartbeats';
        return 'status'; // default
    }
    /**
     * Gracefully stops the batcher, flushing all pending buffers.
     * Called during shutdown to ensure no messages are lost.
     */
    async stop() {
        const flushPromises = [];
        for (const type of this.buffers.keys()) {
            flushPromises.push(this.flush(type));
        }
        await Promise.all(flushPromises);
    }
}
//# sourceMappingURL=batcher.js.map