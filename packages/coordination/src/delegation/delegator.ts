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

import { v4 as uuidv4 } from 'uuid';
import type { MqttClient } from '../communication/mqtt.js';
import { Topics } from '../communication/topics.js';
import type { MessageEnvelope } from '../communication/message.js';
import type { TaskQueue, Task, TaskCreate } from '../state/task-queue.js';
import type { TaskRouter, AgentWithCapacity } from './router.js';
import type { DependencyScheduler } from './dependencies.js';
import type { RetryManager } from './retry.js';
import type { AgentRegistration } from '../discovery/types.js';

/**
 * Task delegation options.
 */
export interface TaskDelegatorOptions {
  /** Available agents for role-based delegation */
  agents?: AgentWithCapacity[];
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
export class TaskDelegator {
  private agents: AgentWithCapacity[];

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
  constructor(
    private mqttClient: MqttClient,
    private taskQueue: TaskQueue,
    private router: TaskRouter,
    private dependencyScheduler: DependencyScheduler,
    private retryManager: RetryManager,
    options: TaskDelegatorOptions = {}
  ) {
    this.agents = options.agents ?? [];
  }

  /**
   * Set available agents for role-based delegation.
   *
   * Called when agent registry changes (e.g., new agent registers).
   *
   * @param agents - Available agents with capacity information
   */
  setAgents(agents: AgentWithCapacity[]): void {
    this.agents = agents;
  }

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
  async delegateToAgent(task: TaskCreate, agentId: string): Promise<string> {
    // Validate dependencies if present
    if (task.dependencies && task.dependencies.length > 0) {
      // Build task map for validation (current task not yet in queue)
      const allTasks = new Map<string, Task>();
      const existingTasks = this.taskQueue.getTasks({ limit: 1000 });
      for (const t of existingTasks) {
        allTasks.set(t.id, t);
      }
      this.dependencyScheduler.validateDependencies('(pending)', task.dependencies, allTasks);
    }

    // Create task with assigned agent
    const createdTask = this.taskQueue.createTask({
      ...task,
      assignedAgent: agentId,
      status: 'pending',
    });

    // Publish task command to agent
    await this.publishTaskCommand(agentId, createdTask);

    return createdTask.id;
  }

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
  async delegateToRole(task: TaskCreate, role: string, capability?: string): Promise<string> {
    // Filter available agents with capacity
    const availableAgents = this.agents.filter(agent => agent.currentTasks < agent.maxCapacity);

    if (availableAgents.length === 0) {
      throw new Error(`No available agents found for role: ${role} (all at capacity)`);
    }

    // Find best agent using router
    const targetAgent = this.router.findAgentForTask(availableAgents, role, capability);

    if (!targetAgent) {
      throw new Error(`No available agent found for role: ${role}${capability ? ` with capability: ${capability}` : ''}`);
    }

    // Delegate to selected agent
    return this.delegateToAgent(task, targetAgent.agentId);
  }

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
  async cancelTask(taskId: string): Promise<void> {
    // Get task from queue
    const task = this.taskQueue.getTask(taskId);

    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'in_progress') {
      throw new Error(`Task not in progress: ${taskId} (status: ${task.status})`);
    }

    if (!task.assignedAgent) {
      throw new Error(`Task has no assigned agent: ${taskId}`);
    }

    // Publish cancellation command
    await this.publishCancelCommand(task.assignedAgent, taskId);

    // Update task status to cancelled
    this.taskQueue.updateTaskStatus(taskId, 'cancelled');
  }

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
  async handleTimeout(taskId: string, retryCount: number): Promise<void> {
    // Get task from queue
    const task = this.taskQueue.getTask(taskId);

    if (!task) {
      console.warn(`Task not found for timeout handling: ${taskId}`);
      return;
    }

    // Return early if task is no longer in progress
    if (task.status !== 'in_progress') {
      console.log(`Task ${taskId} no longer in progress (status: ${task.status}), skipping timeout handling`);
      return;
    }

    const maxRetries = task.maxRetries ?? 3;

    // Check if retries remaining
    if (retryCount <= maxRetries) {
      // Retries remaining: schedule retry via RetryManager
      const timeoutError = new Error(`Task timed out after ${task.timeoutMs ?? 120000}ms`);
      await this.retryManager.scheduleRetry(taskId, timeoutError);
      console.log(`Task ${taskId} timed out, scheduled retry (${retryCount}/${maxRetries})`);
    } else {
      // Retries exhausted: notify Minerva
      await this.notifyMinerva(taskId, 'timeout', `Task timed out after ${retryCount} retries`);
    }
  }

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
  async notifyMinerva(taskId: string, reason: string, details: string): Promise<void> {
    // Get task for context
    const task = this.taskQueue.getTask(taskId);

    // Create failure result
    const failureResult = {
      taskId,
      success: false,
      error: {
        type: 'permanent' as const,
        message: details,
        reason,
      },
      timestamp: Date.now(),
    };

    // Create notification envelope
    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: 'orchestrator',
      to: 'minerva',
      type: 'task_failed',
      timestamp: Date.now(),
      payload: {
        taskId,
        reason,
        details,
        timestamp: Date.now(),
      },
      qos: 1,
      retain: false,
    };

    // Publish to task result topic or dedicated failure topic
    // Using task result topic for now - Minerva subscribes to agent/+/result
    const topic = task?.assignedAgent
      ? Topics.taskResult(task.assignedAgent)
      : 'swarm/tasks/failed';

    await this.mqttClient.publish(topic, envelope);

    console.error(`Notified Minerva of task failure: ${taskId} - ${reason}: ${details}`);
  }

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
  private async publishTaskCommand(agentId: string, task: Task): Promise<void> {
    const command: TaskCommandEnvelope = {
      taskId: task.id,
      payload: task.payload,
      dependencies: task.dependencies,
      timeoutMs: task.timeoutMs || 120000, // Default 2 minutes
      maxRetries: task.maxRetries || 3,
    };

    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: 'minerva',
      to: agentId,
      type: 'task',
      timestamp: Date.now(),
      payload: command,
      qos: 1, // At-least-once delivery per COMM-06
      retain: false,
    };

    const topic = Topics.taskCommand(agentId);

    await this.mqttClient.publish(topic, envelope);
  }

  /**
   * Publish cancellation command to agent via MQTT.
   *
   * Creates MessageEnvelope with cancellation payload and publishes to
   * agent/{id}/cancel topic with QoS 1.
   *
   * @param agentId - Target agent ID
   * @param taskId - Task ID to cancel
   */
  private async publishCancelCommand(agentId: string, taskId: string): Promise<void> {
    const envelope: MessageEnvelope = {
      messageId: uuidv4(),
      idempotencyKey: uuidv4(),
      from: 'minerva',
      to: agentId,
      type: 'cancel',
      timestamp: Date.now(),
      payload: { taskId },
      qos: 1,
      retain: false,
    };

    const topic = Topics.taskCancel(agentId);

    await this.mqttClient.publish(topic, envelope);
  }
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
export function createTaskDelegator(
  mqttClient: MqttClient,
  taskQueue: TaskQueue,
  router: TaskRouter,
  dependencyScheduler: DependencyScheduler,
  retryManager: RetryManager,
  options?: TaskDelegatorOptions
): TaskDelegator {
  return new TaskDelegator(mqttClient, taskQueue, router, dependencyScheduler, retryManager, options);
}
