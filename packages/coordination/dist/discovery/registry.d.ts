/**
 * Agent Discovery Registry
 *
 * Per RESEARCH.md Pattern 3: Agent discovery using retained MQTT messages.
 * Agents register themselves on startup with ID, role, and capabilities (DISC-01).
 * Registration is persisted in retained MQTT messages for crash recovery (DISC-03).
 * Duplicate agent IDs are rejected - new agent fails to start (CONTEXT.md locked decision).
 */
import type { AgentRegistration } from './types.js';
import type { MessageEnvelope } from '../communication/message.js';
/**
 * Load static agent configuration.
 * Called during initialization to populate known agents list.
 */
export declare function loadAgentConfig(configPath: string): Promise<void>;
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
     * Supports MessageEnvelope objects (auto-serialized), Buffer, or string payloads.
     * @param topic - MQTT topic
     * @param payload - Message payload (envelope, Buffer, or string)
     * @param options - Publish options (qos, retain)
     */
    publish(topic: string, payload: MessageEnvelope | Buffer | string, options?: {
        qos: 0 | 1;
        retain: boolean;
    }): Promise<void>;
    /**
     * Subscribe to a topic.
     * @param topic - MQTT topic or pattern
     * @param options - Subscribe options (qos)
     */
    subscribe(topic: string, options?: {
        qos: 0 | 1;
    }): Promise<void>;
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
export declare class AgentDiscovery {
    private mqtt;
    constructor(mqttClient: MqttClientMinimal);
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
    registerAgent(registration: AgentRegistration): Promise<void>;
    /**
     * Unregister an agent from the swarm.
     *
     * Clears the retained message by publishing empty payload with retain: true.
     * Called on graceful shutdown.
     *
     * @param agentId - Agent ID to unregister
     */
    unregisterAgent(agentId: string): Promise<void>;
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
export declare function createAgentDiscovery(mqttClient: MqttClientMinimal, configPath?: string): Promise<AgentDiscovery>;
//# sourceMappingURL=registry.d.ts.map