/**
 * Circuit Breaker for Agent Routing
 *
 * Per ROUT-06: Router stops routing to agent after 3 consecutive rejections.
 * Per RESEARCH.md Pattern 2: Circuit breaker with Closed/Open/Half-Open states.
 *
 * Prevents routing to agents that repeatedly reject tasks.
 */
/**
 * Circuit breaker for a single agent.
 *
 * States:
 * - Closed: Normal routing, rejections tracked
 * - Open: Stop routing, after threshold rejections
 * - Half-Open: Test with 1 task, close if success
 */
export class AgentCircuitBreaker {
    state;
    rejectionThreshold;
    openTimeoutMs;
    constructor(agentId, options = {}) {
        this.rejectionThreshold = options.rejectionThreshold || 3;
        this.openTimeoutMs = options.openTimeoutMs || 60000; // 60 seconds
        this.state = {
            agentId,
            state: 'closed',
            consecutiveRejections: 0,
            lastStateChange: Date.now(),
        };
    }
    /**
     * Get current circuit breaker state.
     */
    getState() {
        // Auto-transition from Open to Half-Open if timeout elapsed
        if (this.state.state === 'open' && this.state.nextRetryTime) {
            if (Date.now() >= this.state.nextRetryTime) {
                this.transitionTo('half-open');
            }
        }
        return { ...this.state };
    }
    /**
     * Check if agent can accept tasks.
     *
     * @returns true if circuit is Closed or Half-Open
     */
    canAcceptTask() {
        const current = this.getState();
        return current.state !== 'open';
    }
    /**
     * Record a task rejection.
     *
     * Transitions to Open if threshold exceeded.
     */
    recordRejection() {
        this.state.consecutiveRejections++;
        if (this.state.consecutiveRejections >= this.rejectionThreshold) {
            this.transitionTo('open');
        }
    }
    /**
     * Record a successful task completion.
     *
     * Resets rejection count and closes circuit if in Half-Open.
     */
    recordSuccess() {
        const wasHalfOpen = this.state.state === 'half-open';
        this.state.consecutiveRejections = 0;
        if (wasHalfOpen) {
            this.transitionTo('closed');
        }
    }
    /**
     * Transition to new state.
     *
     * @param newState - State to transition to
     */
    transitionTo(newState) {
        console.log(`Circuit breaker ${this.state.agentId}: ${this.state.state} -> ${newState} ` +
            `(rejections: ${this.state.consecutiveRejections})`);
        this.state.state = newState;
        this.state.lastStateChange = Date.now();
        // Set next retry time when entering Open state
        if (newState === 'open') {
            this.state.nextRetryTime = Date.now() + this.openTimeoutMs;
        }
        else {
            this.state.nextRetryTime = undefined;
        }
    }
    /**
     * Reset circuit breaker to Closed state.
     *
     * Useful for testing or manual recovery.
     */
    reset() {
        this.transitionTo('closed');
        this.state.consecutiveRejections = 0;
    }
}
/**
 * Registry of circuit breakers for all agents.
 */
export class CircuitBreakerRegistry {
    breakers;
    constructor() {
        this.breakers = new Map();
    }
    /**
     * Get or create circuit breaker for an agent.
     *
     * @param agentId - Agent ID
     * @param options - Optional configuration for new breaker
     * @returns AgentCircuitBreaker instance
     */
    get(agentId, options) {
        let breaker = this.breakers.get(agentId);
        if (!breaker) {
            breaker = new AgentCircuitBreaker(agentId, options);
            this.breakers.set(agentId, breaker);
        }
        return breaker;
    }
    /**
     * Remove circuit breaker for an agent.
     *
     * Called when agent goes offline.
     *
     * @param agentId - Agent ID
     */
    remove(agentId) {
        this.breakers.delete(agentId);
    }
    /**
     * Get all circuit breaker states.
     *
     * @returns Map of agent ID to state
     */
    getAllStates() {
        const states = new Map();
        for (const [agentId, breaker] of this.breakers) {
            states.set(agentId, breaker.getState());
        }
        return states;
    }
}
/**
 * Factory function to create circuit breaker registry.
 */
export function createCircuitBreakerRegistry() {
    return new CircuitBreakerRegistry();
}
//# sourceMappingURL=circuit-breaker.js.map