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
export declare const Topics: {
    /** Agent-specific base topic */
    readonly agent: (agentId: string) => string;
    /** Direct command channel for an agent (subscribe: worker) */
    readonly agentCommand: (agentId: string) => string;
    /** Result channel from an agent (subscribe: orchestrator) */
    readonly agentResult: (agentId: string) => string;
    /** Error channel from an agent (subscribe: orchestrator) */
    readonly agentError: (agentId: string) => string;
    /** Swarm-wide discovery broadcast */
    readonly swarmDiscovery: "swarm/discovery";
    /** Individual agent discovery with retained message (DISC-03) */
    readonly agentDiscovery: (agentId: string) => string;
    /** Swarm-wide status broadcast */
    readonly swarmStatus: "swarm/status";
    /** System-wide events */
    readonly swarmEvents: "swarm/events";
    /** Response topic for request-reply pattern */
    readonly response: (agentId: string) => string;
    /** Agent heartbeat topic (STAT-01) */
    readonly agentHeartbeat: (agentId: string) => string;
    /** Task command to agent (subscribe: worker) - TASK-01 */
    readonly taskCommand: (agentId: string) => string;
    /** Task result from agent (subscribe: orchestrator) - TASK-03 */
    readonly taskResult: (agentId: string) => string;
    /** Task progress from agent (subscribe: orchestrator) - STAT-02 */
    readonly taskProgress: (agentId: string) => string;
    /** Task cancellation to agent (subscribe: worker) - TASK-05 */
    readonly taskCancel: (agentId: string) => string;
    /** Guidance request to Minerva (subscribe: orchestrator) - ERRO-05 */
    readonly guidanceRequest: () => string;
    /** Guidance response from Minerva (subscribe: requesting agent) - ERRO-05 */
    readonly guidanceResponse: (agentId: string) => string;
    /** Agent load metrics (ROUT-02) - retained message for current load */
    readonly agentLoad: (agentId: string) => string;
    /** Batched progress messages (07-01) - high-frequency message batching */
    readonly batchProgress: "swarm/batch/progress";
    /** Batched heartbeat messages (07-01) - high-frequency message batching */
    readonly batchHeartbeat: "swarm/batch/heartbeat";
    /** Batched load metrics messages (07-01) - high-frequency message batching */
    readonly batchLoadMetrics: "swarm/batch/load_metrics";
    /** Batched task-related messages (07-01) - results and cancellations */
    readonly batchTasks: "swarm/batch/tasks";
    /** Batched status messages (07-01) - generic status updates */
    readonly batchStatus: "swarm/batch/status";
};
/**
 * Subscription patterns for wildcard topic matching.
 */
export declare const Subscriptions: {
    /** All worker results (orchestrator subscribes here) */
    readonly allWorkersResults: "agent/+/result";
    /** All worker progress (orchestrator subscribes here) */
    readonly allWorkersProgress: "agent/+/progress";
    /** All worker commands (for debugging/testing) */
    readonly allWorkerCommands: "agent/+/command";
    /** Worker's own command channel */
    readonly workerCommands: (agentId: string) => string;
    /** All discovery broadcasts */
    readonly allAgents: "swarm/discovery";
    /** All agent registrations (retained messages) */
    readonly agentStates: "swarm/agents/#";
    /** All agent load metrics (router subscribes here) */
    readonly allAgentLoads: "agent/+/load";
    /** All batched messages (for batch consumers) - 07-01 */
    readonly allBatches: "swarm/batch/#";
};
/**
 * Task delegation subscription patterns for wildcard topic matching.
 * Used for subscribing to task-related messages from all agents.
 */
export declare const TaskDelegationPatterns: {
    /** All task commands (for monitoring) */
    readonly allCommands: "agent/+/command";
    /** All task results (orchestrator subscribes here) */
    readonly allResults: "agent/+/result";
    /** All task progress (orchestrator subscribes here) */
    readonly allProgress: "agent/+/progress";
    /** All task cancellations (for monitoring) */
    readonly allCancels: "agent/+/cancel";
};
//# sourceMappingURL=topics.d.ts.map