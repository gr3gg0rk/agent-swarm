/**
 * Memory Management Types
 *
 * Defines types for memory monitoring, throttling, and graceful degradation
 * on constrained hardware (Pi 2B, 1GB RAM).
 *
 * Per 04-02-PLAN.md Task 2.
 * Per CONTEXT.md: 85% memory usage threshold, pause non-critical tasks.
 */

/**
 * Memory statistics from process.memoryUsage() and V8 heap statistics.
 *
 * Used by MemoryMonitor to track heap usage and trigger throttling.
 */
export interface MemoryStats {
  /** Current heap used in bytes */
  heapUsed: number;
  /** Total heap size in bytes */
  heapTotal: number;
  /** Resident Set Size (total process memory) in bytes */
  rss: number;
  /** V8 heap size limit in bytes */
  heapLimit: number;
  /** Heap usage as percentage (0-1, heapUsed / heapLimit) */
  usagePercent: number;
}

/**
 * Throttle action to take based on memory pressure.
 *
 * Per CONTEXT.md: Pause in-progress tasks to free memory, resume when pressure decreases.
 */
export type ThrottleAction =
  /** No action needed - memory within acceptable range */
  | 'none'
  /** Pause tasks with priority < 100 (non-critical) */
  | 'pause_non_critical'
  /** Pause all tasks (critical memory pressure - system stability at risk) */
  | 'pause_all'
  /** Resume paused tasks (memory recovered) */
  | 'resume';

/**
 * Throttle configuration for memory monitoring.
 *
 * Per CONTEXT.md: 85% memory usage threshold, 80% resume threshold.
 * Per RESEARCH.md: 5-second polling interval.
 */
export interface ThrottleConfig {
  /** Throttle threshold as percentage (default: 0.85 = 85%) */
  thresholdPercent: number;
  /** Resume threshold as percentage (default: 0.80 = 80%) */
  resumeThresholdPercent: number;
  /** Check interval in milliseconds (default: 5000 = 5 seconds) */
  checkIntervalMs: number;
  /** Priority threshold for critical tasks (default: 100) */
  priorityThreshold: number;
}

/**
 * Default throttle configuration.
 *
 * Per CONTEXT.md: 85% threshold for Pi 2B (1GB RAM).
 */
export const DEFAULT_THROTTLE_CONFIG: ThrottleConfig = {
  thresholdPercent: 0.85,        // 85% = 850MB of 1GB
  resumeThresholdPercent: 0.80,  // 80% = 800MB of 1GB
  checkIntervalMs: 5000,         // 5 seconds
  priorityThreshold: 100,        // Critical task priority
};
