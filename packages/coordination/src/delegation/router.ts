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
import type { CircuitBreakerRegistry } from './circuit-breaker.js';
import { DEFAULT_ROLE_HIERARCHY, DEFAULT_SCORING_WEIGHTS, type RoleHierarchy } from './types.js';

// Re-export AgentWithCapacity for backward compatibility
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
export class TaskRouter {
  private roleHierarchy: RoleHierarchy;
  private performanceStore?: PerformanceStore;
  private circuitBreakers?: {
    get(agentId: string): CircuitBreakerStateFilter | undefined;
  };
  private scoringWeights: ScoringWeights;

  constructor(options: RouterOptions = {}) {
    this.roleHierarchy = options.roleHierarchy || DEFAULT_ROLE_HIERARCHY;
    this.performanceStore = options.performanceStore;
    this.circuitBreakers = options.circuitBreakers;
    this.scoringWeights = { ...DEFAULT_SCORING_WEIGHTS, ...options.scoringWeights };
  }

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
  findAgentForTask<T extends AgentWithCapacity>(
    agents: T[],
    requiredRole: string,
    requiredCapability?: string
  ): T | null {
    const requiredLevel = this.getRoleLevel(requiredRole);

    // Filter agents by role level, capability, capacity, and circuit breaker state
    const eligibleAgents = agents.filter(agent => {
      const agentLevel = this.getRoleLevel(agent.role);
      const roleMatch = agentLevel >= requiredLevel;
      const capabilityMatch = !requiredCapability || agent.capabilities.includes(requiredCapability);
      const hasCapacity = agent.currentTasks < agent.maxCapacity;

      // Check circuit breaker state (if available)
      let circuitClosed = true;
      if (this.circuitBreakers) {
        const breaker = this.circuitBreakers.get(agent.agentId);
        circuitClosed = !breaker || breaker.canAcceptTask();
      }

      return roleMatch && capabilityMatch && hasCapacity && circuitClosed;
    });

    if (eligibleAgents.length === 0) {
      return null;
    }

    // Calculate composite scores for all eligible agents
    const scoredAgents = eligibleAgents.map(agent => ({
      agent,
      score: this.calculateCompositeScore(agent),
    }));

    // Sort by score descending (highest score first)
    scoredAgents.sort((a, b) => b.score - a.score);

    return scoredAgents[0].agent;
  }

  /**
   * Calculate composite score for an agent.
   *
   * Per ROUT-03: 70% load score + 30% performance score.
   *
   * @param agent - Agent (with or without load metrics)
   * @returns Composite score (0-100, higher is better)
   */
  private calculateCompositeScore(agent: AgentWithCapacity): number {
    const loadScore = this.calculateLoadScore(agent);
    const performanceScore = this.calculatePerformanceScore(agent.agentId);

    const composite =
      loadScore * this.scoringWeights.load +
      performanceScore * this.scoringWeights.performance;

    return composite;
  }

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
  private calculateLoadScore(agent: AgentWithCapacity): number {
    // Task ratio (0-1, where 1 = at capacity)
    const taskRatio = agent.currentTasks / agent.maxCapacity;

    // Check if load metrics are available
    const hasLoadMetrics = 'cpuPercent' in agent && 'memoryPercent' in agent;

    if (!hasLoadMetrics) {
      // No load metrics - use task ratio only
      const loadScore = (1 - taskRatio) * 100;
      return Math.max(0, Math.min(100, loadScore));
    }

    const agentWithLoad = agent as AgentWithLoadMetrics;

    // CPU load (0-1, where 1 = 100% CPU)
    const cpuLoad = agentWithLoad.cpuPercent / 100;

    // Memory load (0-1, where 1 = 100% memory)
    const memLoad = agentWithLoad.memoryPercent / 100;

    // Combined load (weighted average)
    const combinedLoad =
      cpuLoad * this.scoringWeights.cpu +
      memLoad * this.scoringWeights.memory +
      taskRatio * this.scoringWeights.taskRatio;

    // Invert: higher score = less loaded
    const loadScore = (1 - combinedLoad) * 100;

    return Math.max(0, Math.min(100, loadScore));
  }

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
  private calculatePerformanceScore(agentId: string): number {
    if (!this.performanceStore) {
      // No performance store available - return neutral score
      return 50;
    }

    const history = this.performanceStore.getPerformanceHistory(agentId, 100);

    if (history.length === 0) {
      // No history for this agent - return neutral score
      return 50;
    }

    // Success rate (0-1)
    const successCount = history.filter(h => h.success).length;
    const successRate = successCount / history.length;

    // Average execution time
    const avgTime = history.reduce((sum, h) => sum + h.executionTime, 0) / history.length;

    // Expected execution time (2 minutes = default timeout)
    const expectedTime = 120000;

    // Time score: 100 if at or below expected, decreases for slower
    const timeRatio = avgTime / expectedTime;
    const timeScore = Math.max(0, 100 - (timeRatio - 1) * 50);

    // Weighted: 70% success, 30% speed
    const performanceScore =
      successRate * 100 * this.scoringWeights.successRate +
      timeScore * this.scoringWeights.executionTime;

    return Math.max(0, Math.min(100, performanceScore));
  }

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
  createAgentWithLoad(
    registration: AgentRegistration,
    metrics: LoadMetrics,
    currentTasks: number
  ): AgentWithLoadMetrics {
    return {
      ...registration,
      currentTasks,
      maxCapacity: metrics.maxCapacity,
      cpuPercent: metrics.cpuPercent,
      memoryPercent: metrics.memoryPercent,
      loadTimestamp: metrics.timestamp,
    };
  }

  /**
   * Get numeric level for a role name.
   *
   * @param role - Role name (e.g., 'builder', 'senior-builder')
   * @returns Numeric level (higher = more senior) or 0 if unknown
   */
  getRoleLevel(role: string): number {
    return this.roleHierarchy[role] || 0;
  }

  /**
   * Check if an agent can perform a task based on role.
   *
   * @param agentRole - Agent's role
   * @param requiredRole - Required role for task
   * @returns true if agent role level >= required role level
   */
  canDoTask(agentRole: string, requiredRole: string): boolean {
    const agentLevel = this.getRoleLevel(agentRole);
    const requiredLevel = this.getRoleLevel(requiredRole);
    return agentLevel >= requiredLevel;
  }

  /**
   * Filter agents by role level.
   *
   * @param agents - All agents
   * @param minRole - Minimum role level required
   * @returns Agents with role level >= minRole
   */
  filterByRole(agents: AgentWithCapacity[], minRole: string): AgentWithCapacity[] {
    const minLevel = this.getRoleLevel(minRole);
    return agents.filter(agent => this.getRoleLevel(agent.role) >= minLevel);
  }

  /**
   * Filter agents by capability.
   *
   * @param agents - All agents
   * @param capability - Required capability
   * @returns Agents with the specified capability
   */
  filterByCapability(agents: AgentWithCapacity[], capability: string): AgentWithCapacity[] {
    return agents.filter(agent => agent.capabilities.includes(capability));
  }

  /**
   * Get agents with available capacity.
   *
   * @param agents - All agents
   * @returns Agents with currentTasks < maxCapacity
   */
  filterByCapacity(agents: AgentWithCapacity[]): AgentWithCapacity[] {
    return agents.filter(agent => agent.currentTasks < agent.maxCapacity);
  }
}

/**
 * Convenience function to create task router with default options.
 *
 * @param options - Optional router configuration
 * @returns TaskRouter instance
 */
export function createTaskRouter(options?: RouterOptions): TaskRouter {
  return new TaskRouter(options);
}
