/**
 * Role-Based Task Router with Hierarchical Fallback
 *
 * Matches tasks to agents based on role requirements with hierarchical fallback.
 * Higher-level roles can perform tasks of lower-level roles (e.g., senior-builder
 * can do builder tasks).
 *
 * Per CONTEXT.md: Hierarchical roles allow flexible fallback (senior-builder -> builder)
 * Per TASK-02: Minerva can delegate task to any agent with a specific role
 * Per ROUT-01: Selects least-loaded agent using heartbeat CPU/memory data
 * Per ROUT-03: Weighted scoring (70% load + 30% historical performance)
 *
 * @see 03-RESEARCH.md Pattern 2: Role-Based Routing with Hierarchical Fallback
 */
import type { AgentRegistration } from '../discovery/types.js';
import type { LoadMetrics, AgentWithCapacity, AgentWithLoadMetrics, ScoringWeights } from './types.js';
import type { PerformanceStore } from './performance-store.js';
import { type RoleHierarchy } from './types.js';
export type { AgentWithCapacity } from './types.js';
/**
 * Circuit breaker interface for agent filtering.
 *
 * Will be implemented in 06-03 (Circuit Breaker).
 * For now, optional in router options.
 */
export interface CircuitBreakerStateFilter {
    canAcceptTask(): boolean;
}
/**
 * Task router options.
 */
export interface RouterOptions {
    /** Custom role hierarchy (defaults to DEFAULT_ROLE_HIERARCHY) */
    roleHierarchy?: RoleHierarchy;
    /** Performance store for historical data (optional, for ROUT-03) */
    performanceStore?: PerformanceStore;
    /** Circuit breaker registry (optional, for 06-03) */
    circuitBreakers?: {
        get(agentId: string): CircuitBreakerStateFilter | undefined;
    };
    /** Custom scoring weights (defaults to DEFAULT_SCORING_WEIGHTS) */
    scoringWeights?: Partial<ScoringWeights>;
}
/**
 * Role-based task router with hierarchical fallback.
 *
 * Implements smart agent selection based on:
 * 1. Role compatibility (with hierarchical fallback)
 * 2. Capability requirements (optional)
 * 3. Current load (least-loaded first)
 * 4. Historical performance (weighted scoring per ROUT-03)
 *
 * @example
 * ```ts
 * const router = new TaskRouter();
 * const agents: AgentWithLoadMetrics[] = await getAvailableAgents();
 * const target = router.findAgentForTask(agents, 'builder', 'typescript');
 * if (target) {
 *   await delegateTask(task, target.agentId);
 * }
 * ```
 */
export declare class TaskRouter {
    private roleHierarchy;
    private performanceStore?;
    private circuitBreakers?;
    private scoringWeights;
    constructor(options?: RouterOptions);
    /**
     * Find available agent for a task by role with load-aware scoring.
     *
     * Per ROUT-01: Selects least-loaded agent matching required capability using heartbeat data.
     * Per ROUT-03: Weighted scoring (70% load + 30% historical performance).
     *
     * Implementation:
     * 1. Filter agents by role, capability, capacity, and circuit breaker state
     * 2. Calculate composite score for each eligible agent
     * 3. Return agent with highest score
     *
     * @param agents - Available agents (with or without load metrics)
     * @param requiredRole - Minimum role level required for task
     * @param requiredCapability - Optional specific capability required
     * @returns Best matching agent or null if no eligible agent found
     */
    findAgentForTask<T extends AgentWithCapacity>(agents: T[], requiredRole: string, requiredCapability?: string): T | null;
    /**
     * Calculate composite score for an agent.
     *
     * Per ROUT-03: 70% load score + 30% performance score.
     *
     * @param agent - Agent (with or without load metrics)
     * @returns Composite score (0-100, higher is better)
     */
    private calculateCompositeScore;
    /**
     * Calculate load score for an agent.
     *
     * Combines CPU (40%), memory (40%), and task ratio (20%).
     * Lower load = higher score (inverted).
     * If no load metrics available, uses task ratio only.
     *
     * Per ROUT-01: Uses heartbeat CPU/memory data.
     *
     * @param agent - Agent (with or without load metrics)
     * @returns Load score (0-100, higher is better)
     */
    private calculateLoadScore;
    /**
     * Calculate performance score for an agent.
     *
     * Combines success rate (70%) and execution time (30%).
     * Returns 50 (neutral) if no performance history available.
     *
     * Per ROUT-03: Uses historical performance for 30% of composite score.
     *
     * @param agentId - Agent ID to query
     * @returns Performance score (0-100, higher is better)
     */
    private calculatePerformanceScore;
    /**
     * Convert LoadMetrics to AgentWithLoadMetrics for routing.
     *
     * Called by TaskDelegator when load metrics received via MQTT.
     *
     * @param registration - Agent registration from discovery
     * @param metrics - Load metrics from heartbeat
     * @param currentTasks - Current active task count from TaskQueue
     * @returns Agent with load metrics
     */
    createAgentWithLoad(registration: AgentRegistration, metrics: LoadMetrics, currentTasks: number): AgentWithLoadMetrics;
    /**
     * Get numeric level for a role name.
     *
     * @param role - Role name (e.g., 'builder', 'senior-builder')
     * @returns Numeric level (higher = more senior) or 0 if unknown
     */
    getRoleLevel(role: string): number;
    /**
     * Check if an agent can perform a task based on role.
     *
     * @param agentRole - Agent's role
     * @param requiredRole - Required role for task
     * @returns true if agent role level >= required role level
     */
    canDoTask(agentRole: string, requiredRole: string): boolean;
    /**
     * Filter agents by role level.
     *
     * @param agents - All agents
     * @param minRole - Minimum role level required
     * @returns Agents with role level >= minRole
     */
    filterByRole(agents: AgentWithCapacity[], minRole: string): AgentWithCapacity[];
    /**
     * Filter agents by capability.
     *
     * @param agents - All agents
     * @param capability - Required capability
     * @returns Agents with the specified capability
     */
    filterByCapability(agents: AgentWithCapacity[], capability: string): AgentWithCapacity[];
    /**
     * Get agents with available capacity.
     *
     * @param agents - All agents
     * @returns Agents with currentTasks < maxCapacity
     */
    filterByCapacity(agents: AgentWithCapacity[]): AgentWithCapacity[];
}
/**
 * Convenience function to create task router with default options.
 *
 * @param options - Optional router configuration
 * @returns TaskRouter instance
 */
export declare function createTaskRouter(options?: RouterOptions): TaskRouter;
//# sourceMappingURL=router.d.ts.map