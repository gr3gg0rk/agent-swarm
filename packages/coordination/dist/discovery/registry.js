/**
 * Agent Discovery Registry
 *
 * Per RESEARCH.md Pattern 3: Agent discovery using retained MQTT messages.
 * Agents register themselves on startup with ID, role, and capabilities (DISC-01).
 * Registration is persisted in retained MQTT messages for crash recovery (DISC-03).
 * Duplicate agent IDs are rejected - new agent fails to start (CONTEXT.md locked decision).
 */
import { Topics } from '../communication/topics.js';
import { v4 as uuidv4 } from 'uuid';
/**
 * Loaded static configuration for agent validation (DISC-05).
 */
let knownAgents = [];
/**
 * Load static agent configuration.
 * Called during initialization to populate known agents list.
 */
export async function loadAgentConfig(configPath) {
    try {
        // Dynamic import to avoid requiring yaml as a dependency
        const fs = await import('node:fs/promises');
        const content = await fs.readFile(configPath, 'utf-8');
        // Simple YAML parser for our specific structure
        // Lines starting with "-" are agent entries
        const lines = content.split('\n');
        const agents = [];
        let currentAgent = {};
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip comments and empty lines
            if (trimmed.startsWith('#') || trimmed === '' || trimmed === 'agents:') {
                continue;
            }
            // Agent entry start
            if (trimmed.startsWith('- agentId:')) {
                if (currentAgent.agentId) {
                    agents.push(currentAgent);
                }
                currentAgent = { agentId: trimmed.split(':')[1].trim() };
            }
            // Hostname
            else if (trimmed.startsWith('hostname:')) {
                currentAgent.hostname = trimmed.split(':')[1].trim();
            }
            // Role
            else if (trimmed.startsWith('role:')) {
                currentAgent.role = trimmed.split(':')[1].trim();
            }
        }
        // Add last agent
        if (currentAgent.agentId) {
            agents.push(currentAgent);
        }
        knownAgents = agents;
    }
    catch (error) {
        console.error('Failed to load agent configuration:', error);
        throw new Error(`Agent configuration not found at ${configPath}`);
    }
}
/**
 * Validate agent ID against static configuration (DISC-05).
 * Throws error if agent ID is not in known agents list.
 */
function validateAgentId(agentId) {
    const known = knownAgents.find(a => a.agentId === agentId);
    if (!known) {
        throw new Error(`Unknown agent ID "${agentId}". Must be one of: ${knownAgents.map(a => a.agentId).join(', ')}`);
    }
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
    mqtt;
    constructor(mqttClient) {
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
    async registerAgent(registration) {
        // Validate agent ID against static config (DISC-05)
        validateAgentId(registration.agentId);
        const topic = Topics.agentDiscovery(registration.agentId);
        // Check for duplicate by querying existing retained message
        if (this.mqtt.getRetainedMessages) {
            const existing = await this.mqtt.getRetainedMessages(topic);
            if (existing.length > 0 && existing[0].length > 0) {
                throw new Error(`Duplicate agent ID "${registration.agentId}". Agent already registered.`);
            }
        }
        // Create message envelope per RESEARCH.md Pattern 1
        const envelope = {
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
    async unregisterAgent(agentId) {
        const topic = Topics.agentDiscovery(agentId);
        // Publish empty payload to clear retained message
        await this.mqtt.publish(topic, Buffer.alloc(0), { qos: 1, retain: true });
    }
}
/**
 * Convenience function to create AgentDiscovery instance.
 * Loads config and initializes registry.
 */
export async function createAgentDiscovery(mqttClient, configPath = '/home/gr3gg0rk/openclaw-swarm/config/agents.yaml') {
    await loadAgentConfig(configPath);
    return new AgentDiscovery(mqttClient);
}
//# sourceMappingURL=registry.js.map