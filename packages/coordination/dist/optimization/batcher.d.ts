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
import type { MessageEnvelope } from '../communication/message.js';
/**
 * Batch configuration per message type.
 * Defines time window (ms) and max buffer size for dual-trigger flushing.
 */
export interface BatchConfig {
    /** Task-related messages (result, cancel) - 10ms OR 50 messages */
    tasks: {
        windowMs: number;
        maxSize: number;
    };
    /** Status updates (progress) - 50ms OR 100 messages */
    status: {
        windowMs: number;
        maxSize: number;
    };
    /** Heartbeats and load metrics - 100ms OR 20 messages */
    heartbeats: {
        windowMs: number;
        maxSize: number;
    };
    /** Index signature for type-safe access */
    [key: string]: {
        windowMs: number;
        maxSize: number;
    };
}
/**
 * Default batch configuration per OPTI-02 requirements.
 * Tasks: 10ms window, 50 max
 * Status: 50ms window, 100 max
 * Heartbeats: 100ms window, 20 max
 */
export declare const DEFAULT_BATCH_CONFIG: BatchConfig;
export declare class MessageBatcher {
    /** Message buffers per type */
    private buffers;
    /** Flush timers per type */
    private timers;
    /** Wrapped MQTT client for direct publish fallback */
    private mqttClient;
    /** Batch configuration per type */
    private config;
    /**
     * Creates a new MessageBatcher instance.
     * @param mqttClient - MqttClient instance for publishing batches
     * @param config - Batch configuration (default: DEFAULT_BATCH_CONFIG)
     */
    constructor(mqttClient: any, config?: BatchConfig);
    /**
     * Publishes a message, optionally batching it based on type.
     * Task assignments bypass batching for low latency (per 07-RESEARCH.md Open Question 4).
     *
     * @param topic - MQTT topic to publish to
     * @param envelope - Message envelope to publish
     */
    publish(topic: string, envelope: MessageEnvelope): Promise<void>;
    /**
     * Flushes buffered messages for a type as a single batch.
     * Publishes MessagePack array of envelopes to `swarm/batch/{type}` topic.
     *
     * @param type - Message type to flush ('tasks', 'status', or 'heartbeats')
     */
    private flush;
    /**
     * Schedules a timed flush for a message type.
     * @param type - Message type to schedule flush for
     * @param windowMs - Time window in milliseconds
     */
    private scheduleFlush;
    /**
     * Generates batch topic for a message type.
     * Pattern: `swarm/batch/{type}` where type is 'tasks', 'status', or 'heartbeats'
     *
     * @param type - Message type
     * @returns Batch topic string
     */
    private topicFor;
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
    private getMessageType;
    /**
     * Gracefully stops the batcher, flushing all pending buffers.
     * Called during shutdown to ensure no messages are lost.
     */
    stop(): Promise<void>;
}
//# sourceMappingURL=batcher.d.ts.map