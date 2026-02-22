/**
 * Memory Module Exports
 *
 * Exports all memory monitoring and throttling types and classes
 * for graceful degradation on constrained hardware (Pi 2B, 1GB RAM).
 *
 * Per 04-02-PLAN.md Task 2 and Task 3.
 */
export { DEFAULT_THROTTLE_CONFIG } from './types.js';
// Classes
export { MemoryMonitor, createMemoryMonitor } from './monitor.js';
export { ThrottleController, createThrottleController } from './throttle.js';
/**
 * Factory function to create a fully configured memory monitoring system.
 *
 * Creates ThrottleController and MemoryMonitor instances with
 * default configuration for Pi 2B (1GB RAM).
 *
 * @param taskQueue - TaskQueue for task status updates
 * @param logger - Optional logger for structured logging
 * @param config - Optional throttle configuration
 * @returns Object with MemoryMonitor and ThrottleController instances
 *
 * @example
 * ```ts
 * import { createMemorySystem } from '@openclaw-swarm/coordination';
 *
 * const { memoryMonitor, throttleController } = createMemorySystem(taskQueue, logger);
 * memoryMonitor.start();
 * ```
 */
export function createMemorySystem(taskQueue, logger, config) {
    const { createThrottleController } = require('./throttle.js');
    const { createMemoryMonitor } = require('./monitor.js');
    const throttleController = createThrottleController(taskQueue, config, logger);
    const memoryMonitor = createMemoryMonitor(throttleController, config);
    return { memoryMonitor, throttleController };
}
//# sourceMappingURL=index.js.map