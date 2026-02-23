/**
 * Optimization module exports.
 *
 * Provides connection pooling and message batching optimizations for
 * the OpenClaw Swarm coordination layer.
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
