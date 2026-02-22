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
