/**
 * Agent Discovery Query Interface
 *
 * Per DISC-02: Minerva can query which agents are available and their capabilities.
 * Per COMM-01: Discovery works across machines via MQTT retained messages.
 *
 * Query functions read retained messages from swarm/agents/# to discover agents.
 */
import type { AgentRegistration, AgentRole } from './types.js';
import type { MqttClientMinimal } from './registry.js';
/**
 * Query all available agents from retained messages.
 *
 * Per DISC-02: Returns array of all registered agents with their capabilities.
 * Per RESEARCH.md Pattern 3: Queries retained messages from swarm/agents/#.
 *
 * @param mqttClient - MQTT client instance
 * @returns Array of agent registrations
 */
export declare function queryAvailableAgents(mqttClient: MqttClientMinimal): Promise<AgentRegistration[]>;
/**
 * Query a specific agent by ID.
 *
 * @param mqttClient - MQTT client instance
 * @param agentId - Agent ID to query
 * @returns Agent registration or null if not found
 */
export declare function getAgentById(mqttClient: MqttClientMinimal, agentId: string): Promise<AgentRegistration | null>;
/**
 * Query agents by role.
 *
 * Per DISC-02: Enables role-based routing for orchestrator vs worker.
 *
 * @param mqttClient - MQTT client instance
 * @param role - Agent role to filter by
 * @returns Array of agent registrations with matching role
 */
export declare function getAgentsByRole(mqttClient: MqttClientMinimal, role: AgentRole): Promise<AgentRegistration[]>;
//# sourceMappingURL=query.d.ts.map