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
  agent: (agentId: string): string => `agent/${agentId}`,

  /** Direct command channel for an agent (subscribe: worker) */
  agentCommand: (agentId: string): string => `agent/${agentId}/command`,

  /** Result channel from an agent (subscribe: orchestrator) */
  agentResult: (agentId: string): string => `agent/${agentId}/result`,

  /** Error channel from an agent (subscribe: orchestrator) */
  agentError: (agentId: string): string => `agent/${agentId}/error`,

  /** Swarm-wide discovery broadcast */
  swarmDiscovery: 'swarm/discovery',

  /** Individual agent discovery with retained message (DISC-03) */
  agentDiscovery: (agentId: string): string => `swarm/agents/${agentId}`,

  /** Swarm-wide status broadcast */
  swarmStatus: 'swarm/status',

  /** System-wide events */
  swarmEvents: 'swarm/events',

  /** Response topic for request-reply pattern */
  response: (agentId: string): string => `agent/${agentId}/response`,

  /** Agent heartbeat topic (STAT-01) */
  agentHeartbeat: (agentId: string): string => `agent/${agentId}/heartbeat`,

  /** Task command to agent (subscribe: worker) - TASK-01 */
  taskCommand: (agentId: string): string => `agent/${agentId}/command`,

  /** Task result from agent (subscribe: orchestrator) - TASK-03 */
  taskResult: (agentId: string): string => `agent/${agentId}/result`,

  /** Task progress from agent (subscribe: orchestrator) - STAT-02 */
  taskProgress: (agentId: string): string => `agent/${agentId}/progress`,

  /** Task cancellation to agent (subscribe: worker) - TASK-05 */
  taskCancel: (agentId: string): string => `agent/${agentId}/cancel`,

  /** Guidance request to Minerva (subscribe: orchestrator) - ERRO-05 */
  guidanceRequest: (): string => 'swarm/guidance/request',

  /** Guidance response from Minerva (subscribe: requesting agent) - ERRO-05 */
  guidanceResponse: (agentId: string): string => `agent/${agentId}/guidance`,
} as const;

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
  workerCommands: (agentId: string): string => `agent/${agentId}/command`,

  /** All discovery broadcasts */
  allAgents: 'swarm/discovery',

  /** All agent registrations (retained messages) */
  agentStates: 'swarm/agents/#',
} as const;

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
} as const;
