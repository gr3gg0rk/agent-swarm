/**
 * Throttle Controller for Graceful Task Pausing and GC
 *
 * Pauses non-critical tasks when memory exceeds 85%, resumes when drops below 80%.
 * Implements graceful degradation by prioritizing task continuation over killing.
 *
 * Per 04-02-PLAN.md Task 3.
 * Per CONTEXT.md: "Throttle action: pause in-progress tasks to free memory"
 * Per CONTEXT.md: "Graceful degradation: prefer pausing over killing"
 */
import type { TaskQueue } from '../state/task-queue.js';
import type { MemoryStats, ThrottleConfig } from './types.js';
/**
 * Throttle Controller for graceful task pausing and resume.
 *
 * - Pauses non-critical tasks (priority < 100) at 85% memory usage
 * - Requests GC with global.gc() if available
 * - Resumes paused tasks when memory drops below 80%
 * - Tracks paused tasks in Set for state management
 *
 * Per CONTEXT.md: "Pause tasks, don't kill them - gives system chance to recover"
 * Per RESEARCH.md: "Pause only non-critical tasks (priority < 100). Request GC with global.gc()"
 */
export declare class ThrottleController {
    private readonly taskQueue;
    private readonly config;
    private readonly pausedTasks;
    private readonly logger?;
    /**
     * Creates a new ThrottleController instance.
     *
     * @param taskQueue - TaskQueue for task status updates
     * @param config - Throttle configuration (uses defaults if not provided)
     * @param logger - Optional logger for structured logging
     */
    constructor(taskQueue: TaskQueue, config?: Partial<ThrottleConfig>, logger?: any);
    /**
     * Throttle task execution based on memory pressure.
     *
     * Flow:
     * 1. Log warning with current memory usage
     * 2. Get all in-progress tasks
     * 3. For each task with priority < threshold:
     *    - Update status to 'paused'
     *    - Add to pausedTasks set
     *    - Log info message
     * 4. Request GC if global.gc exists
     *
     * Per CONTEXT.md: "Throttle action: pause in-progress tasks to free memory"
     *
     * @param stats - Memory statistics
     */
    throttle(stats: MemoryStats): Promise<void>;
    /**
     * Resume paused tasks when memory pressure decreases.
     *
     * Flow:
     * 1. Check if any tasks are paused
     * 2. Return immediately if none
     * 3. Check if memory is below resume threshold (80%)
     * 4. For each paused task:
     *    - Update status to 'pending' (re-queue for execution)
     *    - Log info message
     * 5. Clear pausedTasks set
     *
     * Per CONTEXT.md: "Resume when pressure decreases"
     *
     * @param stats - Memory statistics
     */
    recover(stats: MemoryStats): Promise<void>;
    /**
     * Get count of currently paused tasks.
     *
     * Useful for monitoring and capacity planning.
     *
     * @returns Number of paused tasks
     */
    getPausedTaskCount(): number;
    /**
     * Get list of currently paused task IDs.
     *
     * Useful for debugging and monitoring.
     *
     * @returns Array of paused task IDs
     */
    getPausedTaskIds(): string[];
    /**
     * Check if a specific task is paused.
     *
     * @param taskId - Task ID to check
     * @returns True if task is paused
     */
    isTaskPaused(taskId: string): boolean;
    /**
     * Get current throttle configuration.
     *
     * @returns Throttle configuration
     */
    getConfig(): ThrottleConfig;
}
/**
 * Factory function to create ThrottleController instance.
 *
 * @param taskQueue - TaskQueue for task status updates
 * @param config - Optional throttle configuration
 * @param logger - Optional logger for structured logging
 * @returns ThrottleController instance
 */
export declare function createThrottleController(taskQueue: TaskQueue, config?: Partial<ThrottleConfig>, logger?: any): ThrottleController;
//# sourceMappingURL=throttle.d.ts.map