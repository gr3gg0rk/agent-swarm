/**
 * Communication module exports
 * Re-exports all communication layer types and functions.
 */

// MQTT client and connection
export { MqttClient, connectToBroker } from './mqtt.js';
export type {
  BrokerConfig,
  MqttClientEvents,
} from './mqtt.js';

// Message types (export from message.ts, not mqtt.ts to avoid duplicates)
export type { MessageType, MessageEnvelope } from './message.js';

// Topic hierarchy and subscriptions
export { Topics, Subscriptions } from './topics.js';

// Message codec
export {
  shouldUseMessagePack,
  encodeMessage,
  decodeMessage,
  getMessageSize,
} from './codec.js';
