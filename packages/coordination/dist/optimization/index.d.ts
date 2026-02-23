/**
 * Optimization module exports.
 *
 * Provides connection pooling, message batching, and context reference passing
 * optimizations for the OpenClaw Swarm coordination layer.
 */
export { MqttConnectionPool, ConnectionPoolManager, PoolConfig, HardwareProfile, detectHardwareProfile, HARDWARE_PROFILES } from './connection-pool.js';
export { MessageBatcher, BatchConfig, DEFAULT_BATCH_CONFIG } from './batcher.js';
export { ContextManager, ContextReference, ContextOptions, prepareMessagePayload, resolveMessagePayload } from './context-manager.js';
//# sourceMappingURL=index.d.ts.map