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
import { DEFAULT_ROLE_HIERARCHY } from './types.js';
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
export class TaskRouter {
    roleHierarchy;
    constructor(options = {}) {
        this.roleHierarchy = options.roleHierarchy || DEFAULT_ROLE_HIERARCHY;
    }
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
    findAgentForTask(agents, requiredRole, requiredCapability) {
        const requiredLevel = this.getRoleLevel(requiredRole);
        // Filter agents by role level, capability, and capacity
        const eligibleAgents = agents.filter(agent => {
            const agentLevel = this.getRoleLevel(agent.role);
            const roleMatch = agentLevel >= requiredLevel;
            const capabilityMatch = !requiredCapability || agent.capabilities.includes(requiredCapability);
            const hasCapacity = agent.currentTasks < agent.maxCapacity;
            return roleMatch && capabilityMatch && hasCapacity;
        });
        if (eligibleAgents.length === 0) {
            return null;
        }
        // Sort by priority: highest role level first, then least loaded
        eligibleAgents.sort((a, b) => {
            const levelA = this.getRoleLevel(a.role);
            const levelB = this.getRoleLevel(b.role);
            // Higher role level first
            if (levelA !== levelB) {
                return levelB - levelA;
            }
            // Less loaded first (ascending currentTasks)
            return a.currentTasks - b.currentTasks;
        });
        return eligibleAgents[0];
    }
    /**
     * Get numeric level for a role name.
     *
     * @param role - Role name (e.g., 'builder', 'senior-builder')
     * @returns Numeric level (higher = more senior) or 0 if unknown
     */
    getRoleLevel(role) {
        return this.roleHierarchy[role] || 0;
    }
    /**
     * Check if an agent can perform a task based on role.
     *
     * @param agentRole - Agent's role
     * @param requiredRole - Required role for task
     * @returns true if agent role level >= required role level
     */
    canDoTask(agentRole, requiredRole) {
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
    filterByRole(agents, minRole) {
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
    filterByCapability(agents, capability) {
        return agents.filter(agent => agent.capabilities.includes(capability));
    }
    /**
     * Get agents with available capacity.
     *
     * @param agents - All agents
     * @returns Agents with currentTasks < maxCapacity
     */
    filterByCapacity(agents) {
        return agents.filter(agent => agent.currentTasks < agent.maxCapacity);
    }
}
/**
 * Convenience function to create task router with default options.
 *
 * @param options - Optional router configuration
 * @returns TaskRouter instance
 */
export function createTaskRouter(options) {
    return new TaskRouter(options);
}
//# sourceMappingURL=router.js.map