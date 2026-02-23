/**
 * Optimization configuration module with environment variable loading.
 *
 * Per Phase 11: Opt-In Feature Activation
 * Provides environment-based feature flags for MessageBatcher and ConnectionPoolManager.
 * Production-safe defaults: both optimizations enabled by default.
 *
 * Environment Variables:
 * - SWARM_BATCHING_ENABLED: Enable message batching (default: true)
 * - SWARM_POOLING_ENABLED: Enable connection pooling (default: true)
 */

import type { BatchConfig } from './batcher.js';

/**
 * Optimization configuration interface.
 * Controls which optimization features are enabled.
 */
export interface OptimizationConfig {
  /** Enable message batching for high-frequency messages (default: true) */
  batchingEnabled: boolean;
  /** Enable connection pooling for MQTT connections (default: true) */
  poolingEnabled: boolean;
  /** Optional custom batch configuration (uses DEFAULT_BATCH_CONFIG if not provided) */
  batchConfig?: BatchConfig;
}

/**
 * Loads optimization configuration from environment variables.
 *
 * Defaults (production-safe):
 * - batchingEnabled: true (unless SWARM_BATCHING_ENABLED='false')
 * - poolingEnabled: true (unless SWARM_POOLING_ENABLED='false')
 *
 * To disable optimizations for debugging:
 * ```bash
 * export SWARM_BATCHING_ENABLED=false
 * export SWARM_POOLING_ENABLED=false
 * ```
 *
 * @returns OptimizationConfig with parsed boolean values
 */
export function loadOptimizationConfig(): OptimizationConfig {
  return {
    batchingEnabled: process.env.SWARM_BATCHING_ENABLED !== 'false',
    poolingEnabled: process.env.SWARM_POOLING_ENABLED !== 'false',
  };
}
