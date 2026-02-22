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
export type { TaskResult, TaskProgress, TaskCommandPayload, RoleHierarchy, } from './types.js';
export { DEFAULT_ROLE_HIERARCHY, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RETRIES, } from './types.js';
export { TaskRouter, type AgentWithCapacity, type RouterOptions, createTaskRouter, } from './router.js';
export { DependencyScheduler, DependencyError, type DependencySchedulerOptions, createDependencyScheduler, } from './dependencies.js';
export { TimeoutMonitor, classifyError, calculateBackoffDelay, type TimeoutCallback, type TimeoutMonitorOptions, type ErrorType, createTimeoutMonitor, } from './timeout.js';
export { ProgressReporter, type ProgressReporterOptions, createProgressReporter, } from './progress.js';
export { TaskDelegator, type TaskDelegatorOptions, type TaskCommandEnvelope, createTaskDelegator, } from './delegator.js';
export { WorkerTaskExecutor, type WorkerTaskExecutorOptions, type TaskResultPayload, type TaskCancelPayload, type ProgressCallback, createWorkerTaskExecutor, } from './worker.js';
export { TaskCancellation, type TaskCancelPayload as CancellationPayload, createTaskCancellation, } from './cancellation.js';
export { RetryManager, type RetryManagerOptions, createRetryManager, } from './retry.js';
export { GuidanceRequest, type GuidanceRequestOptions, type GuidanceRequestPayload, type GuidanceResponsePayload, createGuidanceRequest, } from './guidance.js';
//# sourceMappingURL=index.d.ts.map