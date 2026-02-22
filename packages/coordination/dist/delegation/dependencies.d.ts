/**
 * DAG-Based Dependency Scheduler with Cycle Detection
 *
 * Manages task dependencies using Directed Acyclic Graph (DAG) representation.
 * Detects circular dependencies at task creation time using Kahn's algorithm.
 *
 * Per TASK-06: Task dependencies are tracked (Task B depends on Task A completing first)
 * Per CONTEXT.md: Fail on prereq failure (dependent task fails if prerequisite fails)
 * Per CONTEXT.md: Claude's discretion on circular dependency handling - reject at creation time
 *
 * @see 03-RESEARCH.md Pattern 3: DAG-Based Dependency Scheduling
 * @see Kahn's algorithm: https://en.wikipedia.org/wiki/Topological_sorting#Kahn's_algorithm
 */
import type { Task } from './types.js';
/**
 * Validation error for dependency issues.
 */
export declare class DependencyError extends Error {
    constructor(message: string);
}
/**
 * Dependency scheduler options.
 */
export interface DependencySchedulerOptions {
    /** Enable strict validation (throws on any error) */
    strict?: boolean;
}
/**
 * DAG-based dependency scheduler.
 *
 * Provides dependency validation and ready task identification using Kahn's
 * algorithm for topological sorting and cycle detection.
 *
 * @example
 * ```ts
 * const scheduler = new DependencyScheduler();
 *
 * // Validate dependencies before creating task
 * scheduler.validateDependencies('task-c', ['task-a', 'task-b'], allTasks);
 *
 * // Get tasks ready to execute (all dependencies completed)
 * const readyTasks = scheduler.getReadyTasks(allTasks);
 * ```
 */
export declare class DependencyScheduler {
    private strict;
    constructor(options?: DependencySchedulerOptions);
    /**
     * Validate task dependencies using Kahn's algorithm for cycle detection.
     *
     * Rejects tasks with circular dependencies at creation time.
     * Also validates that all dependency tasks exist.
     *
     * @param taskId - Task ID to validate
     * @param dependencies - Array of dependency task IDs
     * @param allTasks - Map of all existing tasks
     * @throws DependencyError if circular dependency detected or dependency not found
     */
    validateDependencies(taskId: string, dependencies: string[], allTasks: Map<string, Task>): void;
    /**
     * Get tasks ready to execute (all dependencies completed).
     *
     * Tasks with no dependencies are immediately ready.
     * Tasks with dependencies must have all deps.status === 'completed'.
     *
     * @param allTasks - Map of all tasks
     * @returns Array of tasks ready to execute
     */
    getReadyTasks(allTasks: Map<string, Task>): Task[];
    /**
     * Check if a task has any pending dependencies.
     *
     * @param task - Task to check
     * @param allTasks - Map of all tasks
     * @returns true if task has uncompleted dependencies
     */
    hasPendingDependencies(task: Task, allTasks: Map<string, Task>): boolean;
    /**
     * Check if a dependency relationship would create a cycle.
     *
     * Uses DFS with recursion detection.
     *
     * @param taskId - Task ID to check
     * @param dependencies - Proposed dependencies
     * @param allTasks - Map of all existing tasks
     * @returns true if cycle would be created
     */
    hasCircularDependency(taskId: string, dependencies: string[], allTasks: Map<string, Task>): boolean;
    /**
     * Get topological order of tasks (execution order).
     *
     * Returns tasks sorted by dependency order (dependencies before dependents).
     * Useful for visualization and debugging.
     *
     * @param allTasks - Map of all tasks
     * @returns Array of task IDs in execution order
     */
    getExecutionOrder(allTasks: Map<string, Task>): string[];
}
/**
 * Convenience function to create dependency scheduler.
 *
 * @param options - Optional scheduler configuration
 * @returns DependencyScheduler instance
 */
export declare function createDependencyScheduler(options?: DependencySchedulerOptions): DependencyScheduler;
//# sourceMappingURL=dependencies.d.ts.map