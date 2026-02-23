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

import * as os from 'os';
import mqtt, { type IClientOptions } from 'mqtt';

// Type for MQTT Client instance
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
export const HARDWARE_PROFILES: Record<string, HardwareProfile> = {
  'pi-2b': {
    maxConnections: 3,
    healthCheckInterval: 30000,
    idleTimeout: 120000
  },
  'pi-5': {
    maxConnections: 5,
    healthCheckInterval: 30000,
    idleTimeout: 120000
  },
  'beelink': {
    maxConnections: 10,
    healthCheckInterval: 30000,
    idleTimeout: 120000
  },
  'default': {
    maxConnections: 5,
    healthCheckInterval: 30000,
    idleTimeout: 120000
  }
};

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
export function detectHardwareProfile(): HardwareProfile {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const model = cpus[0]?.model || '';

  // Raspberry Pi 2B: ARMv7, 1GB RAM
  if (model.includes('ARMv7') && totalMem < 2 * 1024 * 1024 * 1024) {
    return HARDWARE_PROFILES['pi-2b'];
  }
  // Raspberry Pi 5: ARMv8, 4-8GB RAM
  if (model.includes('ARMv8') && totalMem >= 2 * 1024 * 1024 * 1024) {
    return HARDWARE_PROFILES['pi-5'];
  }
  // Beelink/PC: x86_64, >8GB RAM
  if (process.platform === 'linux' && model.includes('Intel') && totalMem > 8 * 1024 * 1024 * 1024) {
    return HARDWARE_PROFILES['beelink'];
  }

  return HARDWARE_PROFILES['default'];
}

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
 * Pool entry containing client and metadata.
 */
interface PoolEntry {
  /** MQTT client instance */
  client: MqttClientInstance;
  /** Last used timestamp for LRU eviction */
  lastUsed: number;
  /** Connection ID for tracking */
  id: string;
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
export class MqttConnectionPool {
  private connections: Map<string, PoolEntry> = new Map();
  private config: PoolConfig;
  private profile: HardwareProfile;
  private healthCheckTimer?: NodeJS.Timeout;

  constructor(config: PoolConfig) {
    this.config = config;
    this.profile = config.profile || detectHardwareProfile();
    this.startHealthCheck();
  }

  /**
   * Acquires a connection from the pool.
   * Returns an existing healthy connection or creates a new one.
   *
   * LRU eviction strategy: If pool at capacity, evicts least recently used
   * connection before creating new one.
   *
   * @returns Promise resolving to MQTT client instance and connection ID
   */
  async acquire(): Promise<{ client: MqttClientInstance; connectionId: string }> {
    // Check for existing healthy connection
    for (const entry of this.connections.values()) {
      if (this.isHealthy(entry.client)) {
        entry.lastUsed = Date.now();
        return { client: entry.client, connectionId: entry.id };
      }
    }

    // Create new connection if under limit
    if (this.connections.size < this.profile.maxConnections) {
      const client = await this.createConnection();
      const id = this.generateConnectionId();
      this.connections.set(id, { client, lastUsed: Date.now(), id });
      return { client, connectionId: id };
    }

    // Evict least recently used connection
    const lruId = this.findLRUConnectionId();
    if (lruId) {
      await this.remove(lruId);
    }

    // Create new connection after eviction
    const client = await this.createConnection();
    const id = this.generateConnectionId();
    this.connections.set(id, { client, lastUsed: Date.now(), id });
    return { client, connectionId: id };
  }

  /**
   * Releases a connection back to the pool.
   * Marks connection as available for reuse.
   *
   * @param connectionId - Connection ID to release
   */
  async release(connectionId: string): Promise<void> {
    const entry = this.connections.get(connectionId);
    if (!entry) return;

    // Check if idle beyond timeout
    const idleTime = Date.now() - entry.lastUsed;
    if (idleTime > this.profile.idleTimeout) {
      await this.remove(connectionId);
    }
  }

