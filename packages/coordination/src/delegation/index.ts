/**
 * Task Delegation Module
 *
 * Core infrastructure for task delegation in the OpenClaw Swarm.
 * Provides types, routing, dependency scheduling, and timeout monitoring.
 *
 * This module enables Minerva to:
 * - Delegate tasks to agents by ID or role (TASK-01, TASK-02)
 * - Track task dependencies using DAG-based scheduling (TASK-06)
 * - Monitor task timeouts with exponential backoff retry (TASK-04, ERRO-01)
 * - Classify errors for retry decisions (ERRO-02)
 *
 * @see 03-RESEARCH.md for architecture patterns
 * @see 03-CONTEXT.md for implementation decisions
 */

// NOTE: Task and TaskCreate types are exported from state/index.ts
// to avoid circular imports and naming conflicts.

// Export additional delegation-specific types
export type {
  TaskResult,
  TaskProgress,
  TaskCommandPayload,
  RoleHierarchy,
} from './types.js';

// Export constants
export {
  DEFAULT_ROLE_HIERARCHY,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_RETRIES,
} from './types.js';

// Export role-based router
export {
  TaskRouter,
  type AgentWithCapacity,
  type RouterOptions,
  createTaskRouter,
} from './router.js';

// Export dependency scheduler
export {
  DependencyScheduler,
  DependencyError,
  type DependencySchedulerOptions,
  createDependencyScheduler,
} from './dependencies.js';

// Export timeout monitor and error classification
export {
  TimeoutMonitor,
  classifyError,
  calculateBackoffDelay,
  type TimeoutCallback,
  type TimeoutMonitorOptions,
  type ErrorType,
  createTimeoutMonitor,
} from './timeout.js';
