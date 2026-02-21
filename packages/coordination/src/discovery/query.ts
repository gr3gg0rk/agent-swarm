/**
 * Agent Discovery Query Interface
 *
 * Per DISC-02: Minerva can query which agents are available and their capabilities.
 * Per COMM-01: Discovery works across machines via MQTT retained messages.
 *
 * Query functions read retained messages from swarm/agents/# to discover agents.
 */

import type { AgentRegistration, AgentRole } from './types.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope, MqttClient } from './registry.js';

/**
 * Query all available agents from retained messages.
 *
 * Per DISC-02: Returns array of all registered agents with their capabilities.
 * Per RESEARCH.md Pattern 3: Queries retained messages from swarm/agents/#.
 *
 * @param mqttClient - MQTT client instance
 * @returns Array of agent registrations
 */
export async function queryAvailableAgents(
  mqttClient: MqttClient
): Promise<AgentRegistration[]> {
  if (!mqttClient.getRetainedMessages) {
    throw new Error('MQTT client does not support retained message queries');
  }

  // Query all retained messages from swarm/agents/#
  const messages = await mqttClient.getRetainedMessages('swarm/agents/#');

  // Parse messages and filter for discovery type
  const agents: AgentRegistration[] = [];

  for (const payload of messages) {
    if (payload.length === 0) continue; // Skip empty (cleared) messages

    try {
      // Parse JSON (MessagePack for >1KB per HARD-05)
      const envelope = JSON.parse(payload.toString()) as MessageEnvelope;

      // Filter for discovery messages
      if (envelope.type === 'discovery') {
        agents.push(envelope.payload as AgentRegistration);
      }
    } catch (error) {
      console.error('Failed to parse agent registration:', error);
    }
  }

  return agents;
}

/**
 * Query a specific agent by ID.
 *
 * @param mqttClient - MQTT client instance
 * @param agentId - Agent ID to query
 * @returns Agent registration or null if not found
 */
export async function getAgentById(
  mqttClient: MqttClient,
  agentId: string
): Promise<AgentRegistration | null> {
  if (!mqttClient.getRetainedMessages) {
    throw new Error('MQTT client does not support retained message queries');
  }

  const topic = Topics.agentDiscovery(agentId);
  const messages = await mqttClient.getRetainedMessages(topic);

  if (messages.length === 0 || messages[0].length === 0) {
    return null;
  }

  try {
    const envelope = JSON.parse(messages[0].toString()) as MessageEnvelope;
    if (envelope.type === 'discovery') {
      return envelope.payload as AgentRegistration;
    }
  } catch (error) {
    console.error('Failed to parse agent registration:', error);
  }

  return null;
}

/**
 * Query agents by role.
 *
 * Per DISC-02: Enables role-based routing for orchestrator vs worker.
 *
 * @param mqttClient - MQTT client instance
 * @param role - Agent role to filter by
 * @returns Array of agent registrations with matching role
 */
export async function getAgentsByRole(
  mqttClient: MqttClient,
  role: AgentRole
): Promise<AgentRegistration[]> {
  const allAgents = await queryAvailableAgents(mqttClient);
  return allAgents.filter(agent => agent.role === role);
}
