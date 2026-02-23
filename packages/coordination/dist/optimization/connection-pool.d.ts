/**
 * MQTT Connection Pool with hardware-aware sizing and health-based eviction.
 *
 * Per OPTI-03: Reuse MQTT connections across multiple message publishes instead of
 * creating new connections for each operation. Connection pooling reduces TCP handshake
 * overhead, broker resource usage, and improves throughput.
 *
 * Hardware limits from STATE.md:
 * - Pi 2B: 3 connections (1GB RAM, ARMv7)
 * - Pi 5: 5 connections (4-8GB RAM, ARMv8)
 * - Beelink: 10 connections (>8GB RAM, x86_64)
 */
import mqtt, { type IClientOptions } from 'mqtt';
type MqttClientInstance = ReturnType<typeof mqtt.connect>;
/**
 * Hardware profile with connection limits and health check intervals.
 */
export interface HardwareProfile {
    /** Maximum concurrent connections for this hardware profile */
    maxConnections: number;
    /** Health check interval in milliseconds */
    healthCheckInterval: number;
    /** Idle timeout before connection eviction in milliseconds */
    idleTimeout: number;
}
/**
 * Hardware profiles for different device types.
 * Per STATE.md v1.1 Hardware Constraints: Connection pool limits must respect these values.
 */
export declare const HARDWARE_PROFILES: Record<string, HardwareProfile>;
/**
 * Detects hardware profile based on CPU model and total memory.
 *
 * Detection logic:
 * - Raspberry Pi 2B: ARMv7, <2GB RAM
 * - Raspberry Pi 5: ARMv8, >=2GB RAM
 * - Beelink/PC: x86_64 Intel, >8GB RAM
 * - Default: Generic profile (maxConnections: 5)
 *
 * @returns Hardware profile for current system
 */
export declare function detectHardwareProfile(): HardwareProfile;
/**
 * Configuration for connection pool.
 */
export interface PoolConfig {
    /** URL of the MQTT broker */
    brokerUrl: string;
    /** Optional MQTT client options */
    options?: IClientOptions;
    /** Optional hardware profile (auto-detected if not provided) */
    profile?: HardwareProfile;
}
/**
 * MQTT connection pool with hardware-aware sizing and LRU eviction.
 *
 * Features:
 * - Hardware-aware connection limits (Pi 2B=3, Pi 5=5, Beelink=10)
 * - LRU eviction when pool at capacity
 * - Health-based eviction for unhealthy/idle connections
 * - Fallback to direct connection if pool exhausted
 *
 * Usage:
 * ```typescript
 * const pool = new MqttConnectionPool({
 *   brokerUrl: 'mqtt://localhost:1883',
 *   options: { clientId: 'my-agent' }
 * });
 *
 * // Acquire connection from pool
 * const client = await pool.acquire();
 *
 * // Use connection
 * // ... publish/subscribe ...
 *
 * // Release connection back to pool
 * await pool.release(connectionId);
 *
 * // Cleanup on shutdown
 * await pool.stop();
 * ```
 */
export declare class MqttConnectionPool {
    private connections;
    private config;
    private profile;
    private healthCheckTimer?;
    constructor(config: PoolConfig);
    /**
     * Acquires a connection from the pool.
     * Returns an existing healthy connection or creates a new one.
     *
     * LRU eviction strategy: If pool at capacity, evicts least recently used
     * connection before creating new one.
     *
     * @returns Promise resolving to MQTT client instance and connection ID
     */
    acquire(): Promise<{
        client: MqttClientInstance;
        connectionId: string;
    }>;
    /**
     * Releases a connection back to the pool.
     * Marks connection as available for reuse.
     *
     * @param connectionId - Connection ID to release
     */
    release(connectionId: string): Promise<void>;
    /**
     * Creates a new MQTT connection to the broker.
     *
     * @returns Promise resolving to connected MQTT client
     */
    private createConnection;
    /**
     * Checks if a connection is healthy.
     * Connection is healthy if connected and stream not destroyed.
     *
     * @param client - MQTT client to check
     * @returns True if connection is healthy
     */
    private isHealthy;
    /**
     * Removes a connection from the pool and closes it.
     *
     * @param connectionId - Connection ID to remove
     */
    private remove;
    /**
     * Finds the least recently used connection ID.
     *
     * @returns LRU connection ID or undefined if pool empty
     */
    private findLRUConnectionId;
    /**
     * Generates a unique connection ID.
     *
     * @returns Unique connection identifier
     */
    private generateConnectionId;
    /**
     * Starts periodic health check for connections.
     * Removes idle and unhealthy connections.
     */
    private startHealthCheck;
    /**
     * Stops the connection pool and closes all connections.
     */
    stop(): Promise<void>;
    /**
     * Gets pool statistics.
     *
     * @returns Pool stats including connection counts
     */
    getStats(): {
        totalConnections: number;
        maxConnections: number;
        healthyConnections: number;
    };
}
/**
 * Connection pool manager with simplified API.
 * Provides acquire/release pattern for connection reuse.
 */
export declare class ConnectionPoolManager {
    private pool;
    private activeConnections;
    constructor(config: PoolConfig);
    /**
     * Gets a connection from the pool.
     *
     * @param operationId - Optional operation ID for tracking
     * @returns Promise resolving to MQTT client instance
     */
    getConnection(operationId?: string): Promise<MqttClientInstance>;
    /**
     * Releases a connection back to the pool.
     *
     * @param operationId - Operation ID used for getConnection
     */
    releaseConnection(operationId: string): Promise<void>;
    /**
     * Gets pool statistics.
     */
    getStats(): {
        totalConnections: number;
        maxConnections: number;
        healthyConnections: number;
    };
    /**
     * Stops the connection pool.
     */
    stop(): Promise<void>;
}
export {};
//# sourceMappingURL=connection-pool.d.ts.map