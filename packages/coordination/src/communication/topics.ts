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
} as const;

/**
 * Subscription patterns for wildcard topic matching.
 */
export const Subscriptions = {
  /** All worker results (orchestrator subscribes here) */
  allWorkersResults: 'agent/+/result',

  /** Worker's own command channel */
  workerCommands: (agentId: string): string => `agent/${agentId}/command`,

  /** All discovery broadcasts */
  allAgents: 'swarm/discovery',

  /** All agent registrations (retained messages) */
  agentStates: 'swarm/agents/#',
} as const;
