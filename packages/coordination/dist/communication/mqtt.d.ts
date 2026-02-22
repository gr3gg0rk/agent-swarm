/**
 * MQTT client wrapper with auto-reconnect for OpenClaw Swarm coordination layer.
 * Provides reliable message pub/sub with QoS support and MessagePack serialization.
 */
import mqtt from 'mqtt';
import type { MessageEnvelope } from './message.js';
type MqttClientInstance = ReturnType<typeof mqtt.connect>;
/**
 * Configuration for connecting to the MQTT broker.
 */
export interface BrokerConfig {
    /** URL of the MQTT broker (e.g., 'mqtt://griak-brain:1883') */
    brokerUrl: string;
    /** Unique client ID for this agent (e.g., 'minerva', 'worker-1') */
    clientId: string;
    /** Optional username for authentication */
    username?: string;
    /** Optional password for authentication */
    password?: string;
}
/**
 * Events emitted by MqttClient.
 */
export interface MqttClientEvents {
    /** Emitted when client connects to broker */
    connect: () => void;
    /** Emitted when client encounters an error */
    error: (error: Error) => void;
    /** Emitted when client reconnects */
    reconnect: () => void;
    /** Emitted when client disconnects */
    close: () => void;
    /** Emitted when a message is received */
    message: (envelope: MessageEnvelope, topic: string) => void;
}
/**
 * MQTT client wrapper with auto-reconnect and MessagePack serialization.
 * Wraps MQTT.js client instance with typed events and serialization.
 */
export declare class MqttClient {
    private client;
    private config;
    private emitter;
    /**
     * Creates a new MQTT client wrapper.
     * @param config - Broker connection configuration
     */
    private constructor();
    /**
     * Connects to the MQTT broker with auto-reconnect enabled.
     * @param config - Broker connection configuration
     * @returns Promise that resolves when connected
     */
    static connectToBroker(config: BrokerConfig): Promise<MqttClient>;
    /**
     * Sets up event listeners on the underlying MQTT client.
     */
    private setupEventListeners;
    /**
     * Registers an event listener.
     * @param event - Event name
     * @param listener - Event listener
     */
    on<K extends keyof MqttClientEvents>(event: K, listener: MqttClientEvents[K]): void;
    /**
     * Removes an event listener.
     * @param event - Event name
     * @param listener - Event listener
     */
    off<K extends keyof MqttClientEvents>(event: K, listener: MqttClientEvents[K]): void;
    /**
     * Publishes a message to a topic.
     * Uses MessagePack encoding for payloads per HARD-05.
     * @param topic - MQTT topic to publish to
     * @param envelope - Message envelope to publish
     * @returns Promise that resolves when published
     */
    publish(topic: string, envelope: MessageEnvelope): Promise<void>;
    /**
     * Subscribes to a topic.
     * @param topic - MQTT topic to subscribe to
     * @param qos - QoS level for subscription (default 1)
     * @returns Promise that resolves when subscribed
     */
    subscribe(topic: string, qos?: 0 | 1): Promise<void>;
    /**
     * Unsubscribes from a topic.
     * @param topic - MQTT topic to unsubscribe from
     * @returns Promise that resolves when unsubscribed
     */
    unsubscribe(topic: string): Promise<void>;
    /**
     * Gracefully disconnects from the broker.
     * @returns Promise that resolves when disconnected
     */
    end(): Promise<void>;
    /**
     * Gets the underlying MQTT client instance.
     * Use for advanced operations not exposed by this wrapper.
     */
    getRawClient(): MqttClientInstance;
}
/**
 * Convenience function to connect to the MQTT broker.
 * @param config - Broker connection configuration
 * @returns Promise that resolves to connected MqttClient
 */
export declare function connectToBroker(config: BrokerConfig): Promise<MqttClient>;
export {};
//# sourceMappingURL=mqtt.d.ts.map