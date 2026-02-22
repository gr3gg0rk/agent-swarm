/**
 * Discovery module exports
 * Re-exports all discovery layer types and functions.
 */
export type { AgentRegistration, AgentRole } from './types.js';
export { AgentDiscovery, loadAgentConfig, createAgentDiscovery, type MqttClientMinimal, } from './registry.js';
export { queryAvailableAgents, getAgentById, getAgentsByRole, } from './query.js';
export type { MessageEnvelope, MessageType } from '../communication/message.js';
export { Topics, Subscriptions } from '../communication/topics.js';
//# sourceMappingURL=index.d.ts.map