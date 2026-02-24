/**
 * Agent Discovery Registry
 *
 * Per RESEARCH.md Pattern 3: Agent discovery using retained MQTT messages.
 * Agents register themselves on startup with ID, role, and capabilities (DISC-01).
 * Registration is persisted in retained MQTT messages for crash recovery (DISC-03).
 * Duplicate agent IDs are rejected - new agent fails to start (CONTEXT.md locked decision).
 */

import type { AgentRegistration, AgentRole } from './types.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope } from '../communication/message.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Static agent configuration entry.
 */
interface AgentConfig {
  agentId: string;
  hostname: string;
  role: AgentRole;
  capabilities?: string[];
}

/**
 * Loaded static configuration for agent validation (DISC-05).
 */
let knownAgents: AgentConfig[] = [];

/**
 * Load static agent configuration.
 * Called during initialization to populate known agents list.
 */
export async function loadAgentConfig(configPath: string): Promise<void> {
  try {
    // Dynamic import to avoid requiring yaml as a dependency
    const fs = await import('node:fs/promises');
    const content = await fs.readFile(configPath, 'utf-8');

    // Simple YAML parser for our specific structure
    // Lines starting with "-" are agent entries
    const lines = content.split('\n');
    const agents: AgentConfig[] = [];
    let currentAgent: Partial<AgentConfig> = {};

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '' || trimmed === 'agents:') {
        continue;
      }

      // Agent entry start
      if (trimmed.startsWith('- agentId:')) {
        if (currentAgent.agentId) {
          agents.push(currentAgent as AgentConfig);
        }
        currentAgent = { agentId: trimmed.split(':')[1].trim() };
      }
      // Hostname
      else if (trimmed.startsWith('hostname:')) {
        currentAgent.hostname = trimmed.split(':')[1].trim();
      }
      // Role
      else if (trimmed.startsWith('role:')) {
        currentAgent.role = trimmed.split(':')[1].trim() as AgentRole;
      }
    }

    // Add last agent
    if (currentAgent.agentId) {
      agents.push(currentAgent as AgentConfig);
    }

    knownAgents = agents;
  } catch (error) {
    console.error('Failed to load agent configuration:', error);
    throw new Error(`Agent configuration not found at ${configPath}`);
  }
}

/**
 * Validate agent ID against static configuration (DISC-05).
 * Throws error if agent ID is not in known agents list.
 * Skips validation if no known agents configured (defaults mode).
 */
function validateAgentId(agentId: string): void {
  // Skip validation if no known agents configured (defaults mode)
  if (knownAgents.length === 0) {
    return;
  }

  const known = knownAgents.find(a => a.agentId === agentId);
  if (!known) {
    throw new Error(
      `Unknown agent ID "${agentId}". Must be one of: ${knownAgents.map(a => a.agentId).join(', ')}`
    );
  }
}

/**
 * MQTT Client interface (minimal for registry operations).
 * This matches the MQTT.js Client interface used in plan 01-01.
 *
 * Note: Renamed from MqttClient to avoid collision with communication/mqtt.ts MqttClient class.
 * This interface defines the subset of MQTT client methods used by the discovery layer.
 */
export interface MqttClientMinimal {
  /**
   * Publish a message to a topic.
   * @param topic - MQTT topic
   * @param payload - Message payload (Buffer or string)
   * @param options - Publish options (qos, retain)
   */
  publish(
    topic: string,
    payload: Buffer | string,
    options?: { qos: 0 | 1; retain: boolean }
  ): Promise<void>;

  /**
   * Subscribe to a topic.
   * @param topic - MQTT topic or pattern
   * @param options - Subscribe options (qos)
   */
  subscribe(
    topic: string,
    options?: { qos: 0 | 1 }
  ): Promise<void>;

  /**
   * Gracefully disconnect from the broker.
   * @returns Promise that resolves when disconnected
   */
  end(): Promise<void>;

  /**
   * Query retained messages for a topic pattern.
   * Returns array of retained message payloads.
   * Note: This is a simplified interface - actual implementation
   * may use Mosquitto's $SYS topics or subscription cache.
   */
  getRetainedMessages?(topic: string): Promise<Buffer[]>;
}

/**
 * Agent discovery registry using MQTT retained messages.
 *
 * Per RESEARCH.md Pattern 3:
 * - registerAgent: Publishes retained message to swarm/agents/{agentId}
 * - unregisterAgent: Clears retained message by publishing empty payload
 * - Duplicate detection: Checks if topic already has retained message
 */
export class AgentDiscovery {
  private mqtt: MqttClientMinimal;

  constructor(mqttClient: MqttClientMinimal) {
    this.mqtt = mqttClient;
  }

  /**
   * Register an agent with the swarm.
   *
   * Per DISC-01: Agent registers with ID, role, and capabilities.
   * Per DISC-03: Registration persists via retained MQTT messages.
   * Per CONTEXT.md: Duplicate agent IDs are rejected - new agent fails to start.
   *
   * @param registration - Agent registration information
   * @throws Error if agent ID is unknown (DISC-05) or duplicate detected
   */
  async registerAgent(registration: AgentRegistration): Promise<void> {
    // Validate agent ID against static config (DISC-05)
    validateAgentId(registration.agentId);

    const topic = Topics.agentDiscovery(registration.agentId);

    // Check for duplicate by querying existing retained message
    if (this.mqtt.getRetainedMessages) {
      const existing = await this.mqtt.getRetainedMessages(topic);
      if (existing.length > 0 && existing[0].length > 0) {
        throw new Error(
          `Duplicate agent ID "${registration.agentId}". Agent already registered.`
        );
      }
    }

    // Create message envelope per RESEARCH.md Pattern 1
    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: registration.agentId,
      type: 'discovery',
      timestamp: Date.now(),
      payload: registration,
    };

    // Serialize payload as JSON (MessagePack for >1KB per HARD-05)
    const payload = JSON.stringify(envelope);

    // Publish with retain: true for crash recovery (DISC-03)
    await this.mqtt.publish(topic, payload, { qos: 1, retain: true });
  }

  /**
   * Unregister an agent from the swarm.
   *
   * Clears the retained message by publishing empty payload with retain: true.
   * Called on graceful shutdown.
   *
   * @param agentId - Agent ID to unregister
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const topic = Topics.agentDiscovery(agentId);

    // Publish empty payload to clear retained message
    await this.mqtt.publish(topic, Buffer.alloc(0), { qos: 1, retain: true });
  }
}

/**
 * Convenience function to create AgentDiscovery instance.
 * Loads config and initializes registry.
 *
 * Per SETUP-05: Agent registry loads automatically with sensible defaults
 * when no config provided, avoiding required configuration files.
 *
 * @param mqttClient - MQTT client instance
 * @param configPath - Optional path to agent configuration file
 * @returns AgentDiscovery instance
 */
export async function createAgentDiscovery(
  mqttClient: MqttClientMinimal,
  configPath?: string
): Promise<AgentDiscovery> {
  // If no config path, use defaults instead of loading file
  if (!configPath) {
    console.log('[AgentDiscovery] No agent config provided, using default registry behavior');
    knownAgents = []; // Empty list disables validation
    return new AgentDiscovery(mqttClient);
  }

  // Existing behavior: load config file
  await loadAgentConfig(configPath);
  return new AgentDiscovery(mqttClient);
}
