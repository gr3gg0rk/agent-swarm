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
import { Topics, TaskDelegationPatterns } from '../communication/topics.js';
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
    mqttClient;
    taskQueue;
    router;
    dependencyScheduler;
    retryManager;
    agents;
    circuitBreakers;
    performanceStore;
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
    constructor(mqttClient, taskQueue, router, dependencyScheduler, retryManager, options = {}) {
        this.mqttClient = mqttClient;
        this.taskQueue = taskQueue;
        this.router = router;
        this.dependencyScheduler = dependencyScheduler;
        this.retryManager = retryManager;
        this.agents = options.agents ?? [];
        this.circuitBreakers = options.circuitBreakers;
        this.performanceStore = options.performanceStore;
        // Set up rejection handler for task_rejected messages
        this.setupRejectionHandler();
    }
    /**
     * Set available agents for role-based delegation.
     *
     * Called when agent registry changes (e.g., new agent registers).
     *
     * @param agents - Available agents with capacity information
     */
    setAgents(agents) {
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
    async delegateToAgent(task, agentId) {
        // Validate dependencies if present
        if (task.dependencies && task.dependencies.length > 0) {
            // Build task map for validation (current task not yet in queue)
            const allTasks = new Map();
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
    async delegateToRole(task, role, capability) {
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
    async cancelTask(taskId) {
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
    async handleTimeout(taskId, retryCount) {
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
        }
        else {
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
    async notifyMinerva(taskId, reason, details) {
        // Get task for context
        const task = this.taskQueue.getTask(taskId);
        // Create failure result
        const failureResult = {
            taskId,
            success: false,
            error: {
                type: 'permanent',
                message: details,
                reason,
            },
            timestamp: Date.now(),
        };
        // Create notification envelope
        const envelope = {
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
    async publishTaskCommand(agentId, task) {
        const command = {
            taskId: task.id,
            payload: task.payload,
            dependencies: task.dependencies,
            timeoutMs: task.timeoutMs || 120000, // Default 2 minutes
            maxRetries: task.maxRetries || 3,
        };
        const envelope = {
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
    async publishCancelCommand(agentId, taskId) {
        const envelope = {
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
    /**
     * Calculate exponential backoff delay.
     *
     * Per ROUT-05: 2^n × 100ms, max 5s.
     * Adds jitter to prevent thundering herd.
     *
     * @param attempt - Retry attempt number (0-indexed)
     * @returns Delay in milliseconds
     */
    calculateBackoff(attempt) {
        const baseDelay = 100; // 100ms per ROUT-05
        const maxDelay = 5000; // 5s cap per ROUT-05
        const exponentialDelay = baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 100; // 0-100ms jitter
        return Math.min(exponentialDelay + jitter, maxDelay);
    }
    /**
     * Sleep for specified milliseconds.
     *
     * @param ms - Milliseconds to sleep
     * @returns Promise that resolves after delay
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
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
    async handleTaskRejection(taskId, agentId, payload, attempt) {
        console.warn(`Task ${taskId} rejected by ${agentId}: ${payload.reason} ` +
            `(attempt ${attempt}, CPU: ${payload.cpuPercent}%, Memory: ${payload.memoryPercent}%)`);
        // Record rejection in circuit breaker
        if (this.circuitBreakers) {
            this.circuitBreakers.get(agentId).recordRejection();
        }
        // Check max retry attempts
        const maxAttempts = 5; // Allow up to 5 retries
        if (attempt >= maxAttempts) {
            // Max retries exhausted - notify Minerva
            await this.notifyMinervaTaskFailed(taskId, agentId, `Max retries exhausted after ${maxAttempts} rejections`);
            return;
        }
        // Calculate backoff delay per ROUT-05
        const delay = this.calculateBackoff(attempt);
        console.log(`Retrying task ${taskId} after ${delay.toFixed(0)}ms delay (attempt ${attempt + 1}/${maxAttempts})`);
        // Wait for backoff delay
        await this.sleep(delay);
        // Re-select agent and retry
        await this.retryTask(taskId, attempt + 1);
    }
    /**
     * Notify Minerva of task failure.
     *
     * @param taskId - Task ID that failed
     * @param agentId - Agent that failed (optional)
     * @param details - Failure details
     */
    async notifyMinervaTaskFailed(taskId, agentId, details) {
        // Get task for context
        const task = this.taskQueue.getTask(taskId);
        // Create notification envelope
        const envelope = {
            messageId: uuidv4(),
            idempotencyKey: uuidv4(),
            from: 'orchestrator',
            to: 'minerva',
            type: 'task_failed',
            timestamp: Date.now(),
            payload: {
                taskId,
                agentId,
                reason: 'retry_exhausted',
                details,
                timestamp: Date.now(),
            },
            qos: 1,
            retain: false,
        };
        // Publish to task result topic or dedicated failure topic
        const topic = task?.assignedAgent
            ? Topics.taskResult(task.assignedAgent)
            : 'swarm/tasks/failed';
        await this.mqttClient.publish(topic, envelope);
        console.error(`Notified Minerva of task failure: ${taskId} - ${details}`);
    }
    /**
     * Retry task delegation with new agent selection.
     *
     * @param taskId - Task ID to retry
     * @param attempt - Retry attempt number
     */
    async retryTask(taskId, attempt) {
        // Get task from queue
        const task = this.taskQueue.getTask(taskId);
        if (!task) {
            console.warn(`Task ${taskId} not found for retry`);
            return;
        }
        // Filter available agents with capacity
        const availableAgents = this.agents.filter(agent => agent.currentTasks < agent.maxCapacity);
        if (availableAgents.length === 0) {
            console.error(`No available agents for task ${taskId} retry ${attempt}`);
            await this.notifyMinervaTaskFailed(taskId, 'none', `No available agents for retry`);
            return;
        }
        // Find new agent using router (filters out Open circuit breakers)
        const targetAgent = this.router.findAgentForTask(availableAgents, task.assignedAgent || 'worker', // Use required role
        undefined // No specific capability required for retry
        );
        if (!targetAgent) {
            console.error(`No available agents for task ${taskId} retry ${attempt}`);
            await this.notifyMinervaTaskFailed(taskId, 'none', `No available agents for retry`);
            return;
        }
        // Delegate to new agent
        await this.publishTaskCommand(targetAgent.agentId, task);
        console.log(`Task ${taskId} reassigned to ${targetAgent.agentId} for retry ${attempt}`);
    }
    /**
     * Subscribe to task rejection and result messages.
     *
     * Sets up MQTT listener for task_rejected and result message types.
     */
    setupRejectionHandler() {
        const topicPattern = TaskDelegationPatterns.allResults; // 'agent/+/result'
        this.mqttClient.on('message', (envelope, receivedTopic) => {
            if (envelope.type === 'task_rejected') {
                const payload = envelope.payload;
                const agentId = envelope.from;
                // Find retry attempt count from task
                const task = this.taskQueue.getTask(payload.taskId);
                const attempt = task?.retryCount ?? 0;
                this.handleTaskRejection(payload.taskId, agentId, payload, attempt).catch(error => {
                    console.error('Error handling task rejection:', error);
                });
            }
            else if (envelope.type === 'result') {
                // Record success in circuit breaker and performance store
                const result = envelope.payload;
                const agentId = envelope.from;
                if (result.success) {
                    // Record success in circuit breaker
                    if (this.circuitBreakers) {
                        const breaker = this.circuitBreakers.get(agentId);
                        if (breaker) {
                            breaker.recordSuccess();
                        }
                    }
                    // Record success in performance store
                    if (this.performanceStore && result.executionTime) {
                        this.performanceStore.recordTaskResult({
                            taskId: result.taskId,
                            agentId: agentId,
                            success: true,
                            executionTime: result.executionTime,
                            timestamp: Date.now(),
                        });
                    }
                }
            }
        });
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
export function createTaskDelegator(mqttClient, taskQueue, router, dependencyScheduler, retryManager, options) {
    return new TaskDelegator(mqttClient, taskQueue, router, dependencyScheduler, retryManager, options);
}
//# sourceMappingURL=delegator.js.map