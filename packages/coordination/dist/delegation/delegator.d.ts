/**
 * Task Delegator for Minerva Task Assignment
 *
 * Enables Minerva to delegate tasks to agents by ID or role.
 * Publishes task commands via MQTT and tracks task status in TaskQueue.
 *
 * Per TASK-01: Minerva can delegate a task to specific agent by agent ID.
 * Per TASK-02: Minerva can delegate a task to any agent with a specific role.
 * Per TASK-05: Minerva can cancel in-progress tasks and workers acknowledge.
 * Per COMM-06: Task commands use QoS 1 for at-least-once delivery.
 *
 * @see 03-RESEARCH.md Pattern 6: Task Delegation via MQTT
 */
import type { MqttClient } from '../communication/mqtt.js';
import type { TaskQueue, TaskCreate } from '../state/task-queue.js';
import type { TaskRouter, AgentWithCapacity } from './router.js';
import type { DependencyScheduler } from './dependencies.js';
import type { RetryManager } from './retry.js';
import type { CircuitBreakerRegistry } from './circuit-breaker.js';
import type { PerformanceStore } from './performance-store.js';
/**
 * Task delegation options.
 */
export interface TaskDelegatorOptions {
    /** Available agents for role-based delegation */
    agents?: AgentWithCapacity[];
    /** Circuit breaker registry for rejection tracking */
    circuitBreakers?: CircuitBreakerRegistry;
    /** Performance store for historical task results */
    performanceStore?: PerformanceStore;
}
/**
 * Task command payload sent to agent.
 * Contains task details needed for execution.
 */
export interface TaskCommandEnvelope {
    /** Task ID to execute */
    taskId: string;
    /** Task-specific data */
    payload: unknown;
    /** Task IDs that must complete first (TASK-06) */
    dependencies?: string[];
    /** Per-task timeout in milliseconds (TASK-04) */
    timeoutMs: number;
    /** Per-task retry limit (ERRO-01, default: 3) */
    maxRetries?: number;
}
/**
 * Task delegator for Minerva to assign tasks.
 *
 * Supports two delegation modes:
 * 1. Direct delegation: delegate to specific agent by ID
 * 2. Role-based delegation: delegate to any agent with required role
 *
 * Role-based delegation uses TaskRouter for intelligent agent selection
 * with hierarchical fallback (e.g., senior-builder can do builder tasks).
 *
 * @example
 * ```ts
 * const delegator = new TaskDelegator(mqttClient, taskQueue, router, scheduler);
 *
 * // Direct delegation
 * const taskId = await delegator.delegateToAgent(task, 'worker-1');
 *
 * // Role-based delegation
 * const taskId = await delegator.delegateToRole(task, 'builder', 'typescript');
 *
 * // Cancel task
 * await delegator.cancelTask(taskId);
 * ```
 */
