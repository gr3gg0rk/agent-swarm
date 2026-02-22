/**
 * Role-Based Task Router with Hierarchical Fallback
 *
 * Matches tasks to agents based on role requirements with hierarchical fallback.
 * Higher-level roles can perform tasks of lower-level roles (e.g., senior-builder
 * can do builder tasks).
 *
 * Per CONTEXT.md: Hierarchical roles allow flexible fallback (senior-builder -> builder)
 * Per TASK-02: Minerva can delegate task to any agent with a specific role
 *
 * @see 03-RESEARCH.md Pattern 2: Role-Based Routing with Hierarchical Fallback
 */
import type { AgentRegistration } from '../discovery/types.js';
import { type RoleHierarchy } from './types.js';
/**
 * Extended agent registration for routing decisions.
 * Adds current task count and capacity information.
 */
export interface AgentWithCapacity extends AgentRegistration {
    /** Number of tasks currently assigned to this agent */
    currentTasks: number;
    /** Maximum number of concurrent tasks this agent can handle */
    maxCapacity: number;
}
/**
 * Task router options.
 */
export interface RouterOptions {
    /** Custom role hierarchy (defaults to DEFAULT_ROLE_HIERARCHY) */
    roleHierarchy?: RoleHierarchy;
}
/**
 * Role-based task router with hierarchical fallback.
 *
 * Implements smart agent selection based on:
 * 1. Role compatibility (with hierarchical fallback)
 * 2. Capability requirements (optional)
 * 3. Current load (least-loaded first)
 *
 * @example
 * ```ts
 * const router = new TaskRouter();
 * const agents: AgentWithCapacity[] = await getAvailableAgents();
 * const target = router.findAgentForTask(agents, 'builder', 'typescript');
 * if (target) {
 *   await delegateTask(task, target.agentId);
 * }
 * ```
 */
export declare class TaskRouter {
    private roleHierarchy;
    constructor(options?: RouterOptions);
    /**
     * Find available agent for a task by role.
     *
     * Implements hierarchical fallback: senior-builder can do builder tasks.
     * Sorts by: highest role level first, then least loaded (ascending currentTasks).
     *
     * @param agents - Available agents with capacity information
     * @param requiredRole - Minimum role level required for task
     * @param requiredCapability - Optional specific capability required
     * @returns Best matching agent or null if no eligible agent found
     */
    findAgentForTask(agents: AgentWithCapacity[], requiredRole: string, requiredCapability?: string): AgentWithCapacity | null;
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