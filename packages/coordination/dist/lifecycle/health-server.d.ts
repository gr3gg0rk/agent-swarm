/**
 * Per-Agent HTTP Health Check Server
 *
 * Per RESEARCH.md Pattern 5: Health check endpoint verifies agent is responsive (not just running).
 * Prevents false positives from deadlocked or unresponsive agents.
 * Per LIFE-05: Health check endpoint with database and MQTT connectivity checks.
 *
 * Each agent exposes HTTP /health endpoint that returns:
 * - 200 if agent is healthy and responsive
 * - 503 if agent is unhealthy or unresponsive
 *
 * Health checks include:
 * - Database connectivity (SELECT 1)
 * - MQTT connection status
 * - Heartbeat publishing status (tracks last heartbeat time)
 */
import type { MqttClientMinimal } from '../discovery/registry.js';
import type { HeartbeatPublisher } from './heartbeat.js';
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
 * Configuration for health check server.
 */
export interface HealthCheckConfig {
    /** Unique port per agent (e.g., minerva=3001, worker-1=3002, etc.) */
    port: number;
    /** Unique agent ID for this agent */
    agentId: string;
    /** Optional MQTT client for connection check */
    mqttClient?: MqttClientMinimal;
    /** Optional database for connectivity check */
    database?: Database;
    /** Optional heartbeat publisher for activity check */
    heartbeatPublisher?: HeartbeatPublisher;
}
/**
 * Health check response status.
 */
export interface HealthStatus {
    /** Overall health status */
    status: 'healthy' | 'unhealthy';
    /** Agent ID */
    agentId: string;
    /** ISO timestamp of health check */
    timestamp: string;
    /** Detailed check results */
    checks: {
        /** Database connectivity status */
        database: 'connected' | 'disconnected' | 'skipped';
        /** MQTT connection status */
        mqtt: 'connected' | 'disconnected' | 'skipped';
        /** Heartbeat publishing status */
        heartbeat: 'publishing' | 'stopped' | 'skipped';
    };
}
/**
 * HTTP health check server for per-agent monitoring.
 *
 * Provides /health endpoint that verifies agent responsiveness,
 * not just process existence. Prevents false positives from
 * deadlocked or unresponsive agents.
 *
 * Per LIFE-05: Returns 200 for healthy, 503 for unhealthy.
 */
export declare class HealthCheckServer {
    private server?;
    private config;
    private lastHeartbeatTime?;
    private logger;
    constructor(config: HealthCheckConfig);
    /**
     * Start health check HTTP server.
     * Listens on configured port for /health requests.
     */
    start(): void;
    /**
     * Stop health check HTTP server.
     */
    stop(): Promise<void>;
    /**
     * Setup heartbeat publishing tracking.
     * Monitors HeartbeatPublisher to track last heartbeat time.
     *
     * Note: Current implementation checks if publisher is running.
     * For accurate tracking, HeartbeatPublisher would need to emit events.
     */
    private setupHeartbeatTracking;
    /**
     * Update last heartbeat time (call externally when heartbeat is published).
     * This can be called by the agent when it publishes heartbeats.
     */
    updateHeartbeatTime(): void;
    /**
     * Handle incoming HTTP request.
     * Only /health endpoint is supported.
     */
    private handleRequest;
    /**
     * Get current health status.
     * Checks database, MQTT, and heartbeat status.
     *
     * @returns Health status with detailed check results
     */
    private getHealthStatus;
}
/**
 * Factory function to create health check server.
 *
 * @param config - Health check configuration
 * @returns HealthCheckServer instance
 */
export declare function createHealthCheckServer(config: HealthCheckConfig): HealthCheckServer;
export {};
//# sourceMappingURL=health-server.d.ts.map