export declare class TaskDelegator {
    private mqttClient;
    private taskQueue;
    private router;
    private dependencyScheduler;
    private retryManager;
    private agents;
    private circuitBreakers?;
    private performanceStore?;
    /**
     * Creates a new task delegator.
     *
     * @param mqttClient - MQTT client for publishing task commands
     * @param taskQueue - Task queue for task status tracking
     * @param router - Task router for role-based agent selection
     * @param dependencyScheduler - Dependency scheduler for validation
     * @param retryManager - Retry manager for timeout handling
     * @param options - Optional configuration
     */
    constructor(mqttClient: MqttClient, taskQueue: TaskQueue, router: TaskRouter, dependencyScheduler: DependencyScheduler, retryManager: RetryManager, options?: TaskDelegatorOptions);
    /**
     * Set available agents for role-based delegation.
     *
     * Called when agent registry changes (e.g., new agent registers).
     *
     * @param agents - Available agents with capacity information
     */
    setAgents(agents: AgentWithCapacity[]): void;
    /**
     * Delegate task to specific agent by ID.
     *
     * Validates dependencies, creates task in queue, and publishes
     * task command to agent's command topic.
     *
     * Per TASK-01: Minerva can delegate a task to specific agent by agent ID.
     *
     * @param task - Task data to delegate
     * @param agentId - Target agent ID
     * @returns Created task ID
     * @throws Error if dependency validation fails
     */
    delegateToAgent(task: TaskCreate, agentId: string): Promise<string>;
    /**
     * Delegate task to any agent with required role.
     *
     * Uses TaskRouter to find best matching agent based on:
     * 1. Role compatibility (with hierarchical fallback)
     * 2. Capability requirements (optional)
     * 3. Current load (least-loaded first)
     *
     * Per TASK-02: Minerva can delegate task to any agent with a specific role.
     *
     * @param task - Task data to delegate
     * @param role - Required role for task execution
     * @param capability - Optional specific capability required
     * @returns Created task ID
     * @throws Error if no available agent found for role
     */
    delegateToRole(task: TaskCreate, role: string, capability?: string): Promise<string>;
    /**
     * Cancel in-progress task.
     *
     * Publishes cancellation command to agent and updates task status.
     * Worker acknowledges cancellation by publishing to result topic.
     *
     * Per TASK-05: Minerva can cancel in-progress tasks and workers acknowledge.
     *
     * @param taskId - Task ID to cancel
     * @throws Error if task not found or not in progress
     */
    cancelTask(taskId: string): Promise<void>;
    /**
     * Handle task timeout.
     *
     * Called by TimeoutMonitor when task times out.
     * Checks retry count and either schedules retry or notifies Minerva.
     *
     * Per CONTEXT.md: Minerva notified after max retries exhausted
     * Per CONTEXT.md: Default + override (2-minute default timeout)
     *
     * @param taskId - Task ID that timed out
     * @param retryCount - Current retry attempt
     */
    handleTimeout(taskId: string, retryCount: number): Promise<void>;
    /**
     * Notify Minerva of task failure.
     *
     * Creates TaskResult with failure details and publishes notification.
     * Called when task fails after exhausting retries or encounters permanent error.
     *
     * Per ERRO-04: Minerva notified when task fails after exhausting retries
     *
     * @param taskId - Task ID that failed
     * @param reason - Failure reason (e.g., 'timeout', 'permanent_error')
     * @param details - Detailed error message
     */
    notifyMinerva(taskId: string, reason: string, details: string): Promise<void>;
    /**
     * Publish task command to agent via MQTT.
     *
     * Creates MessageEnvelope with task details and publishes to
     * agent/{id}/command topic with QoS 1 (at-least-once delivery).
     *
     * Per COMM-06: Task commands use QoS 1 for at-least-once delivery.
     *
     * @param agentId - Target agent ID
     * @param task - Task to command
     */
    private publishTaskCommand;
    /**
     * Publish cancellation command to agent via MQTT.
     *
     * Creates MessageEnvelope with cancellation payload and publishes to
     * agent/{id}/cancel topic with QoS 1.
     *
     * @param agentId - Target agent ID
     * @param taskId - Task ID to cancel
     */
    private publishCancelCommand;
    /**
     * Calculate exponential backoff delay.
     *
     * Per ROUT-05: 2^n × 100ms, max 5s.
     * Adds jitter to prevent thundering herd.
     *
     * @param attempt - Retry attempt number (0-indexed)
     * @returns Delay in milliseconds
     */
    private calculateBackoff;
    /**
     * Sleep for specified milliseconds.
     *
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    private sleep;
    /**
     * Handle task rejection with exponential backoff retry.
     *
     * Per ROUT-04: Worker can reject task when overloaded.
     * Per ROUT-05: Router retries with exponential backoff.
     * Per ROUT-06: Circuit breaker tracks consecutive rejections.
     *
     * @param taskId - Rejected task ID
     * @param agentId - Agent that rejected the task
     * @param payload - Rejection payload with CPU/memory metrics
     * @param attempt - Current retry attempt
     */
    private handleTaskRejection;
    /**
     * Notify Minerva of task failure.
     *
     * @param taskId - Task ID that failed
     * @param agentId - Agent that failed (optional)
     * @param details - Failure details
     */
    private notifyMinervaTaskFailed;
    /**
     * Retry task delegation with new agent selection.
     *
     * @param taskId - Task ID to retry
     * @param attempt - Retry attempt number
     */
    private retryTask;
    /**
     * Subscribe to task rejection and result messages.
     *
     * Sets up MQTT listener for task_rejected and result message types.
     */
    private setupRejectionHandler;
}
/**
 * Convenience function to create task delegator.
 *
 * @param mqttClient - MQTT client for publishing task commands
 * @param taskQueue - Task queue for task status tracking
 * @param router - Task router for role-based agent selection
 * @param dependencyScheduler - Dependency scheduler for validation
 * @param retryManager - Retry manager for timeout handling
 * @param options - Optional configuration
 * @returns TaskDelegator instance
 */
export declare function createTaskDelegator(mqttClient: MqttClient, taskQueue: TaskQueue, router: TaskRouter, dependencyScheduler: DependencyScheduler, retryManager: RetryManager, options?: TaskDelegatorOptions): TaskDelegator;
//# sourceMappingURL=delegator.d.ts.map