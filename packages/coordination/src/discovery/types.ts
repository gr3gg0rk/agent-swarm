/**
 * Agent Discovery Types
 *
 * Defines agent registration types for MQTT-based agent discovery.
 * Agents register themselves using retained messages for crash recovery (DISC-03).
 * Agent roles are separate from agent IDs (CONTEXT.md locked decision).
 */

/**
 * Agent role determines the agent's function in the swarm.
 * Roles are separate from agent IDs - same role can be assigned to different agents.
 */
export type AgentRole = 'orchestrator' | 'worker';

/**
 * Agent registration information published to discovery topic.
 *
 * Per RESEARCH.md Pattern 3:
 * - Registration is persisted via retained MQTT messages (DISC-03)
 * - Includes capabilities for routing decisions (DISC-02)
 * - Contains hostname for cross-machine discovery (COMM-01)
 */
export interface AgentRegistration {
  /** Human-readable agent ID (e.g., 'minerva', 'worker-1', 'worker-2') */
  agentId: string;

  /** Agent role separate from ID (CONTEXT.md locked decision) */
  role: AgentRole;

  /** Capabilities for task routing (e.g., ['code', 'test', 'debug']) */
  capabilities: string[];

  /** Machine hostname (griak-brain, griak-server, griak-worker-1, griak-worker-2) */
  hostname: string;

  /** Optional IP for direct connectivity */
  ip?: string;

  /** Coordination layer version for compatibility checking */
  version: string;

  /** Startup timestamp (Unix milliseconds) */
  startedAt: number;
}
