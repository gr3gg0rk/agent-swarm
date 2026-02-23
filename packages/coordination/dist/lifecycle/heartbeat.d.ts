/**
 * Heartbeat Monitoring with 4-Miss Offline Detection
 *
 * Per RESEARCH.md Pattern 2: Agents publish heartbeat every 30 seconds via MQTT.
 * Agents missing 4 consecutive heartbeats are marked offline (2-minute timeout).
 * Per DISC-04: 4 missed beats = offline detection.
 * Per STAT-01: 30-second heartbeat publishing interval.
 */
import { EventEmitter } from 'events';
import type { MqttClientMinimal } from '../discovery/registry.js';
import type { MemoryMonitor } from '../memory/monitor.js';
interface Database {
    prepare(sql: string): {
        run(...params: unknown[]): {
            changes: number;
        };
        get(...params: unknown[]): unknown;
        all(...params: unknown[]): unknown[];
    };
    exec(sql: string): void;
}
/**
 * Configuration for heartbeat publisher.
 */
export interface HeartbeatConfig {
    /** Unique agent ID for this agent */
    agentId: string;
    /** Heartbeat publishing interval in milliseconds (30 seconds per STAT-01) */
    interval: number;
    /** MQTT client for publishing heartbeats */
    mqttClient: MqttClientMinimal;
    /** Optional database for persisting heartbeat state */
    db?: Database;
    /** Optional memory monitor for load metrics */
    memoryMonitor?: MemoryMonitor;
}
/**
 * Agent heartbeat status tracking.
 */
export interface AgentHeartbeat {
    /** Agent ID */
    agentId: string;
    /** Unix timestamp of last heartbeat */
    lastSeen: number;
    /** Number of consecutive missed heartbeats */
    missedCount: number;
    /** Current status (online/offline) */
    status: 'online' | 'offline';
}
/**
 * Heartbeat publisher - sends heartbeat messages via MQTT.
 *
 * Per STAT-01: Agents publish heartbeat every 30 seconds with status (idle/busy/error).
 * Per COMM-07: QoS 0 for heartbeat messages (fire-and-forget).
 */
export declare class HeartbeatPublisher {
    private config;
    private intervalId?;
    private currentStatus;
    private activeTaskCount;
    private maxCapacity;
    constructor(config: HeartbeatConfig);
    /**
     * Start publishing heartbeats.
     * Publishes immediately, then at configured interval.
     */
    start(): void;
    /**
     * Stop publishing heartbeats.
     */
    stop(): void;
    /**
     * Update agent status and publish immediately.
     * Use when status changes (idle -> busy, busy -> error, etc).
     *
     * @param status - New agent status
     */
    setStatus(status: 'idle' | 'busy' | 'error'): void;
    /**
     * Update active task count for load metrics reporting.
     * Called by WorkerTaskExecutor when tasks start/complete.
     *
     * @param count - Current number of active tasks
     */
    setActiveTaskCount(count: number): void;
    /**
     * Set maximum task capacity for this agent.
     *
     * @param capacity - Maximum concurrent tasks
     */
    setMaxCapacity(capacity: number): void;
    /**
     * Publish heartbeat message via MQTT.
     * Creates MessageEnvelope with type='heartbeat', qos=0 per COMM-07.
     */
    private publish;
    /**
     * Publish load metrics via MQTT retained message.
     *
     * Per ROUT-02: Workers report load metrics every 5 seconds via retained messages.
     * Per ROUT-04: Includes CPU/memory for 85% overload threshold.
     */
    publishLoadMetrics(): void;
}
/**
 * Heartbeat tracker - monitors agent heartbeats and detects offline agents.
 *
 * Per DISC-04: 4 missed heartbeats = offline (2-minute timeout).
 * Emits 'agent-online' and 'agent-offline' events for state changes.
 */
export declare class HeartbeatTracker extends EventEmitter {
    /** Heartbeat interval in milliseconds (30 seconds per STAT-01) */
    static readonly HEARTBEAT_INTERVAL_MS = 30000;
    /** Number of missed heartbeats before marking offline (DISC-04) */
    static readonly MISSED_THRESHOLD = 4;
    /** Offline timeout in milliseconds (2 minutes) */
    static readonly OFFLINE_TIMEOUT_MS = 120000;
    private heartbeats;
    private db?;
    private checkInterval?;
    constructor(db?: Database);
    /**
     * Record a heartbeat from an agent.
     * Updates last seen timestamp, resets missed count, emits 'agent-online' if was offline.
     *
     * @param agentId - Agent ID that sent heartbeat
     */
    recordHeartbeat(agentId: string): void;
    /**
     * Check for missed heartbeats and mark agents offline.
     * Runs every 30 seconds to calculate missed intervals.
     */
    private checkMissedHeartbeats;
    /**
     * Get heartbeat status for a specific agent.
     *
     * @param agentId - Agent ID to query
     * @returns Agent heartbeat status or undefined if not found
     */
    getAgentStatus(agentId: string): AgentHeartbeat | undefined;
    /**
     * Get all agent heartbeat statuses.
     *
     * @returns Map of agent ID to heartbeat status
     */
    getAllStatuses(): Map<string, AgentHeartbeat>;
    /**
     * Load heartbeat state from database on startup.
     * Restores last known status for all agents.
     *
     * @param db - Database connection
     */
    loadFromDatabase(db: Database): void;
    /**
     * Update database with agent status.
     * UPSERT into agent_status table.
     *
     * @param agentId - Agent ID
     * @param status - Agent status
     * @param timestamp - Unix timestamp
     */
    private updateDatabase;
    /**
     * Stop heartbeat tracking.
     */
    stop(): void;
}
/**
 * Factory function to create heartbeat publisher.
 *
 * @param config - Heartbeat configuration
 * @returns HeartbeatPublisher instance
 */
export declare function createHeartbeatPublisher(config: HeartbeatConfig): HeartbeatPublisher;
/**
 * Factory function to create heartbeat tracker.
 *
 * @param db - Optional database connection for persistence
 * @returns HeartbeatTracker instance
 */
export declare function createHeartbeatTracker(db?: Database): HeartbeatTracker;
export {};
//# sourceMappingURL=heartbeat.d.ts.map