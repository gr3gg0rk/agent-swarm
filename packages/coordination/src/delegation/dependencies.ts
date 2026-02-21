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
export class DependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DependencyError';
  }
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
export class DependencyScheduler {
  private strict: boolean;

  constructor(options: DependencySchedulerOptions = {}) {
    this.strict = options.strict ?? true;
  }

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
  validateDependencies(
    taskId: string,
    dependencies: string[],
    allTasks: Map<string, Task>
  ): void {
    if (dependencies.length === 0) {
      return; // No dependencies to validate
    }

    // Check that all dependencies exist
    for (const depId of dependencies) {
      if (!allTasks.has(depId)) {
        throw new DependencyError(`Dependency task not found: ${depId}`);
      }
    }

    // Build dependency graph
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Initialize graph with new task and existing tasks
    for (const [id, task] of allTasks) {
      graph.set(id, []);
      inDegree.set(id, 0);
    }
    // Add new task to graph
    graph.set(taskId, []);
    inDegree.set(taskId, 0);

    // Build edges from dependencies
    for (const depId of dependencies) {
      graph.set(depId, [...(graph.get(depId) || []), taskId]);
      inDegree.set(taskId, (inDegree.get(taskId) || 0) + 1);
    }

    // Add edges from existing tasks
    for (const [id, task] of allTasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          graph.set(dep, [...(graph.get(dep) || []), id]);
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm: topological sort to detect cycles
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;

      // Skip if not in graph (new task might not be added yet)
      if (!graph.has(current)) {
        continue;
      }

      visited++;
      const neighbors = graph.get(current) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    // If not all tasks visited, cycle exists
    const totalTasks = allTasks.size + 1; // +1 for new task
    if (visited < totalTasks) {
      throw new DependencyError(`Circular dependency detected involving task: ${taskId}`);
    }
  }

  /**
   * Get tasks ready to execute (all dependencies completed).
   *
   * Tasks with no dependencies are immediately ready.
   * Tasks with dependencies must have all deps.status === 'completed'.
   *
   * @param allTasks - Map of all tasks
   * @returns Array of tasks ready to execute
   */
  getReadyTasks(allTasks: Map<string, Task>): Task[] {
    return Array.from(allTasks.values()).filter(task => {
      // Only pending tasks can be ready
      if (task.status !== 'pending') {
        return false;
      }

      // No dependencies means immediately ready
      if (!task.dependencies || task.dependencies.length === 0) {
        return true;
      }

      // All dependencies must be completed
      return task.dependencies.every(depId => {
        const dep = allTasks.get(depId);
        return dep?.status === 'completed';
      });
    });
  }

  /**
   * Check if a task has any pending dependencies.
   *
   * @param task - Task to check
   * @param allTasks - Map of all tasks
   * @returns true if task has uncompleted dependencies
   */
  hasPendingDependencies(task: Task, allTasks: Map<string, Task>): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return false;
    }

    return task.dependencies.some(depId => {
      const dep = allTasks.get(depId);
      return !dep || dep.status !== 'completed';
    });
  }

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
  hasCircularDependency(
    taskId: string,
    dependencies: string[],
    allTasks: Map<string, Task>
  ): boolean {
    if (dependencies.length === 0) {
      return false;
    }

    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (currentId: string): boolean => {
      visited.add(currentId);
      recursionStack.add(currentId);

      const currentTask = allTasks.get(currentId);
      if (currentTask?.dependencies) {
        for (const depId of currentTask.dependencies) {
          // Check if this leads back to taskId (cycle)
          if (depId === taskId) {
            return true;
          }

          // Check if dependency is in recursion stack (back edge)
          if (recursionStack.has(depId)) {
            return true;
          }

          // Continue DFS if not visited
          if (!visited.has(depId) && allTasks.has(depId)) {
            if (dfs(depId)) {
              return true;
            }
          }
        }
      }

      // Also check the new dependencies we're proposing
      if (currentId === taskId) {
        for (const depId of dependencies) {
          if (depId === taskId) {
            return true; // Self-dependency
          }

          if (recursionStack.has(depId)) {
            return true;
          }

          if (!visited.has(depId) && allTasks.has(depId)) {
            if (dfs(depId)) {
              return true;
            }
          }
        }
      }

      recursionStack.delete(currentId);
      return false;
    };

    return dfs(taskId);
  }

  /**
   * Get topological order of tasks (execution order).
   *
   * Returns tasks sorted by dependency order (dependencies before dependents).
   * Useful for visualization and debugging.
   *
   * @param allTasks - Map of all tasks
   * @returns Array of task IDs in execution order
   */
  getExecutionOrder(allTasks: Map<string, Task>): string[] {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Build graph
    for (const [id, task] of allTasks) {
      graph.set(id, []);
      inDegree.set(id, 0);
    }

    for (const [id, task] of allTasks) {
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          graph.set(dep, [...(graph.get(dep) || []), id]);
          inDegree.set(id, (inDegree.get(id) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        queue.push(id);
      }
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      result.push(current);

      for (const neighbor of graph.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }
}

/**
 * Convenience function to create dependency scheduler.
 *
 * @param options - Optional scheduler configuration
 * @returns DependencyScheduler instance
 */
export function createDependencyScheduler(
  options?: DependencySchedulerOptions
): DependencyScheduler {
  return new DependencyScheduler(options);
}
