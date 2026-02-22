/**
 * MQTT Topic Hierarchy
 *
 * Per RESEARCH.md Pattern 2: Structured topic naming enabling targeted messaging,
 * broadcasting, and wildcard subscriptions.
 *
 * CRITICAL: Never start topics with `/` (RESEARCH.md Anti-Patterns).
 */
/**
 * Topic factory functions for agent communication.
 */
export const Topics = {
    /** Agent-specific base topic */
    agent: (agentId) => `agent/${agentId}`,
    /** Direct command channel for an agent (subscribe: worker) */
    agentCommand: (agentId) => `agent/${agentId}/command`,
    /** Result channel from an agent (subscribe: orchestrator) */
    agentResult: (agentId) => `agent/${agentId}/result`,
    /** Error channel from an agent (subscribe: orchestrator) */
    agentError: (agentId) => `agent/${agentId}/error`,
    /** Swarm-wide discovery broadcast */
    swarmDiscovery: 'swarm/discovery',
    /** Individual agent discovery with retained message (DISC-03) */
    agentDiscovery: (agentId) => `swarm/agents/${agentId}`,
    /** Swarm-wide status broadcast */
    swarmStatus: 'swarm/status',
    /** System-wide events */
    swarmEvents: 'swarm/events',
    /** Response topic for request-reply pattern */
    response: (agentId) => `agent/${agentId}/response`,
    /** Agent heartbeat topic (STAT-01) */
    agentHeartbeat: (agentId) => `agent/${agentId}/heartbeat`,
    /** Task command to agent (subscribe: worker) - TASK-01 */
    taskCommand: (agentId) => `agent/${agentId}/command`,
    /** Task result from agent (subscribe: orchestrator) - TASK-03 */
    taskResult: (agentId) => `agent/${agentId}/result`,
    /** Task progress from agent (subscribe: orchestrator) - STAT-02 */
    taskProgress: (agentId) => `agent/${agentId}/progress`,
    /** Task cancellation to agent (subscribe: worker) - TASK-05 */
    taskCancel: (agentId) => `agent/${agentId}/cancel`,
    /** Guidance request to Minerva (subscribe: orchestrator) - ERRO-05 */
    guidanceRequest: () => 'swarm/guidance/request',
    /** Guidance response from Minerva (subscribe: requesting agent) - ERRO-05 */
    guidanceResponse: (agentId) => `agent/${agentId}/guidance`,
};
/**
 * Subscription patterns for wildcard topic matching.
 */
export const Subscriptions = {
    /** All worker results (orchestrator subscribes here) */
    allWorkersResults: 'agent/+/result',
    /** All worker progress (orchestrator subscribes here) */
    allWorkersProgress: 'agent/+/progress',
    /** All worker commands (for debugging/testing) */
    allWorkerCommands: 'agent/+/command',
    /** Worker's own command channel */
    workerCommands: (agentId) => `agent/${agentId}/command`,
    /** All discovery broadcasts */
    allAgents: 'swarm/discovery',
    /** All agent registrations (retained messages) */
    agentStates: 'swarm/agents/#',
};
/**
 * Task delegation subscription patterns for wildcard topic matching.
 * Used for subscribing to task-related messages from all agents.
 */
export const TaskDelegationPatterns = {
    /** All task commands (for monitoring) */
    allCommands: 'agent/+/command',
    /** All task results (orchestrator subscribes here) */
    allResults: 'agent/+/result',
    /** All task progress (orchestrator subscribes here) */
    allProgress: 'agent/+/progress',
    /** All task cancellations (for monitoring) */
    allCancels: 'agent/+/cancel',
};
//# sourceMappingURL=topics.js.map