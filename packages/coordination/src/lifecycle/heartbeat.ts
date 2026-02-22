/**
 * Heartbeat Monitoring with 4-Miss Offline Detection
 *
 * Per RESEARCH.md Pattern 2: Agents publish heartbeat every 30 seconds via MQTT.
 * Agents missing 4 consecutive heartbeats are marked offline (2-minute timeout).
 * Per DISC-04: 4 missed beats = offline detection.
 * Per STAT-01: 30-second heartbeat publishing interval.
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { MqttClientMinimal } from '../discovery/registry.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope } from '../communication/message.js';
import type { LoadMetrics } from '../delegation/types.js';
import type { MemoryMonitor } from '../memory/monitor.js';

// better-sqlite3 type import for database persistence
// Database is optional - heartbeat works without persistence
interface Database {
  prepare(sql: string): {
    run(...params: unknown[]): { changes: number };
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
export class HeartbeatPublisher {
  private config: HeartbeatConfig;
  private intervalId?: NodeJS.Timeout;
  private currentStatus: 'idle' | 'busy' | 'error' = 'idle';
  private activeTaskCount: number = 0;
  private maxCapacity: number = 5;

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  /**
   * Start publishing heartbeats.
   * Publishes immediately, then at configured interval.
   */
  start(): void {
    // Publish heartbeat every interval (30 seconds per STAT-01)
    this.intervalId = setInterval(() => {
      this.publish();
    }, this.config.interval);

    // Publish initial heartbeat immediately
    this.publish();
  }

  /**
   * Stop publishing heartbeats.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  /**
   * Update agent status and publish immediately.
   * Use when status changes (idle -> busy, busy -> error, etc).
   *
   * @param status - New agent status
   */
  setStatus(status: 'idle' | 'busy' | 'error'): void {
    this.currentStatus = status;
    // Immediately publish status change
    this.publish();
  }

  /**
   * Update active task count for load metrics reporting.
   * Called by WorkerTaskExecutor when tasks start/complete.
   *
   * @param count - Current number of active tasks
   */
  setActiveTaskCount(count: number): void {
    this.activeTaskCount = count;
  }

  /**
   * Set maximum task capacity for this agent.
   *
   * @param capacity - Maximum concurrent tasks
   */
  setMaxCapacity(capacity: number): void {
    this.maxCapacity = capacity;
  }

  /**
   * Publish heartbeat message via MQTT.
   * Creates MessageEnvelope with type='heartbeat', qos=0 per COMM-07.
   */
  private publish(): void {
    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: this.config.agentId,
      type: 'heartbeat',
      timestamp: Date.now(),
      payload: {
        agentId: this.config.agentId,
        status: this.currentStatus,
      },
      qos: 0, // QoS 0 for heartbeats per COMM-07
      retain: false,
    };

    const topic = Topics.agentHeartbeat(this.config.agentId);

    // Serialize as JSON (heartbeat payload is small)
    const payload = JSON.stringify(envelope);

    this.config.mqttClient.publish(topic, payload, { qos: 0, retain: false }).catch((error) => {
      console.error('Failed to publish heartbeat:', error);
    });

    // Publish load metrics after heartbeat
    this.publishLoadMetrics();
  }

  /**
   * Publish load metrics via MQTT retained message.
   *
   * Per ROUT-02: Workers report load metrics every 5 seconds via retained messages.
   * Per ROUT-04: Includes CPU/memory for 85% overload threshold.
   */
  publishLoadMetrics(): void {
    // Get memory stats if monitor available, otherwise use defaults
    let memoryPercent = 0;
    let cpuPercent = 0;

    if (this.config.memoryMonitor) {
      const stats = this.config.memoryMonitor.getMemoryStats();
      memoryPercent = stats.usagePercent * 100;
      cpuPercent = this.config.memoryMonitor.getCPUPercent();
    }

    const metrics: LoadMetrics = {
      agentId: this.config.agentId,
      cpuPercent,
      memoryPercent,
      activeTasks: this.activeTaskCount,
      maxCapacity: this.maxCapacity,
      timestamp: Date.now(),
    };

    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: this.config.agentId,
      type: 'load_metrics',
      timestamp: Date.now(),
      payload: metrics,
      qos: 0,
      retain: true,  // CRITICAL: retained for last-known-value
    };

    const topic = Topics.agentLoad(this.config.agentId);
    const payload = JSON.stringify(envelope);

    this.config.mqttClient.publish(topic, payload, { qos: 0, retain: true }).catch((error) => {
      console.error('Failed to publish load metrics:', error);
    });
  }
}

/**
 * Heartbeat tracker - monitors agent heartbeats and detects offline agents.
 *
 * Per DISC-04: 4 missed heartbeats = offline (2-minute timeout).
 * Emits 'agent-online' and 'agent-offline' events for state changes.
 */
export class HeartbeatTracker extends EventEmitter {
  /** Heartbeat interval in milliseconds (30 seconds per STAT-01) */
  static readonly HEARTBEAT_INTERVAL_MS = 30000;

  /** Number of missed heartbeats before marking offline (DISC-04) */
  static readonly MISSED_THRESHOLD = 4;

