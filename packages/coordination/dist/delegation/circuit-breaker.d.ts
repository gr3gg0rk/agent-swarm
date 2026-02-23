/**
 * Circuit Breaker for Agent Routing
 *
 * Per ROUT-06: Router stops routing to agent after 3 consecutive rejections.
 * Per RESEARCH.md Pattern 2: Circuit breaker with Closed/Open/Half-Open states.
 *
 * Prevents routing to agents that repeatedly reject tasks.
 */
import type { CircuitBreakerState } from './types.js';
/**
 * Circuit breaker configuration.
 */
export interface CircuitBreakerOptions {
    /** Number of consecutive rejections before opening (default 3) */
    rejectionThreshold?: number;
    /** Timeout in Open state before Half-Open (default 60000ms) */
    openTimeoutMs?: number;
}
/**
 * Circuit breaker for a single agent.
 *
 * States:
 * - Closed: Normal routing, rejections tracked
 * - Open: Stop routing, after threshold rejections
 * - Half-Open: Test with 1 task, close if success
 */
export declare class AgentCircuitBreaker {
    private state;
    private rejectionThreshold;
    private openTimeoutMs;
    constructor(agentId: string, options?: CircuitBreakerOptions);
    /**
     * Get current circuit breaker state.
     */
    getState(): CircuitBreakerState;
    /**
     * Check if agent can accept tasks.
     *
     * @returns true if circuit is Closed or Half-Open
     */
    canAcceptTask(): boolean;
    /**
     * Record a task rejection.
     *
     * Transitions to Open if threshold exceeded.
     */
    recordRejection(): void;
    /**
     * Record a successful task completion.
     *
     * Resets rejection count and closes circuit if in Half-Open.
     */
    recordSuccess(): void;
    /**
     * Transition to new state.
     *
     * @param newState - State to transition to
     */
    private transitionTo;
    /**
     * Reset circuit breaker to Closed state.
     *
     * Useful for testing or manual recovery.
     */
    reset(): void;
}
/**
 * Registry of circuit breakers for all agents.
 */
export declare class CircuitBreakerRegistry {
    private breakers;
    constructor();
    /**
     * Get or create circuit breaker for an agent.
     *
     * @param agentId - Agent ID
     * @param options - Optional configuration for new breaker
     * @returns AgentCircuitBreaker instance
     */
    get(agentId: string, options?: CircuitBreakerOptions): AgentCircuitBreaker;
    /**
     * Remove circuit breaker for an agent.
     *
     * Called when agent goes offline.
     *
     * @param agentId - Agent ID
     */
    remove(agentId: string): void;
    /**
     * Get all circuit breaker states.
     *
     * @returns Map of agent ID to state
     */
    getAllStates(): Map<string, CircuitBreakerState>;
}
/**
 * Factory function to create circuit breaker registry.
 */
export declare function createCircuitBreakerRegistry(): CircuitBreakerRegistry;
//# sourceMappingURL=circuit-breaker.d.ts.map