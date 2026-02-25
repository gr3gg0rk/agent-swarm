/**
 * MQTT client wrapper with auto-reconnect for OpenClaw Swarm coordination layer.
 * Provides reliable message pub/sub with QoS support and MessagePack serialization.
 */
import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { pack, unpack } from 'msgpackr';
/**
 * MQTT client wrapper with auto-reconnect and MessagePack serialization.
 * Wraps MQTT.js client instance with typed events and serialization.
 */
export class MqttClient {
    client;
    config;
    emitter;
    /** Optional message batcher for high-frequency messages (07-01) */
    batchPublisher;
    /** Optional connection pool for reusing connections (07-02) */
    connectionPool;
    /** Operation ID for connection pool tracking (07-02) */
    poolOperationId;
    /**
     * Creates a new MQTT client wrapper.
     * @param config - Broker connection configuration
     */
    constructor(config, client) {
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
    static async connectToBroker(config) {
        return new Promise((resolve, reject) => {
            const options = {
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
            client.on('error', (error) => {
                const message = `MQTT connection failed: ${error.message}

Fix: Start Mosquitto broker:
  systemctl: sudo systemctl start mosquitto
  Docker:     docker run -p 1883:1883 eclipse-mosquitto

Verify: mosquitto_sub -h localhost -t '$SYS/#' -v

Common causes:
  - Broker not running on ${config.brokerUrl}
  - Wrong hostname or port in brokerUrl
  - Firewall blocking connection
`;
                reject(new Error(message));
            });
        });
    }
    /**
     * Sets up event listeners on the underlying MQTT client.
     */
    setupEventListeners() {
        this.client.on('error', (error) => {
            this.emitter.emit('error', error);
        });
        this.client.on('reconnect', () => {
            this.emitter.emit('reconnect');
        });
        this.client.on('close', () => {
            this.emitter.emit('close');
        });
        this.client.on('message', (topic, message) => {
            try {
                const envelope = unpack(message);
                this.emitter.emit('message', envelope, topic);
            }
            catch (error) {
                this.emitter.emit('error', error);
            }
        });
    }
    /**
     * Registers an event listener.
     * @param event - Event name
     * @param listener - Event listener
     */
    on(event, listener) {
        this.emitter.on(event, listener);
    }
    /**
     * Removes an event listener.
     * @param event - Event name
     * @param listener - Event listener
     */
    off(event, listener) {
        this.emitter.off(event, listener);
    }
    /**
     * Sets the message batcher for high-frequency message batching (07-01).
     * When set, the batcher will buffer progress, status, and heartbeat messages
     * and publish them in batches for improved throughput.
     *
     * @param batcher - MessageBatcher instance (optional)
     */
    setBatchPublisher(batcher) {
        this.batchPublisher = batcher;
    }
    /**
     * Gets the current message batcher if set.
     * @returns MessageBatcher instance or undefined
     */
    getBatchPublisher() {
        return this.batchPublisher;
    }
    /**
     * Sets the connection pool for reusing MQTT connections (07-02).
     * When set, connections are acquired from and released to the pool.
     * Note: Connection pooling is opt-in and doesn't affect existing behavior when not set.
     *
     * @param pool - ConnectionPoolManager instance (optional)
     */
    setConnectionPool(pool) {
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
    getConnectionPool() {
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
    async publish(topic, envelope) {
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
                this.client.publish(topic, payload, { qos, retain }, (error) => {
                    if (error) {
                        reject(new Error(`MQTT publish failed to ${topic}: ${error.message}

Fix: Check broker connection:
  1. Verify broker is running: mosquitto_sub -h ${this.config.brokerUrl.split('://')[1]?.split(':')[0] || 'localhost'} -t '$SYS/broker/version' -v
  2. Check topic permissions: Topic may not allow publish
  3. Verify QoS level: Some brokers restrict QoS 2
`));
                    }
                    else {
                        resolve();
                    }
                });
            }
            catch (error) {
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
    async subscribe(topic, qos = 1) {
        return new Promise((resolve, reject) => {
            this.client.subscribe(topic, { qos }, (error) => {
                if (error) {
                    reject(new Error(`MQTT subscribe failed for ${topic}: ${error.message}

Fix: Check broker connection:
  1. Verify broker is running: mosquitto_sub -h localhost -t '$SYS/#' -v
  2. Check topic permissions: Topic may require authentication
  3. Verify topic name format: Use wildcards like agent/# for multi-level
`));
                }
                else {
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
    async unsubscribe(topic) {
        return new Promise((resolve, reject) => {
            this.client.unsubscribe(topic, (error) => {
                if (error) {
                    reject(new Error('Unsubscribe failed: ' + error.message));
                }
                else {
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
    async end() {
        // Flush batcher before disconnect to avoid losing messages
        if (this.batchPublisher) {
            await this.batchPublisher.stop();
        }
        // Release connection back to pool if using connection pooling
        if (this.connectionPool && this.poolOperationId) {
            await this.connectionPool.releaseConnection(this.poolOperationId);
        }
        return new Promise((resolve, reject) => {
            this.client.end(false, {}, (error) => {
                if (error) {
                    reject(new Error('Disconnect failed: ' + error.message));
                }
                else {
                    resolve();
                }
            });
        });
    }
    /**
     * Gets the underlying MQTT client instance.
     * Use for advanced operations not exposed by this wrapper.
     */
    getRawClient() {
        return this.client;
    }
}
/**
 * Convenience function to connect to the MQTT broker.
 * @param config - Broker connection configuration
 * @returns Promise that resolves to connected MqttClient
 */
export async function connectToBroker(config) {
    return MqttClient.connectToBroker(config);
}
//# sourceMappingURL=mqtt.js.map