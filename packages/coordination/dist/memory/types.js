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
 * Default throttle configuration.
 *
 * Per CONTEXT.md: 85% threshold for Pi 2B (1GB RAM).
 */
export const DEFAULT_THROTTLE_CONFIG = {
    thresholdPercent: 0.85, // 85% = 850MB of 1GB
    resumeThresholdPercent: 0.80, // 80% = 800MB of 1GB
    checkIntervalMs: 5000, // 5 seconds
    priorityThreshold: 100, // Critical task priority
};
//# sourceMappingURL=types.js.map