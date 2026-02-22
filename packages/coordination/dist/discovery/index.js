/**
 * Discovery module exports
 * Re-exports all discovery layer types and functions.
 */
// Registry
export { AgentDiscovery, loadAgentConfig, createAgentDiscovery, } from './registry.js';
// Query
export { queryAvailableAgents, getAgentById, getAgentsByRole, } from './query.js';
export { Topics, Subscriptions } from '../communication/topics.js';
//# sourceMappingURL=index.js.map