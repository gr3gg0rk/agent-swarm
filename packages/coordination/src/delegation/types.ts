/**
 * Task Delegation Types
 *
 * Defines core types for task delegation, results, progress tracking,
 * and dependency management. Extends the existing TaskQueue schema
 * with fields for dependency tracking, timeout monitoring, and retry logic.
 *
 * Per 03-RESEARCH.md Pattern 1: Extended Task Schema with Dependencies.
 * Per CONTEXT.md decisions: Timeout with exponential backoff, DAG-based dependencies.
 */

// Import ContextReference from context-manager
import { ContextReference as ContextRef } from '../optimization/context-manager.js';

// Re-export for convenience
export type { ContextRef as ContextReference };

/**
 * Extended Task interface with dependency and retry tracking.
 *
 * Builds on existing Task from task-queue.ts with new fields for:
 * - Dependency tracking (TASK-06)
 * - Timeout monitoring (TASK-04)
 * - Retry logic with exponential backoff (ERRO-01)
 * - Progress tracking (STAT-02)
 * - Error classification (ERRO-02)
 * - Memory throttling (HARD-04, Phase 4 Plan 02)
 */
export interface Task {
  /** Unique task ID (UUID) */
  id: string;
  /** Current task status (includes 'paused' for memory throttling) */
  status: 'pending' | 'in_progress' | 'paused' | 'completed' | 'failed' | 'cancelled';
  /** Task priority (higher = more important) */
  priority: number;
  /** Agent ID assigned to this task (if any) */
  assignedAgent?: string;
  /** Creation timestamp (Unix seconds) */
  createdAt: number;
  /** Last update timestamp (Unix seconds) */
  updatedAt: number;
  /** Completion timestamp (if completed) */
  completedAt?: number;
  /** Optional task payload (JSON string) */
  payload?: string;

  // New fields for Phase 3: Task Delegation

  /** Task IDs that must complete first (TASK-06) */
  dependencies?: string[];
  /** Per-task timeout override in milliseconds (TASK-04, default: 120000ms) */
  timeoutMs?: number;
  /** Current retry attempt (ERRO-01) */
  retryCount?: number;
  /** Per-task retry limit (ERRO-01, default: 3) */
  maxRetries?: number;
  /** Timestamp of last progress update (STAT-02) */
  lastProgressAt?: number;
  /** Structured result data as JSON string (TASK-03) */
  resultPayload?: string;
  /** Error classification for retry decisions (ERRO-02) */
  errorType?: 'transient' | 'permanent';
}

/**
 * Task result returned by agent after execution.
 *
 * Per TASK-03: Tasks include structured JSON output.
 * Per CONTEXT.md: Keep partial results for failed tasks.
 */
export interface TaskResult {
  /** Task ID this result belongs to */
  taskId: string;
  /** Whether task execution succeeded */
  success: boolean;
  /** Structured result data (if successful) */
  result?: unknown;
  /** Partial results for failed tasks (CONTEXT.md decision) */
  partialResult?: unknown;
  /** Error details (if failed) */
  error?: {
    /** Error type for retry decision (ERRO-02) */
    type: 'transient' | 'permanent';
    /** Human-readable error message */
    message: string;
    /** Optional error code for programmatic handling */
    code?: string;
    /** Stack trace for debugging */
    stack?: string;
  };
  /** Completion timestamp (Unix seconds) */
  completedAt: number;
  /** Execution time in milliseconds */
  executionTime: number;
}

/**
 * Task progress update during execution.
 *
 * Per STAT-02: Agents publish progress updates when working on long-running tasks.
 * Per CONTEXT.md: Periodic updates every 30s or 10% milestone.
 */
export interface TaskProgress {
  /** Task ID this progress update belongs to */
  taskId: string;
  /** Agent ID sending the update */
  agentId: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Human-readable status message */
  message?: string;
  /** Update timestamp (Unix seconds) */
  timestamp: number;
}

/**
 * Task command payload sent to agent.
 *
 * Per TASK-01: Minerva can delegate task to specific agent by ID.
 * Per TASK-02: Minerva can delegate task to any agent with specific role.
 */
export interface TaskCommandPayload {
  /** Task ID to execute */
  taskId: string;
  /** Task-specific data */
  payload: unknown;
  /** Task IDs that must complete first (TASK-06) */
  dependencies?: string[];
  /** Per-task timeout in milliseconds (TASK-04) */
  timeoutMs: number;
  /** Per-task retry limit (ERRO-01, default: 3) */
  maxRetries?: number;
}

/**
 * Task creation parameters (without auto-generated fields).
 *
 * Used for creating new tasks without specifying system-generated IDs.
 */
export type TaskCreate = Omit<Task, 'id' | 'createdAt' | 'updatedAt'>;

/**
 * Role hierarchy for task routing with hierarchical fallback.
 *
 * Per CONTEXT.md: Hierarchical roles allow flexible fallback (senior-builder -> builder).
 * Higher numeric values can perform tasks of lower values.
 */
export interface RoleHierarchy {
  /** Role name (e.g., 'orchestrator', 'builder') */
  [roleName: string]: number;
}

/**
 * Default role hierarchy levels.
 *
 * Orchestrator at top (100) can do anything.
 * Senior roles (60) can do standard roles (50).
 * Worker at bottom (30) is most restricted.
 */
