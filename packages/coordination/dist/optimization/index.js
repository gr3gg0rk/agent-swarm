/**
 * Optimization module exports.
 *
 * Provides connection pooling, message batching, and context reference passing
 * optimizations for the OpenClaw Swarm coordination layer.
 */
// Connection pooling
export { MqttConnectionPool, ConnectionPoolManager, detectHardwareProfile, HARDWARE_PROFILES } from './connection-pool.js';
// Message batching
export { MessageBatcher, DEFAULT_BATCH_CONFIG } from './batcher.js';
// Context reference passing
export { ContextManager, prepareMessagePayload, resolveMessagePayload } from './context-manager.js';
// Configuration
export { loadOptimizationConfig } from './config.js';
//# sourceMappingURL=index.js.map