/**
 * Communication module exports
 * Re-exports all communication layer types and functions.
 */
export { MqttClient, connectToBroker } from './mqtt.js';
export type { BrokerConfig, MqttClientEvents, } from './mqtt.js';
export type { MessageType, MessageEnvelope } from './message.js';
export { Topics, Subscriptions } from './topics.js';
export { shouldUseMessagePack, encodeMessage, decodeMessage, getMessageSize, } from './codec.js';
//# sourceMappingURL=index.d.ts.map