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
import type { ThrottleController } from './throttle.js';
import type { MemoryStats, ThrottleConfig } from './types.js';
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
export declare class MemoryMonitor {
    private readonly throttleController;
    private readonly config;
    private checkInterval;
    /**
     * Creates a new MemoryMonitor instance.
     *
     * @param throttleController - ThrottleController for pause/resume actions
     * @param config - Throttle configuration (uses defaults if not provided)
     */
    constructor(throttleController: ThrottleController, config?: Partial<ThrottleConfig>);
    /**
     * Start continuous memory monitoring.
     *
     * Sets up 5-second polling interval that checks memory usage
     * and triggers throttle/recover actions as needed.
     *
     * Per RESEARCH.md: "5-second intervals catch issues before OOM"
     */
    start(): void;
    /**
     * Stop continuous memory monitoring.
     *
     * Clears the polling interval. Does not resume paused tasks -
     * call recover() explicitly if needed.
     */
    stop(): void;
    /**
     * Check memory usage and trigger appropriate action.
     *
     * 1. Get current memory statistics
     * 2. Determine if throttle or recovery is needed
     * 3. Call throttle() or recover() on controller
     *
     * @private
     */
    private check;
    /**
     * Get current memory statistics from process and V8.
     *
     * Combines process.memoryUsage() with v8.getHeapStatistics()
     * to calculate usagePercent.
     *
     * @returns Memory statistics with usagePercent
     */
    getMemoryStats(): MemoryStats;
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
    private shouldThrottle;
    /**
     * Get current throttle configuration.
     *
     * Useful for testing and monitoring.
     *
     * @returns Throttle configuration
     */
    getConfig(): ThrottleConfig;
    /**
     * Check if monitoring is currently active.
     *
     * @returns True if monitoring is started
     */
    isMonitoring(): boolean;
}
/**
 * Factory function to create MemoryMonitor instance.
 *
 * @param throttleController - ThrottleController for pause/resume actions
 * @param config - Optional throttle configuration
 * @returns MemoryMonitor instance
 */
export declare function createMemoryMonitor(throttleController: ThrottleController, config?: Partial<ThrottleConfig>): MemoryMonitor;
//# sourceMappingURL=monitor.d.ts.map