  /**
   * Creates a new MQTT connection to the broker.
   *
   * @returns Promise resolving to connected MQTT client
   */
  private async createConnection(): Promise<MqttClientInstance> {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect(this.config.brokerUrl, this.config.options);

      client.on('connect', () => resolve(client));
      client.on('error', (err) => reject(err));
    });
  }

  /**
   * Checks if a connection is healthy.
   * Connection is healthy if connected and stream not destroyed.
   *
   * @param client - MQTT client to check
   * @returns True if connection is healthy
   */
  private isHealthy(client: MqttClientInstance): boolean {
    return client.connected && !client.stream.destroyed;
  }

  /**
   * Removes a connection from the pool and closes it.
   *
   * @param connectionId - Connection ID to remove
   */
  private async remove(connectionId: string): Promise<void> {
    const entry = this.connections.get(connectionId);
    if (entry) {
      entry.client.end();
      this.connections.delete(connectionId);
    }
  }

  /**
   * Finds the least recently used connection ID.
   *
   * @returns LRU connection ID or undefined if pool empty
   */
  private findLRUConnectionId(): string | undefined {
    let lruId: string | undefined;
    let lruTime = Infinity;

    for (const [id, entry] of this.connections) {
      if (entry.lastUsed < lruTime) {
        lruTime = entry.lastUsed;
        lruId = id;
      }
    }

    return lruId;
  }

  /**
   * Generates a unique connection ID.
   *
   * @returns Unique connection identifier
   */
  private generateConnectionId(): string {
    return `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Starts periodic health check for connections.
   * Removes idle and unhealthy connections.
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      const now = Date.now();

      for (const [id, entry] of this.connections) {
        // Check idle timeout
        const idleTime = now - entry.lastUsed;
        if (idleTime > this.profile.idleTimeout) {
          this.remove(id);
          continue;
        }

        // Validate connection health
        if (!this.isHealthy(entry.client)) {
          this.remove(id);
        }
      }
    }, this.profile.healthCheckInterval);
  }

  /**
   * Stops the connection pool and closes all connections.
   */
  async stop(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    // Close all connections
    for (const id of this.connections.keys()) {
      await this.remove(id);
    }
  }

  /**
   * Gets pool statistics.
   *
   * @returns Pool stats including connection counts
   */
  getStats() {
    const healthyCount = [...this.connections.values()].filter(e => this.isHealthy(e.client)).length;
    return {
      totalConnections: this.connections.size,
      maxConnections: this.profile.maxConnections,
      healthyConnections: healthyCount
    };
  }
}

/**
 * Connection pool manager with simplified API.
 * Provides acquire/release pattern for connection reuse.
 */
export class ConnectionPoolManager {
  private pool: MqttConnectionPool;
  private activeConnections: Map<string, string> = new Map(); // operationId -> connectionId

  constructor(config: PoolConfig) {
    this.pool = new MqttConnectionPool(config);
  }

  /**
   * Gets a connection from the pool.
   *
   * @param operationId - Optional operation ID for tracking
   * @returns Promise resolving to MQTT client instance
   */
  async getConnection(operationId?: string): Promise<MqttClientInstance> {
    const { client, connectionId } = await this.pool.acquire();
    if (operationId) {
      this.activeConnections.set(operationId, connectionId);
    }
    return client;
  }

  /**
   * Releases a connection back to the pool.
   *
   * @param operationId - Operation ID used for getConnection
   */
  async releaseConnection(operationId: string): Promise<void> {
    const connectionId = this.activeConnections.get(operationId);
    if (connectionId) {
      await this.pool.release(connectionId);
      this.activeConnections.delete(operationId);
    }
  }

  /**
   * Gets pool statistics.
   */
  getStats() {
    return this.pool.getStats();
  }

  /**
   * Stops the connection pool.
   */
  async stop(): Promise<void> {
    return this.pool.stop();
  }
}
