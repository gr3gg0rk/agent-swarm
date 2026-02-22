/**
 * Graceful Shutdown Handler with Task Completion
 *
 * Per RESEARCH.md "Graceful Shutdown Handler" example:
 * Agents gracefully shutdown on SIGTERM, completing current task if possible.
 * Per LIFE-03: 30-second graceful shutdown timeout.
 * Per CONTEXT.md: On SIGTERM, agents finish in-progress tasks before exiting.
 */
import type { MqttClientMinimal } from '../discovery/registry.js';
import type { AgentDiscovery } from '../discovery/registry.js';
import type { HeartbeatPublisher } from './heartbeat.js';
import type { CheckpointManager } from '../checkpoint/manager.js';
/**
 * Configuration for graceful shutdown handler.
 */
export interface ShutdownConfig {
    /** Optional MQTT client to disconnect on shutdown */
    mqttClient?: MqttClientMinimal;
    /** Optional agent discovery to unregister on shutdown */
    agentDiscovery?: AgentDiscovery;
    /** Optional heartbeat publisher to stop on shutdown */
    heartbeatPublisher?: HeartbeatPublisher;
    /** Optional checkpoint manager to sync before shutdown */
    checkpointManager?: CheckpointManager;
    /** Graceful shutdown timeout in milliseconds (30 seconds per systemd) */
    gracefulShutdownTimeout: number;
}
/**
 * Graceful shutdown handler.
 *
 * Waits for pending tasks to complete before exiting.
 * Handles SIGTERM from systemd and SIGINT (Ctrl+C) for development.
 */
export declare class GracefulShutdown {
    private config;
    private isShuttingDown;
    private pendingTasks;
    constructor(config: ShutdownConfig);
    /**
     * Register a pending task for graceful shutdown tracking.
     * Call this when starting a task that may need time to complete.
     *
     * @param taskId - Task ID to track
     */
    registerTask(taskId: string): void;
    /**
     * Mark a task as completed.
     * Call this when a task finishes to remove it from shutdown tracking.
     *
     * @param taskId - Task ID to complete
     */
    completeTask(taskId: string): void;
    /**
     * Set up signal handlers for SIGTERM and SIGINT.
     */
    private setupSignalHandlers;
    /**
     * Initiate graceful shutdown.
     *
     * Waits for pending tasks to complete (up to timeout).
     * Stops heartbeat publisher, unregisters agent, disconnects MQTT.
     *
     * @param signal - Signal that triggered shutdown
     */
    private shutdown;
    /**
     * Get current pending task count.
     *
     * @returns Number of pending tasks
     */
    getPendingTaskCount(): number;
}
/**
 * Factory function to create graceful shutdown handler.
 *
 * @param config - Shutdown configuration
 * @returns GracefulShutdown instance
 */
export declare function createGracefulShutdown(config: ShutdownConfig): GracefulShutdown;
//# sourceMappingURL=shutdown.d.ts.map