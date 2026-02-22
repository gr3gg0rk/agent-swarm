/**
 * Communication module exports
 * Re-exports all communication layer types and functions.
 */
// MQTT client and connection
export { MqttClient, connectToBroker } from './mqtt.js';
// Topic hierarchy and subscriptions
export { Topics, Subscriptions } from './topics.js';
// Message codec
export { shouldUseMessagePack, encodeMessage, decodeMessage, getMessageSize, } from './codec.js';
//# sourceMappingURL=index.js.map