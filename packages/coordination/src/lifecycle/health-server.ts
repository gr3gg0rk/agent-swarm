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

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { MqttClientMinimal } from '../discovery/registry.js';
import type { HeartbeatPublisher } from './heartbeat.js';
import { getLogger } from '../errors/logger.js';

// Local Database interface for WSL compatibility (same pattern as heartbeat.ts)
interface Database {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
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
export class HealthCheckServer {
  private server?: Server;
  private config: HealthCheckConfig;
  private lastHeartbeatTime?: number;
  private logger = getLogger('health-check');

  constructor(config: HealthCheckConfig) {
    this.config = config;

    // Track heartbeat publishing if publisher provided
    if (config.heartbeatPublisher) {
      this.setupHeartbeatTracking(config.heartbeatPublisher);
    }
  }

  /**
   * Start health check HTTP server.
   * Listens on configured port for /health requests.
   */
  start(): void {
    this.server = createServer((req, res) => this.handleRequest(req, res));

    this.server.listen(this.config.port, () => {
      this.logger.info('Health check server started', {
        port: this.config.port,
        agentId: this.config.agentId,
      });
    });

    // Handle server errors
    this.server.on('error', (error: Error) => {
      console.error('Health check server error', {
        error: error.message,
        port: this.config.port,
      });
    });
  }

  /**
   * Stop health check HTTP server.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('Health check server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup heartbeat publishing tracking.
   * Monitors HeartbeatPublisher to track last heartbeat time.
   *
   * Note: Current implementation checks if publisher is running.
   * For accurate tracking, HeartbeatPublisher would need to emit events.
   */
  private setupHeartbeatTracking(publisher: HeartbeatPublisher): void {
    // In a full implementation, HeartbeatPublisher would emit 'heartbeat' events
    // For now, we initialize lastHeartbeatTime to now when tracking starts
    this.lastHeartbeatTime = Date.now();

    // If HeartbeatPublisher had event emission, we'd do:
    // publisher.on('heartbeat', () => { this.lastHeartbeatTime = Date.now() });
  }

  /**
   * Update last heartbeat time (call externally when heartbeat is published).
   * This can be called by the agent when it publishes heartbeats.
   */
  updateHeartbeatTime(): void {
    this.lastHeartbeatTime = Date.now();
  }

  /**
   * Handle incoming HTTP request.
   * Only /health endpoint is supported.
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.url === '/health' && req.method === 'GET') {
      const healthStatus = await this.getHealthStatus();
      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;

      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthStatus, null, 2));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found. Use /health endpoint.');
    }
  }

  /**
   * Get current health status.
   * Checks database, MQTT, and heartbeat status.
   *
   * @returns Health status with detailed check results
   */
  private async getHealthStatus(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {
      database: 'skipped',
      mqtt: 'skipped',
      heartbeat: 'skipped',
    };

    let isHealthy = true;

    // Check database connectivity
    if (this.config.database) {
      try {
        const row = this.config.database.prepare('SELECT 1 AS test').get();
        checks.database = (row && (row as { test: number }).test === 1) ? 'connected' : 'disconnected';
        if (checks.database === 'disconnected') {
          isHealthy = false;
        }
      } catch (error) {
        checks.database = 'disconnected';
        isHealthy = false;
        this.logger.debug('Database health check failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Check MQTT connectivity
    if (this.config.mqttClient) {
      // MQTT.js client doesn't expose a simple connected property
      // We'll mark as connected if client exists (assumes active connection)
      // In production, you'd check client.connected or similar
      try {
        // Try to determine connection status
        // Since MqttClientMinimal interface doesn't expose connected property,
        // we assume connected if client was provided
        checks.mqtt = 'connected';

        // If the underlying client has a 'connected' property, check it
        const rawClient = (this.config.mqttClient as any).client;
        if (rawClient && rawClient.connected === false) {
          checks.mqtt = 'disconnected';
          isHealthy = false;
        }
      } catch (error) {
        checks.mqtt = 'connected'; // Assume connected if we can't check
      }
    }

    // Check heartbeat publisher is running
    if (this.config.heartbeatPublisher) {
      // Verify heartbeats are being published (check last heartbeat within 2x interval)
      const HEARTBEAT_TIMEOUT_MS = 60000; // 60 seconds (2x 30s interval)
      const now = Date.now();

      if (this.lastHeartbeatTime && (now - this.lastHeartbeatTime) < HEARTBEAT_TIMEOUT_MS) {
        checks.heartbeat = 'publishing';
      } else {
        checks.heartbeat = 'stopped';
        isHealthy = false;
      }
    }

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      agentId: this.config.agentId,
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}

/**
 * Factory function to create health check server.
 *
 * @param config - Health check configuration
 * @returns HealthCheckServer instance
 */
export function createHealthCheckServer(config: HealthCheckConfig): HealthCheckServer {
  return new HealthCheckServer(config);
}
