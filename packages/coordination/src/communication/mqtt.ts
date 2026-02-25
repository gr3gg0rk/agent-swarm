/**
 * MQTT client wrapper with auto-reconnect for OpenClaw Swarm coordination layer.
 * Provides reliable message pub/sub with QoS support and MessagePack serialization.
 */

import mqtt, { type IClientOptions } from 'mqtt';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
// @ts-ignore - msgpackr types exist but package.json exports are misconfigured
import { unpack, pack } from 'msgpackr';
import type { MessageEnvelope, MessageType } from './message.js';
import type { MessageBatcher } from '../optimization/batcher.js';
import type { ConnectionPoolManager } from '../optimization/connection-pool.js';

// Type for MQTT Client instance
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
  /** Optional connection pool for reusing MQTT connections (07-02) */
  connectionPool?: ConnectionPoolManager;
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
export class MqttClient {
  private client: MqttClientInstance;
  private config: BrokerConfig;
  private emitter: EventEmitter;
  /** Optional message batcher for high-frequency messages (07-01) */
  private batchPublisher?: MessageBatcher;
  /** Optional connection pool for reusing connections (07-02) */
  private connectionPool?: ConnectionPoolManager;
  /** Operation ID for connection pool tracking (07-02) */
  private poolOperationId?: string;

  /**
   * Creates a new MQTT client wrapper.
   * @param config - Broker connection configuration
   */
  private constructor(config: BrokerConfig, client: MqttClientInstance) {
    this.config = config;
    this.client = client;
    this.connectionPool = config.connectionPool;
    this.emitter = new EventEmitter();
    this.setupEventListeners();

    // Generate operation ID for connection pool tracking
    if (this.connectionPool) {
      this.poolOperationId = `mqtt-${config.clientId}-${Date.now()}`;
    }
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
        ...(config.username && { username: config.username }),
        ...(config.password && { password: config.password }),
      };

      const client = mqtt.connect(config.brokerUrl, options);

      // Wait for 'connect' event
      client.on('connect', () => {
        const mqttClient = new MqttClient(config, client);
        mqttClient.emitter.emit('connect');
        resolve(mqttClient);
      });

      client.on('error', (error: Error) => {
        reject(new Error('MQTT connection failed: ' + error.message));
      });
    });
  }

  /**
   * Sets up event listeners on the underlying MQTT client.
   */
  private setupEventListeners(): void {
    this.client.on('error', (error: Error) => {
      this.emitter.emit('error', error);
    });

    this.client.on('reconnect', () => {
      this.emitter.emit('reconnect');
    });

    this.client.on('close', () => {
      this.emitter.emit('close');
    });

    this.client.on('message', (topic: string, message: Buffer) => {
      try {
        const envelope = unpack(message) as MessageEnvelope;
        this.emitter.emit('message', envelope, topic);
      } catch (error) {
        this.emitter.emit('error', error as Error);
      }
    });
  }

  /**
   * Registers an event listener.
   * @param event - Event name
   * @param listener - Event listener
   */
  on<K extends keyof MqttClientEvents>(event: K, listener: MqttClientEvents[K]): void {
    this.emitter.on(event, listener);
  }

  /**
   * Removes an event listener.
   * @param event - Event name
   * @param listener - Event listener
   */
  off<K extends keyof MqttClientEvents>(event: K, listener: MqttClientEvents[K]): void {
    this.emitter.off(event, listener);
  }

  /**
   * Sets the message batcher for high-frequency message batching (07-01).
   * When set, the batcher will buffer progress, status, and heartbeat messages
   * and publish them in batches for improved throughput.
   *
   * @param batcher - MessageBatcher instance (optional)
   */
  setBatchPublisher(batcher: MessageBatcher | undefined): void {
    this.batchPublisher = batcher;
  }

  /**
   * Gets the current message batcher if set.
   * @returns MessageBatcher instance or undefined
   */
  getBatchPublisher(): MessageBatcher | undefined {
    return this.batchPublisher;
  }

  /**
   * Sets the connection pool for reusing MQTT connections (07-02).
   * When set, connections are acquired from and released to the pool.
   * Note: Connection pooling is opt-in and doesn't affect existing behavior when not set.
   *
   * @param pool - ConnectionPoolManager instance (optional)
   */
  setConnectionPool(pool: ConnectionPoolManager | undefined): void {
    this.connectionPool = pool;
    // Update operation ID when pool is set
    if (pool) {
      this.poolOperationId = `mqtt-${this.config.clientId}-${Date.now()}`;
    }
  }

  /**
   * Gets the current connection pool if set.
   * @returns ConnectionPoolManager instance or undefined
   */
  getConnectionPool(): ConnectionPoolManager | undefined {
    return this.connectionPool;
  }

  /**
   * Publishes a message to a topic.
   * Uses MessagePack encoding for payloads per HARD-05.
   * When batchPublisher is set, high-frequency messages are batched for throughput (07-01).
   * @param topic - MQTT topic to publish to
   * @param envelope - Message envelope to publish
   * @returns Promise that resolves when published
   */
  async publish(topic: string, envelope: MessageEnvelope): Promise<void> {
    // Use batcher if available for high-frequency messages (07-01)
    if (this.batchPublisher) {
      return this.batchPublisher.publish(topic, envelope);
    }

    // Direct publish path (original behavior)
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
        const payload = pack(envelope);

        // Determine QoS level (default 1, allow 0 for heartbeats per COMM-07)
        const qos = envelope.qos ?? 1;
        const retain = envelope.retain ?? false;

        this.client.publish(topic, payload, { qos, retain }, (error: Error | undefined) => {
          if (error) {
            reject(new Error('Publish failed: ' + error.message));
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
      this.client.subscribe(topic, { qos }, (error: Error | null) => {
        if (error) {
          reject(new Error('Subscription failed: ' + error.message));
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
      this.client.unsubscribe(topic, (error: Error | undefined) => {
        if (error) {
          reject(new Error('Unsubscribe failed: ' + error.message));
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Gracefully disconnects from the broker.
   * Flushes batcher if set before disconnecting (07-01).
   * Releases connection back to pool if using connection pooling (07-02).
   * @returns Promise that resolves when disconnected
   */
  async end(): Promise<void> {
    // Flush batcher before disconnect to avoid losing messages
    if (this.batchPublisher) {
      await this.batchPublisher.stop();
    }

    // Release connection back to pool if using connection pooling
    if (this.connectionPool && this.poolOperationId) {
      await this.connectionPool.releaseConnection(this.poolOperationId);
    }

    return new Promise((resolve, reject) => {
      this.client.end(false, {}, (error: Error | undefined) => {
        if (error) {
          reject(new Error('Disconnect failed: ' + error.message));
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
  getRawClient(): MqttClientInstance {
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
