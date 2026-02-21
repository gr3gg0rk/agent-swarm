/**
 * Communication module exports
 * Re-exports all communication layer types and functions.
 */

// MQTT client and connection
export { MqttClient, connectToBroker } from './mqtt.js';
export type {
  BrokerConfig,
  MessageEnvelope,
  MessageType,
  MqttClientEvents,
} from './mqtt.js';

// Message types
export type { MessageType, MessageEnvelope } from './message.js';

// Topic hierarchy and subscriptions
export { Topics, Subscriptions } from './topics.js';