export const DEFAULT_ROLE_HIERARCHY: RoleHierarchy = {
  'orchestrator': 100,
  'senior-builder': 60,
  'builder': 50,
  'debugger': 50,
  'tester': 40,
  'worker': 30,
};

/**
 * Default timeout in milliseconds (2 minutes per TASK-04).
 */
export const DEFAULT_TIMEOUT_MS = 120000;

/**
 * Load metrics published by agents for routing decisions.
 *
 * Per ROUT-02: Workers report load metrics (CPU, memory, active task count) every 5 seconds.
 * Per ROUT-04: 85% threshold for overload detection.
 */
export interface LoadMetrics {
  /** Agent ID reporting metrics */
  agentId: string;
  /** CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Memory usage percentage (0-100) */
  memoryPercent: number;
  /** Number of currently active tasks */
  activeTasks: number;
  /** Maximum concurrent task capacity */
  maxCapacity: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Default retry limit (ERRO-01).
 */
export const DEFAULT_MAX_RETRIES = 3;

/**
 * Extended agent registration for routing decisions.
 * Adds current task count and capacity information.
 */
export interface AgentWithCapacity {
  /** Agent ID */
  agentId: string;
  /** Agent role */
  role: string;
  /** Agent capabilities */
  capabilities: string[];
  /** Number of tasks currently assigned to this agent */
  currentTasks: number;
  /** Maximum number of concurrent tasks this agent can handle */
  maxCapacity: number;
}

/**
 * Performance record for historical task execution tracking.
 *
 * Per ROUT-03: Router uses 30% historical performance in weighted scoring.
 */
export interface PerformanceRecord {
  /** Task ID */
  taskId: string;
  /** Agent ID that executed task */
  agentId: string;
  /** Whether task succeeded */
  success: boolean;
  /** Execution time in milliseconds */
  executionTime: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Agent with load metrics for routing decisions.
 *
 * Extends AgentWithCapacity with real-time load metrics from retained MQTT messages.
 */
export interface AgentWithLoadMetrics extends AgentWithCapacity {
  /** Current CPU usage percentage (0-100) */
  cpuPercent: number;
  /** Current memory usage percentage (0-100) */
  memoryPercent: number;
  /** Timestamp of last load metrics update */
  loadTimestamp: number;
}

/**
 * Scoring weights for load-based routing.
 *
 * Per ROUT-03: 70% load score + 30% historical performance.
 */
export interface ScoringWeights {
  /** Weight for load score (0-1, default 0.7) */
  load: number;
  /** Weight for performance score (0-1, default 0.3) */
  performance: number;
  /** CPU weight within load score (0-1, default 0.4) */
  cpu: number;
  /** Memory weight within load score (0-1, default 0.4) */
  memory: number;
  /** Task ratio weight within load score (0-1, default 0.2) */
  taskRatio: number;
  /** Success rate weight within performance score (0-1, default 0.7) */
  successRate: number;
  /** Execution time weight within performance score (0-1, default 0.3) */
  executionTime: number;
}

/**
 * Default scoring weights per ROUT-03.
 */
export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  load: 0.7,
  performance: 0.3,
  cpu: 0.4,
  memory: 0.4,
  taskRatio: 0.2,
  successRate: 0.7,
  executionTime: 0.3,
};

/**
 * Circuit breaker state per agent.
 *
 * Per ROUT-06: Router stops routing to agent after 3 consecutive rejections.
 */
export interface CircuitBreakerState {
  /** Agent ID */
  agentId: string;
  /** Current state */
  state: 'closed' | 'open' | 'half-open';
  /** Number of consecutive rejections */
  consecutiveRejections: number;
  /** Unix timestamp of last state change (ms) */
  lastStateChange: number;
  /** When to transition from Open to Half-Open (ms) */
  nextRetryTime?: number;
}

/**
 * Task rejection payload.
 *
 * Per ROUT-04: Agents can reject tasks when overloaded.
 */
export interface TaskRejectedPayload {
  /** Task ID being rejected */
  taskId: string;
  /** Rejection reason */
  reason: 'overloaded' | 'no_capacity';
  /** CPU percentage at rejection time */
  cpuPercent: number;
  /** Memory percentage at rejection time */
  memoryPercent: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
}

/**
 * Extended task payload with context reference support.
 *
 * Per OPTI-05: Context payloads >10KB passed by reference ID instead of full content.
 * Per OPTI-06: Context manager stores large contexts in SQLite with hash-based deduplication.
 *
 * Tasks can include either inline context (small payloads) or context reference (large payloads).
 * The receiver uses ContextManager.getContext() to retrieve the full content.
 */
export interface TaskPayload {
  /** Task-specific data */
  payload?: unknown;
  /** Optional context - either inline content (small) or reference (large) */
  context?: {
    /** Inline context content (for small payloads <10KB) */
    content?: string | Buffer;
    /** Reference to stored context (for large payloads >=10KB) */
    ref?: ContextRef;
  };
}

/**
 * Context reference message type for notifying agents about stored context.
 *
 * Per OPTI-05: Context payloads larger than 10KB are passed by reference ID.
 *
 * When a task includes a context reference, the receiver may need to retrieve
 * the content from the context manager. This message type can be used for
 * context-related notifications.
 */
export interface ContextRefMessage {
  /** SHA-256 hash as hex string (64 characters) */
  ref: string;
  /** Original content size in bytes */
  size: number;
  /** Agent ID storing the context */
  agentId: string;
}
