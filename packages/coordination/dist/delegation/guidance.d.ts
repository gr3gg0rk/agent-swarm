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
import type { MqttClient } from '../communication/mqtt.js';
/**
 * Guidance request payload.
 */
export interface GuidanceRequestPayload {
    /** Request ID for response matching */
    requestId: string;
    /** Task ID being executed when guidance needed */
    taskId: string;
    /** Agent ID requesting guidance */
    agentId: string;
    /** Situation description (what's ambiguous) */
    situation: string;
    /** Optional decision options for Minerva */
    options?: string[];
    /** Timestamp of request */
    timestamp: number;
}
/**
 * Guidance response payload.
 */
export interface GuidanceResponsePayload {
    /** Request ID this response matches */
    requestId: string;
    /** Task ID this guidance applies to */
    taskId: string;
    /** Guidance from Minerva */
    guidance: string;
    /** Selected option (if options were provided) */
    selectedOption?: string;
    /** Timestamp of response */
    timestamp: number;
}
/**
 * Guidance request options.
 */
export interface GuidanceRequestOptions {
    /** Response timeout in milliseconds (default: 30000ms) */
    responseTimeoutMs?: number;
}
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
export declare class GuidanceRequest {
    private agentId;
    private mqttClient;
    private pendingRequests;
    private responseTimeoutMs;
    /**
     * Creates a new guidance request manager.
     *
     * @param agentId - This agent's ID
     * @param mqttClient - MQTT client for publishing requests
     * @param options - Optional configuration
     */
    constructor(agentId: string, mqttClient: MqttClient, options?: GuidanceRequestOptions);
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
    requestGuidance(taskId: string, situation: string, options?: string[]): Promise<string>;
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
    provideGuidance(requestId: string, guidance: string, taskId: string): Promise<void>;
    /**
     * Set up response handler for guidance responses.
     *
     * Subscribes to agent/{id}/guidance topic and matches responses
     * to pending requests by requestId.
     *
     * Called in constructor.
     */
    private setupResponseHandler;
    /**
     * Handle incoming guidance response.
     *
     * Matches response to pending request and invokes callback.
     *
     * @param envelope - Received message envelope
     */
    private handleResponse;
    /**
     * Handle response timeout.
     *
     * Called when guidance request times out (30 seconds).
     * Logs warning and removes from pending requests.
     * Agent proceeds with default behavior or aborts.
     *
     * @param requestId - Request ID that timed out
     */
    private handleResponseTimeout;
    /**
     * Cancel pending guidance request.
     *
     * Useful when task completes or is cancelled.
     *
     * @param requestId - Request ID to cancel
     */
    cancelRequest(requestId: string): void;
    /**
     * Get count of pending requests.
     *
     * @returns Number of pending guidance requests
     */
    getPendingCount(): number;
    /**
     * Check if has pending request.
     *
     * @param requestId - Request ID to check
     * @returns true if request is pending
     */
    isPending(requestId: string): boolean;
}
/**
 * Convenience function to create guidance request manager.
 *
 * @param agentId - This agent's ID
 * @param mqttClient - MQTT client for publishing requests
 * @param options - Optional configuration
 * @returns GuidanceRequest instance
 */
export declare function createGuidanceRequest(agentId: string, mqttClient: MqttClient, options?: GuidanceRequestOptions): GuidanceRequest;
//# sourceMappingURL=guidance.d.ts.map