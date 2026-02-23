import { Router, type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import type { MqttClient } from '../../communication/mqtt.js';

/**
 * SSE event types for dashboard updates
 */
export interface DashboardEvent {
  type: 'agents' | 'tasks' | 'metrics';
  data: unknown;
  timestamp: number;
}

/**
 * Throttled broadcaster for SSE updates
 * Limits broadcasts to 10 updates/second (100ms interval)
 * Per VIZ-05 requirement
 */
export class ThrottledBroadcaster {
  private pendingUpdate = false;
  private buffer: Map<string, unknown> = new Map();
  private broadcastInterval: NodeJS.Timeout;

  constructor(
    private broadcast: (data: DashboardEvent) => void,
    private maxFrequencyMs: number = 100 // 10 updates/second
  ) {
    this.broadcastInterval = setInterval(() => {
      this.flush();
    }, this.maxFrequencyMs);
  }

  /**
   * Buffer an update for next broadcast cycle
   */
  enqueue(type: string, data: unknown): void {
    this.buffer.set(type, data);
    this.pendingUpdate = true;
  }

  /**
   * Send buffered updates at throttled rate
   */
  private flush(): void {
    if (!this.pendingUpdate) return;

    const update: DashboardEvent = {
      type: 'metrics',
      data: Object.fromEntries(this.buffer),
      timestamp: Date.now()
    };

    this.broadcast(update);
    this.buffer.clear();
    this.pendingUpdate = false;
  }

  /**
   * Stop broadcasting and clean up interval
   */
  stop(): void {
    clearInterval(this.broadcastInterval);
  }
}

/**
 * Creates SSE event routes for dashboard real-time updates
 *
 * Endpoints:
 * - GET /api/events - SSE endpoint for dashboard updates
 *
 * @param db - Database instance for querying current state
 * @param mqttClient - MQTT client for subscribing to load metrics
 * @returns Express router with SSE routes
 */
export function createEventRoutes(
  db: Database.Database,
  mqttClient: MqttClient
): { router: Router; broadcaster: ThrottledBroadcaster } {
  const router = Router();

  // Track connected SSE clients
  const clients = new Set<Response>();

  /**
   * GET /api/events
   *
   * Server-Sent Events endpoint for real-time dashboard updates.
   * Clients connect and receive push updates as swarm state changes.
   *
   * Per 09-RESEARCH.md "Pattern 1: SSE Endpoint in Express"
   */
  router.get('/events', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Add to clients set
    clients.add(res);

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    // Send initial agent status
    const agents = getAgentStatuses(db);
    res.write(`data: ${JSON.stringify({ type: 'agents', data: agents, timestamp: Date.now() })}\n\n`);

    // Clean up on disconnect
    req.on('close', () => {
      clients.delete(res);
      console.log('SSE client disconnected, active clients:', clients.size);
    });

    console.log('SSE client connected, active clients:', clients.size);
  });

  /**
   * Broadcast function - sends data to all connected clients
   */
  function broadcast(event: DashboardEvent): void {
    const message = `data: ${JSON.stringify(event)}\n\n`;
    let disconnectedCount = 0;

    for (const client of clients) {
      try {
        client.write(message);
      } catch (err) {
        // Client disconnected, remove from set
        clients.delete(client);
        disconnectedCount++;
      }
    }

    if (disconnectedCount > 0) {
      console.log(`Removed ${disconnectedCount} disconnected clients, active: ${clients.size}`);
    }
  }

  // Create throttled broadcaster (10 updates/second per VIZ-05)
  const broadcaster = new ThrottledBroadcaster(broadcast, 100);

  /**
   * Subscribe to MQTT load metrics for real-time updates
   * Per 09-RESEARCH.md Open Question 3: Subscribe to MQTT for load metrics
   */
  mqttClient.subscribe('agent/+/load');

  mqttClient.on('message', (envelope: unknown, topic: string) => {
    // Only process load metrics messages
    if (!topic.match(/^agent\/[^/]+\/load$/)) return;

    try {
      // MessageEnvelope structure from MQTT client
      const message = envelope as { payload: unknown };
      const metrics = message.payload as {
        agentId: string;
        cpuPercent: number;
        memoryPercent: number;
        activeTasks: number;
      };

      // Buffer update for next broadcast cycle
      broadcaster.enqueue('load_metrics', {
        agentId: metrics.agentId,
        cpuPercent: metrics.cpuPercent,
        memoryPercent: metrics.memoryPercent,
        activeTasks: metrics.activeTasks
      });
    } catch (err) {
      console.error('Error parsing load metrics message:', err);
    }
  });

  return { router, broadcaster };
}

/**
 * Helper function to query current agent statuses from database
 */
function getAgentStatuses(db: Database.Database): unknown[] {
  const stmt = db.prepare(`
    SELECT agent_id as agentId, status, last_heartbeat as lastHeartbeat,
           current_task as currentTask, capabilities, updated_at as updatedAt
    FROM agent_status
    ORDER BY status, last_heartbeat DESC
  `);

  return stmt.all() as unknown[];
}