  /** Offline timeout in milliseconds (2 minutes) */
  static readonly OFFLINE_TIMEOUT_MS = 120000;

  private heartbeats: Map<string, AgentHeartbeat> = new Map();
  private db?: Database;
  private checkInterval?: NodeJS.Timeout;

  constructor(db?: Database) {
    super();
    this.db = db;

    // Start periodic check for missed heartbeats
    this.checkInterval = setInterval(() => {
      this.checkMissedHeartbeats();
    }, HeartbeatTracker.HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Record a heartbeat from an agent.
   * Updates last seen timestamp, resets missed count, emits 'agent-online' if was offline.
   *
   * @param agentId - Agent ID that sent heartbeat
   */
  recordHeartbeat(agentId: string): void {
    const now = Date.now();
    const existing = this.heartbeats.get(agentId);

    if (existing) {
      const wasOffline = existing.status === 'offline';
      existing.lastSeen = now;
      existing.missedCount = 0;
      existing.status = 'online';

      if (wasOffline) {
        this.emit('agent-online', agentId);
      }

      // Update database if provided
      if (this.db) {
        this.updateDatabase(agentId, 'online', now);
      }
    } else {
      // New agent registration
      this.heartbeats.set(agentId, {
        agentId,
        lastSeen: now,
        missedCount: 0,
        status: 'online',
      });
      this.emit('agent-online', agentId);

      // Update database if provided
      if (this.db) {
        this.updateDatabase(agentId, 'online', now);
      }
    }
  }

  /**
   * Check for missed heartbeats and mark agents offline.
   * Runs every 30 seconds to calculate missed intervals.
   */
  private checkMissedHeartbeats(): void {
    const now = Date.now();

    for (const [agentId, heartbeat] of this.heartbeats) {
      const timeSinceLastSeen = now - heartbeat.lastSeen;
      const missedIntervals = Math.floor(timeSinceLastSeen / HeartbeatTracker.HEARTBEAT_INTERVAL_MS);

      if (missedIntervals > heartbeat.missedCount) {
        heartbeat.missedCount = missedIntervals;

        if (missedIntervals >= HeartbeatTracker.MISSED_THRESHOLD && heartbeat.status === 'online') {
          heartbeat.status = 'offline';
          this.emit('agent-offline', agentId, timeSinceLastSeen);

          // Update database if provided
          if (this.db) {
            this.updateDatabase(agentId, 'offline', now);
          }
        }
      }
    }
  }

  /**
   * Get heartbeat status for a specific agent.
   *
   * @param agentId - Agent ID to query
   * @returns Agent heartbeat status or undefined if not found
   */
  getAgentStatus(agentId: string): AgentHeartbeat | undefined {
    return this.heartbeats.get(agentId);
  }

  /**
   * Get all agent heartbeat statuses.
   *
   * @returns Map of agent ID to heartbeat status
   */
  getAllStatuses(): Map<string, AgentHeartbeat> {
    return new Map(this.heartbeats);
  }

  /**
   * Load heartbeat state from database on startup.
   * Restores last known status for all agents.
   *
   * @param db - Database connection
   */
  loadFromDatabase(db: Database): void {
    this.db = db;

    try {
      const rows = db.prepare('SELECT agent_id, status, last_heartbeat FROM agent_status').all() as Array<{
        agent_id: string;
        status: string;
        last_heartbeat: number;
      }>;

      for (const row of rows) {
        this.heartbeats.set(row.agent_id, {
          agentId: row.agent_id,
          lastSeen: row.last_heartbeat,
          missedCount: 0,
          status: row.status === 'offline' ? 'offline' : 'online',
        });
      }
    } catch (error) {
      // Table might not exist yet, ignore
      console.debug('Failed to load heartbeat state from database:', error);
    }
  }

  /**
   * Update database with agent status.
   * UPSERT into agent_status table.
   *
   * @param agentId - Agent ID
   * @param status - Agent status
   * @param timestamp - Unix timestamp
   */
  private updateDatabase(agentId: string, status: string, timestamp: number): void {
    if (!this.db) {
      return;
    }

    try {
      const stmt = this.db.prepare(`
        INSERT INTO agent_status (agent_id, status, last_heartbeat, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET
          status = excluded.status,
          last_heartbeat = excluded.last_heartbeat,
          updated_at = excluded.updated_at
      `);

      stmt.run(agentId, status, timestamp, timestamp);
    } catch (error) {
      console.error('Failed to update heartbeat state in database:', error);
    }
  }

  /**
   * Stop heartbeat tracking.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = undefined;
    }
  }
}

/**
 * Factory function to create heartbeat publisher.
 *
 * @param config - Heartbeat configuration
 * @returns HeartbeatPublisher instance
 */
export function createHeartbeatPublisher(config: HeartbeatConfig): HeartbeatPublisher {
  return new HeartbeatPublisher(config);
}

/**
 * Factory function to create heartbeat tracker.
 *
 * @param db - Optional database connection for persistence
 * @returns HeartbeatTracker instance
 */
export function createHeartbeatTracker(db?: Database): HeartbeatTracker {
  return new HeartbeatTracker(db);
}
