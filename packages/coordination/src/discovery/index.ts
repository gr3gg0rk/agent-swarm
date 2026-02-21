/**
 * Discovery module exports
 * Re-exports all discovery layer types and functions.
 */

// Types
export type { AgentRegistration, AgentRole } from './types.js';

// Registry
export {
  AgentDiscovery,
  loadAgentConfig,
  createAgentDiscovery,
  type MqttClientMinimal,
} from './registry.js';

// Query
export {
  queryAvailableAgents,
  getAgentById,
  getAgentsByRole,
} from './query.js';

// Re-export from communication for convenience
export type { MessageEnvelope, MessageType } from '../communication/message.js';
export { Topics, Subscriptions } from '../communication/topics.js';
