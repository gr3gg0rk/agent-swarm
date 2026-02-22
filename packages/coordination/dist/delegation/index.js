/**
 * Task Delegation Module
 *
 * Core infrastructure for task delegation in the OpenClaw Swarm.
 * Provides types, routing, dependency scheduling, timeout monitoring,
 * progress reporting, and task execution.
 *
 * This module enables Minerva to:
 * - Delegate tasks to agents by ID or role (TASK-01, TASK-02)
 * - Track task dependencies using DAG-based scheduling (TASK-06)
 * - Monitor task timeouts with exponential backoff retry (TASK-04, ERRO-01)
 * - Classify errors for retry decisions (ERRO-02)
 * - Receive progress updates from workers (STAT-02)
 * - Receive completion results from workers (STAT-03)
 * - Cancel in-progress tasks (TASK-05)
 * - Retry failed tasks with exponential backoff (ERRO-01, ERRO-02, ERRO-04)
 * - Request guidance from Minerva (ERRO-05)
 *
 * @see 03-RESEARCH.md for architecture patterns
 * @see 03-CONTEXT.md for implementation decisions
 */
// Export constants
export { DEFAULT_ROLE_HIERARCHY, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES, } from './types.js';
// Export role-based router
export { TaskRouter, createTaskRouter, } from './router.js';
// Export dependency scheduler
export { DependencyScheduler, DependencyError, createDependencyScheduler, } from './dependencies.js';
// Export timeout monitor and error classification
export { TimeoutMonitor, classifyError, calculateBackoffDelay, createTimeoutMonitor, } from './timeout.js';
// Export progress reporter
export { ProgressReporter, createProgressReporter, } from './progress.js';
// Export task delegator
export { TaskDelegator, createTaskDelegator, } from './delegator.js';
// Export worker task executor
export { WorkerTaskExecutor, createWorkerTaskExecutor, } from './worker.js';
// Export task cancellation
export { TaskCancellation, createTaskCancellation, } from './cancellation.js';
// Export retry manager
export { RetryManager, createRetryManager, } from './retry.js';
// Export guidance request
export { GuidanceRequest, createGuidanceRequest, } from './guidance.js';
//# sourceMappingURL=index.js.map