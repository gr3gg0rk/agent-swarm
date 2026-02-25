/**
 * Agent Runner Example
 *
 * Demonstrates npm workspace imports and role-based agent startup.
 * This is a simplified version of basic-agent.ts focused on the runner pattern.
 *
 * Usage:
 *   npm run agent -- --config config/minerva.json
 *   npm run agent -- --config config/vulcan.json
 *   npm run agent -- --config config/worker.json
 *
 * Or run directly with tsx:
 *   tsx examples/agent-runner.ts --config config/minerva.json
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { BrokerConfig, MessageEnvelope, AgentRegistration } from '@openclaw-swarm/coordination';
import {
  connectToBroker,
  Topics,
  createAgentDiscovery,
  IdempotencyTracker,
  getLogger,
  createErrorContext,
} from '@openclaw-swarm/coordination';
import { BasicAgent } from './basic-agent.js';

/**
 * Agent configuration interface.
 */
interface AgentConfig {
  agentId: string;
  role: 'orchestrator' | 'worker';
  brokerUrl: string;
  capabilities: string[];
  heartbeatInterval: number;
}

/**
 * Load agent configuration from JSON file.
 */
async function loadConfig(configPath: string): Promise<AgentConfig> {
  const content = await readFile(configPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Validate agent configuration.
 * Throws detailed error if validation fails.
 */
function validateConfig(config: unknown): asserts config is AgentConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }

  const c = config as Record<string, unknown>;

  if (!c.agentId || typeof c.agentId !== 'string') {
    throw new Error('agentId is required and must be a string');
  }

  if (!c.role || typeof c.role !== 'string') {
    throw new Error('role is required and must be a string');
  }

  if (!['orchestrator', 'worker'].includes(c.role)) {
    throw new Error('role must be "orchestrator" or "worker"');
  }

  if (!c.brokerUrl || typeof c.brokerUrl !== 'string') {
    throw new Error('brokerUrl is required and must be a string');
  }

  if (!Array.isArray(c.capabilities) || c.capabilities.length === 0) {
    throw new Error('capabilities must be a non-empty array');
  }

  if (typeof c.heartbeatInterval !== 'number' || c.heartbeatInterval < 1000) {
    throw new Error('heartbeatInterval must be a number >= 1000');
  }
}

/**
 * Main entry point for agent runner.
 */
async function main(args: string[]): Promise<void> {
  // Parse CLI arguments
  const configPath = args.find(arg => arg.startsWith('--config='))?.split('=')[1]
    || args[0]
    || 'config/agent.json';

  console.log(`Loading config from: ${configPath}`);

  // Load and validate config
  const config = await loadConfig(configPath);
  validateConfig(config);

  console.log(`Starting agent: ${config.agentId} (${config.role})`);
  console.log(`Capabilities: ${config.capabilities.join(', ')}`);

  // Connect to broker
  const mqttClient = await connectToBroker({
    brokerUrl: config.brokerUrl,
    clientId: config.agentId,
  });

  console.log('Connected to broker');

  // Create and start agent
  const agent = new BasicAgent(config, mqttClient);
  await agent.start();

  console.log('Agent started successfully');
  console.log('Press Ctrl+C to stop');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    await agent.stop();
    await mqttClient.end();
    console.log('Agent stopped');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2)).catch(error => {
    console.error('Agent error:', error);
    process.exit(1);
  });
}

export { main, loadConfig, validateConfig };
