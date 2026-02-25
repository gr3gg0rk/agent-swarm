#!/usr/bin/env tsx
/**
 * REST API Server for OpenClaw Swarm
 *
 * Provides HTTP endpoints on port 3000 for the dashboard to access:
 * - Agent status
 * - Task queue
 * - Real-time events (SSE)
 */

import { createStateApi, startServer, createDatabase, initializeSchema, createHeartbeatTracker } from './packages/coordination/dist/index.js';
import { connectToBroker } from './packages/coordination/dist/index.js';

const DB_PATH = '/tmp/openclaw-swarm-state.db';
const API_PORT = 3000;

async function main() {
  console.log('Starting OpenClaw Swarm REST API server...');

  // Create database
  const db = createDatabase({ dbPath: DB_PATH });
  console.log(`Database: ${DB_PATH}`);

  // Initialize schema
  initializeSchema(db);
  console.log('Database schema initialized');

  // Connect to MQTT broker for SSE events
  const mqttClient = await connectToBroker({
    brokerUrl: 'mqtt://localhost:1883',
    clientId: 'api-server'
  });
  console.log('Connected to MQTT broker');

  // Create heartbeat tracker to monitor agent heartbeats
  const heartbeatTracker = createHeartbeatTracker(db);
  console.log('Heartbeat tracker initialized');

  // Subscribe to agent heartbeat messages (both topic patterns)
  await mqttClient.subscribe('agent/+/heartbeat');
  await mqttClient.subscribe('swarm/status');
  console.log('Subscribed to heartbeat topics');

  // Handle incoming heartbeat messages
  mqttClient.on('message', (envelope: unknown, topic: string) => {
    // Extract agent ID from topic (agent/{agentId}/heartbeat)
    const match = topic.match(/^agent\/([^/]+)\/heartbeat$/);
    if (match) {
      const agentId = match[1];
      heartbeatTracker.recordHeartbeat(agentId);
    }

    // Also handle swarm/status heartbeats (legacy format)
    if (topic === 'swarm/status') {
      const message = envelope as { payload?: { agentId?: string } };
      if (message.payload?.agentId) {
        heartbeatTracker.recordHeartbeat(message.payload.agentId);
      }
    }
  });

  // Create Express app
  const app = createStateApi(db, mqttClient);

  // Start server
  const server = startServer(app, API_PORT);
  console.log(`REST API server listening on port ${API_PORT}`);
  console.log(`Dashboard: http://100.115.11.71:5173`);
  console.log(`API: http://localhost:${API_PORT}`);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Shutting down...');
    heartbeatTracker.stop();
    server.close();
    await mqttClient.end();
    db.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Shutting down...');
    heartbeatTracker.stop();
    server.close();
    await mqttClient.end();
    db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});
