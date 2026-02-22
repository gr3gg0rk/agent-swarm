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
export class AgentCircuitBreaker {
  private state: CircuitBreakerState;
  private rejectionThreshold: number;
  private openTimeoutMs: number;

  constructor(agentId: string, options: CircuitBreakerOptions = {}) {
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
  getState(): CircuitBreakerState {
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
  canAcceptTask(): boolean {
    const current = this.getState();
    return current.state !== 'open';
  }

  /**
   * Record a task rejection.
   *
   * Transitions to Open if threshold exceeded.
   */
  recordRejection(): void {
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
  recordSuccess(): void {
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
  private transitionTo(newState: 'closed' | 'open' | 'half-open'): void {
    console.log(
      `Circuit breaker ${this.state.agentId}: ${this.state.state} -> ${newState} ` +
      `(rejections: ${this.state.consecutiveRejections})`
    );

    this.state.state = newState;
    this.state.lastStateChange = Date.now();

    // Set next retry time when entering Open state
    if (newState === 'open') {
      this.state.nextRetryTime = Date.now() + this.openTimeoutMs;
    } else {
      this.state.nextRetryTime = undefined;
    }
  }

  /**
   * Reset circuit breaker to Closed state.
   *
   * Useful for testing or manual recovery.
   */
  reset(): void {
    this.transitionTo('closed');
    this.state.consecutiveRejections = 0;
  }
}

/**
 * Registry of circuit breakers for all agents.
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, AgentCircuitBreaker>;

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
  get(agentId: string, options?: CircuitBreakerOptions): AgentCircuitBreaker {
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
  remove(agentId: string): void {
    this.breakers.delete(agentId);
  }

  /**
   * Get all circuit breaker states.
   *
   * @returns Map of agent ID to state
   */
  getAllStates(): Map<string, CircuitBreakerState> {
    const states = new Map<string, CircuitBreakerState>();

    for (const [agentId, breaker] of this.breakers) {
      states.set(agentId, breaker.getState());
    }

    return states;
  }
}

/**
 * Factory function to create circuit breaker registry.
 */
export function createCircuitBreakerRegistry(): CircuitBreakerRegistry {
  return new CircuitBreakerRegistry();
}
