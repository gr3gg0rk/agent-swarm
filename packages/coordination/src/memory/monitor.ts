/**
 * Memory Monitor for Continuous Heap Tracking
 *
 * Monitors process memory usage at 5-second intervals with 85% threshold detection.
 * Triggers ThrottleController to pause non-critical tasks when memory pressure is high.
 *
 * Per 04-02-PLAN.md Task 2.
 * Per CONTEXT.md: 85% memory usage threshold for Pi 2B (1GB RAM).
 * Per RESEARCH.md: 5-second polling interval.
 */

import * as v8 from 'node:v8';
import type { ThrottleController } from './throttle.js';
import type { MemoryStats, ThrottleAction, ThrottleConfig } from './types.js';
import { DEFAULT_THROTTLE_CONFIG } from './types.js';

/**
 * Memory Monitor with continuous heap tracking.
 *
 * - Polls process.memoryUsage() every 5 seconds
 * - Calculates usagePercent from V8 heap statistics
 * - Triggers throttle() at 85% threshold
 * - Triggers recover() below 80% threshold
 *
 * Per CONTEXT.md: "Throttle threshold: 85% memory usage (850MB of 1GB)"
 * Per RESEARCH.md: "5-second intervals catch issues before OOM without significant cost"
 */
export class MemoryMonitor {
  private readonly throttleController: ThrottleController;
  private readonly config: ThrottleConfig;
  private checkInterval: NodeJS.Timeout | null = null;

  /**
   * Creates a new MemoryMonitor instance.
   *
   * @param throttleController - ThrottleController for pause/resume actions
   * @param config - Throttle configuration (uses defaults if not provided)
   */
  constructor(
    throttleController: ThrottleController,
    config: Partial<ThrottleConfig> = {}
  ) {
    this.throttleController = throttleController;
    this.config = { ...DEFAULT_THROTTLE_CONFIG, ...config };
  }

  /**
   * Start continuous memory monitoring.
   *
   * Sets up 5-second polling interval that checks memory usage
   * and triggers throttle/recover actions as needed.
   *
   * Per RESEARCH.md: "5-second intervals catch issues before OOM"
   */
  start(): void {
    if (this.checkInterval !== null) {
      console.warn('Memory monitoring already started');
      return;
    }

    this.checkInterval = setInterval(() => {
      this.check().catch(error => {
        console.error('Memory check failed:', error);
      });
    }, this.config.checkIntervalMs);

    console.log(`Memory monitoring started (interval: ${this.config.checkIntervalMs}ms, threshold: ${(this.config.thresholdPercent * 100).toFixed(0)}%)`);
  }

  /**
   * Stop continuous memory monitoring.
   *
   * Clears the polling interval. Does not resume paused tasks -
   * call recover() explicitly if needed.
   */
  stop(): void {
    if (this.checkInterval === null) {
      return;
    }

    clearInterval(this.checkInterval);
    this.checkInterval = null;
    console.log('Memory monitoring stopped');
  }

  /**
   * Check memory usage and trigger appropriate action.
   *
   * 1. Get current memory statistics
   * 2. Determine if throttle or recovery is needed
   * 3. Call throttle() or recover() on controller
   *
   * @private
   */
  private async check(): Promise<void> {
    const stats = this.getMemoryStats();
    const action = this.shouldThrottle(stats);

    switch (action) {
      case 'pause_non_critical':
      case 'pause_all':
        await this.throttleController.throttle(stats);
        break;
      case 'resume':
        await this.throttleController.recover(stats);
        break;
      case 'none':
        // No action needed
        break;
    }
  }

  /**
   * Get current memory statistics from process and V8.
   *
   * Combines process.memoryUsage() with v8.getHeapStatistics()
   * to calculate usagePercent.
   *
   * @returns Memory statistics with usagePercent
   */
  getMemoryStats(): MemoryStats {
    const usage = process.memoryUsage();
    const v8Stats = v8.getHeapStatistics();

    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      rss: usage.rss,
      heapLimit: v8Stats.heap_size_limit,
      usagePercent: usage.heapUsed / v8Stats.heap_size_limit,
    };
  }

  /**
   * Determine if throttling is needed based on memory usage.
   *
   * Returns:
   * - 'pause_non_critical' if usagePercent >= thresholdPercent (85%)
   * - 'resume' if usagePercent < resumeThresholdPercent (80%)
   * - 'none' otherwise (in hysteresis zone)
   *
   * Hysteresis prevents rapid toggle between pause/resume at the boundary.
   *
   * @param stats - Memory statistics
   * @returns Throttle action to take
   */
  private shouldThrottle(stats: MemoryStats): ThrottleAction {
    if (stats.usagePercent >= this.config.thresholdPercent) {
      // Memory at or above threshold - pause non-critical tasks
      return 'pause_non_critical';
    }
    if (stats.usagePercent < this.config.resumeThresholdPercent) {
      // Memory below resume threshold - can resume paused tasks
      return 'resume';
    }
    // In hysteresis zone (80-85%) - no change
    return 'none';
  }

  /**
   * Get current throttle configuration.
   *
   * Useful for testing and monitoring.
   *
   * @returns Throttle configuration
   */
  getConfig(): ThrottleConfig {
    return { ...this.config };
  }

  /**
   * Check if monitoring is currently active.
   *
   * @returns True if monitoring is started
   */
  isMonitoring(): boolean {
    return this.checkInterval !== null;
  }
}

/**
 * Factory function to create MemoryMonitor instance.
 *
 * @param throttleController - ThrottleController for pause/resume actions
 * @param config - Optional throttle configuration
 * @returns MemoryMonitor instance
 */
export function createMemoryMonitor(
  throttleController: ThrottleController,
  config?: Partial<ThrottleConfig>
): MemoryMonitor {
  return new MemoryMonitor(throttleController, config);
}
