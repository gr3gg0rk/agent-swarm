/**
 * Optimization module exports.
 *
 * Provides connection pooling, message batching, and context reference passing
 * optimizations for the OpenClaw Swarm coordination layer.
 */

// Connection pooling
export {
  MqttConnectionPool,
  ConnectionPoolManager,
  PoolConfig,
  HardwareProfile,
  detectHardwareProfile,
  HARDWARE_PROFILES
} from './connection-pool.js';

// Message batching
export {
  MessageBatcher,
  BatchConfig,
  DEFAULT_BATCH_CONFIG
} from './batcher.js';

// Context reference passing
export {
  ContextManager,
  ContextReference,
  ContextOptions,
  prepareMessagePayload,
  resolveMessagePayload
} from './context-manager.js';
