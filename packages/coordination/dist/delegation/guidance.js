/**
 * Guidance Request for Agent-to-Minerva Communication
 *
 * Enables agents to request guidance from Minerva when encountering
 * ambiguous situations during task execution.
 *
 * Per ERRO-05: Agents can request guidance from Minerva when encountering
 * ambiguous situations. Per CONTEXT.md: Claude's discretion on guidance
 * request approach - using request/response pattern with 30s timeout.
 *
 * @see 03-RESEARCH.md Pattern: Guidance request via agent/{id}/error topic
 */
import { v4 as uuidv4 } from 'uuid';
import { Topics } from '../communication/topics.js';
/**
 * Guidance request manager for agent-to-Minerva communication.
 *
 * Agents use this class to request guidance when encountering ambiguous
 * situations (unclear requirements, multiple valid approaches, etc.).
 *
 * Implements request/response pattern with 30-second timeout.
 * If no response received within timeout, agent proceeds with default behavior.
 *
 * @example
 * ```ts
 * const guidance = new GuidanceRequest('builder-1', mqttClient);
 *
 * // Request guidance
 * const requestId = await guidance.requestGuidance(
 *   'task-123',
 *   'Build system unclear whether to use webpack or vite',
 *   ['webpack', 'vite', 'ask user']
 * );
 *
 * // Response will be delivered via setupResponseHandler()
 * ```
 */
export class GuidanceRequest {
    agentId;
    mqttClient;
    pendingRequests = new Map();
    responseTimeoutMs;
    /**
     * Creates a new guidance request manager.
     *
     * @param agentId - This agent's ID
     * @param mqttClient - MQTT client for publishing requests
     * @param options - Optional configuration
     */
    constructor(agentId, mqttClient, options = {}) {
        this.agentId = agentId;
        this.mqttClient = mqttClient;
        this.responseTimeoutMs = options.responseTimeoutMs ?? 30000; // 30 second default
        // Set up response handler
        this.setupResponseHandler();
    }
    /**
     * Request guidance from Minerva.
     *
     * Creates guidance request payload and publishes to swarm/guidance/request topic.
     * Sets up response timeout (30 seconds by default).
     *
     * Returns promise that resolves with guidance response.
     * If timeout occurs, promise resolves with empty string.
     *
     * @param taskId - Task ID being executed
     * @param situation - Description of ambiguous situation
     * @param options - Optional decision options for Minerva to choose from
     * @returns Promise resolving to request ID
     */
    async requestGuidance(taskId, situation, options) {
        // Generate request ID
        const requestId = uuidv4();
        // Create guidance request payload
        const payload = {
            requestId,
            taskId,
            agentId: this.agentId,
            situation,
            options,
            timestamp: Date.now(),
        };
        // Create message envelope
        const envelope = {
            messageId: uuidv4(),
            idempotencyKey: uuidv4(),
            from: this.agentId,
            to: 'minerva',
            type: 'guidance_request',
            timestamp: Date.now(),
            payload,
            qos: 1, // At-least-once delivery
            retain: false,
        };
        // Publish to guidance request topic
        const topic = Topics.guidanceRequest();
        await this.mqttClient.publish(topic, envelope);
        // Set up response timeout promise
        const responsePromise = new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                this.handleResponseTimeout(requestId);
                resolve(''); // Empty string indicates timeout
            }, this.responseTimeoutMs);
            // Store pending request
            this.pendingRequests.set(requestId, {
                requestId,
                taskId,
                timeoutId,
                callback: (guidance, selectedOption) => {
                    clearTimeout(timeoutId);
                    resolve(selectedOption ?? guidance);
                },
            });
        });
        // Return promise that resolves with guidance
        return responsePromise;
    }
    /**
     * Provide guidance response to agent.
     *
     * Called by Minerva to respond to guidance request.
     * Publishes to agent/{id}/guidance topic.
     *
     * @param requestId - Request ID to respond to
     * @param guidance - Guidance from Minerva
     * @param taskId - Task ID this applies to
     */
    async provideGuidance(requestId, guidance, taskId) {
        // Create guidance response payload
        const payload = {
            requestId,
            taskId,
            guidance,
            timestamp: Date.now(),
        };
        // Create message envelope
        const envelope = {
            messageId: uuidv4(),
            idempotencyKey: uuidv4(),
            from: 'minerva',
            to: this.agentId,
            type: 'guidance_response',
            timestamp: Date.now(),
            payload,
            qos: 1,
            retain: false,
        };
        // Publish to agent-specific guidance topic
        const topic = Topics.guidanceResponse(this.agentId);
        await this.mqttClient.publish(topic, envelope);
        // Clear request timeout (if agent is responding to itself)
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
            clearTimeout(pending.timeoutId);
            this.pendingRequests.delete(requestId);
        }
    }
    /**
     * Set up response handler for guidance responses.
     *
     * Subscribes to agent/{id}/guidance topic and matches responses
     * to pending requests by requestId.
     *
     * Called in constructor.
     */
    setupResponseHandler() {
        const topic = Topics.guidanceResponse(this.agentId);
        // Set up message handler via mqtt client's event system
        this.mqttClient.on('message', (envelope, receivedTopic) => {
            if (receivedTopic === topic) {
                this.handleResponse(envelope).catch(error => {
                    console.error('Error handling guidance response:', error);
                });
            }
        });
    }
    /**
     * Handle incoming guidance response.
     *
     * Matches response to pending request and invokes callback.
     *
     * @param envelope - Received message envelope
     */
    async handleResponse(envelope) {
        const payload = envelope.payload;
        const { requestId, guidance, selectedOption } = payload;
        // Find pending request
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            // No pending request - might have timed out already
            console.warn(`Received guidance response for unknown request: ${requestId}`);
            return;
        }
        // Clear timeout and invoke callback
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);
        pending.callback(guidance, selectedOption);
        console.log(`Guidance response received for request ${requestId}: ${guidance}`);
    }
    /**
     * Handle response timeout.
     *
     * Called when guidance request times out (30 seconds).
     * Logs warning and removes from pending requests.
     * Agent proceeds with default behavior or aborts.
     *
     * @param requestId - Request ID that timed out
     */
    handleResponseTimeout(requestId) {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            return; // Already handled
        }
        this.pendingRequests.delete(requestId);
        console.warn(`Guidance request ${requestId} timed out after ${this.responseTimeoutMs}ms`);
        console.warn(`Agent ${this.agentId} should proceed with default behavior or abort`);
    }
    /**
     * Cancel pending guidance request.
     *
     * Useful when task completes or is cancelled.
     *
     * @param requestId - Request ID to cancel
     */
    cancelRequest(requestId) {
        const pending = this.pendingRequests.get(requestId);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timeoutId);
        this.pendingRequests.delete(requestId);
        console.log(`Cancelled guidance request ${requestId}`);
    }
    /**
     * Get count of pending requests.
     *
     * @returns Number of pending guidance requests
     */
    getPendingCount() {
        return this.pendingRequests.size;
    }
    /**
     * Check if has pending request.
     *
     * @param requestId - Request ID to check
     * @returns true if request is pending
     */
    isPending(requestId) {
        return this.pendingRequests.has(requestId);
    }
}
/**
 * Convenience function to create guidance request manager.
 *
 * @param agentId - This agent's ID
 * @param mqttClient - MQTT client for publishing requests
 * @param options - Optional configuration
 * @returns GuidanceRequest instance
 */
export function createGuidanceRequest(agentId, mqttClient, options) {
    return new GuidanceRequest(agentId, mqttClient, options);
}
//# sourceMappingURL=guidance.js.map