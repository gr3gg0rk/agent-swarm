/**
 * MQTT client wrapper with auto-reconnect for OpenClaw Swarm coordination layer.
 * Provides reliable message pub/sub with QoS support and MessagePack serialization.
 */

import mqtt, { type Client as MqttClientBase, type IClientOptions } from 'mqtt';
import { EventEmitter3 } from 'eventemitter3';
import { v4 as uuidv4 } from 'uuid';
import { MessagePack } from 'msgpackr';

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
 * Message envelope for all inter-agent communication.
 * Provides correlation, idempotency, and routing metadata.
 */
export interface MessageEnvelope {
  /** Unique message identifier (UUID) */
  messageId: string;
  /** Idempotency key for deduplicating re-deliveries (UUID) */
  idempotencyKey: string;
  /** Optional correlation ID linking responses to requests (UUID) */
  correlationId?: string;
  /** Sender agent ID */
  from: string;
  /** Target agent ID (undefined for broadcast) */
  to?: string;
  /** Message type */
  type: MessageType;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Message payload (MessagePack or JSON) */
  payload: unknown;
  /** Override default QoS level */
  qos?: 0 | 1;
  /** Whether message should be retained */
  retain?: boolean;
}

/**
 * Message types for inter-agent communication.
 */
export type MessageType = 'task' | 'result' | 'heartbeat' | 'error' | 'discovery' | 'status';

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
export class MqttClient extends EventEmitter3<MqttClientEvents> {
  private client: MqttClientBase;
  private config: BrokerConfig;

  /**
   * Creates a new MQTT client wrapper.
   * @param config - Broker connection configuration
   */
  private constructor(config: BrokerConfig, client: MqttClientBase) {
    super();
    this.config = config;
    this.client = client;
    this.setupEventListeners();
  }

  /**
   * Connects to the MQTT broker with auto-reconnect enabled.
   * @param config - Broker connection configuration
   * @returns Promise that resolves when connected
   */
  static async connectToBroker(config: BrokerConfig): Promise<MqttClient> {
    return new Promise((resolve, reject) => {
      const options: IClientOptions = {
        clientId: config.clientId,
        clean: true,
        connectTimeout: 4000,
        reconnectPeriod: 1000,
        qos: 1,
        ...(config.username && { username: config.username }),
        ...(config.password && { password: config.password }),
      };

      const client = mqtt.connect(config.brokerUrl, options);

      // Wait for 'connect' event
      client.on('connect', () => {
        const mqttClient = new MqttClient(config, client);
        mqttClient.emit('connect');
        resolve(mqttClient);
      });

      client.on('error', (error) => {
        reject(new Error(`MQTT connection failed: ${error.message}`));
      });
    });
  }

  /**
   * Sets up event listeners on the underlying MQTT client.
   */
  private setupEventListeners(): void {
    this.client.on('error', (error) => {
      this.emit('error', error);
    });

    this.client.on('reconnect', () => {
      this.emit('reconnect');
    });

    this.client.on('close', () => {
      this.emit('close');
    });

    this.client.on('message', (topic: string, message: Buffer) => {
      try {
        const envelope = MessagePack.decode(message) as MessageEnvelope;
        this.emit('message', envelope, topic);
      } catch (error) {
        this.emit('error', error as Error);
      }
    });
  }

  /**
   * Publishes a message to a topic.
   * Uses MessagePack encoding for payloads >1KB per HARD-05.
   * @param topic - MQTT topic to publish to
   * @param envelope - Message envelope to publish
   * @returns Promise that resolves when published
   */
  async publish(topic: string, envelope: MessageEnvelope): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Ensure timestamp is set
        if (!envelope.timestamp) {
          envelope.timestamp = Date.now();
        }

        // Ensure messageId and idempotencyKey are set
        if (!envelope.messageId) {
          envelope.messageId = uuidv4();
        }
        if (!envelope.idempotencyKey) {
          envelope.idempotencyKey = uuidv4();
        }

        // Serialize with MessagePack
        const payload = MessagePack.encode(envelope);

        // Determine QoS level (default 1, allow 0 for heartbeats per COMM-07)
        const qos = envelope.qos ?? 1;
        const retain = envelope.retain ?? false;

        this.client.publish(topic, payload, { qos, retain }, (error) => {
          if (error) {
            reject(new Error(`Publish failed: ${error.message}`));
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribes to a topic.
   * @param topic - MQTT topic to subscribe to
   * @param qos - QoS level for subscription (default 1)
   * @returns Promise that resolves when subscribed
   */
  async subscribe(topic: string, qos: 0 | 1 = 1): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.subscribe(topic, { qos }, (error) => {
        if (error) {
          reject(new Error(`Subscription failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribes from a topic.
   * @param topic - MQTT topic to unsubscribe from
   * @returns Promise that resolves when unsubscribed
   */
  async unsubscribe(topic: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.unsubscribe(topic, (error) => {
        if (error) {
          reject(new Error(`Unsubscribe failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Gracefully disconnects from the broker.
   * @returns Promise that resolves when disconnected
   */
  async end(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.end(false, {}, (error) => {
        if (error) {
          reject(new Error(`Disconnect failed: ${error.message}`));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Gets the underlying MQTT client instance.
   * Use for advanced operations not exposed by this wrapper.
   */
  getRawClient(): MqttClientBase {
    return this.client;
  }
}

/**
 * Convenience function to connect to the MQTT broker.
 * @param config - Broker connection configuration
 * @returns Promise that resolves to connected MqttClient
 */
export async function connectToBroker(config: BrokerConfig): Promise<MqttClient> {
  return MqttClient.connectToBroker(config);
}

// Re-export types and utilities for convenience
export type { BrokerConfig, MessageEnvelope, MessageType, MqttClientEvents };
