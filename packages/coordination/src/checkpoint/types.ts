/**
 * Checkpoint Types and Interfaces
 *
 * Defines the data structures for incremental checkpointing,
 * enabling agents to resume from last checkpoint after crash or restart.
 * Per 04-01-PLAN.md Task 1.
 */

import type { TaskQueue } from '../state/task-queue.js';

/**
 * Core checkpoint data stored locally and in SQLite.
 * Task-specific fields (workingContext, partialResults, resourceHandles)
 * use unknown type - each task type handles its own serialization.
 *
 * Per RESEARCH.md: Start with JSON for simplicity. Use MessagePack if checkpoint size >1KB.
 */
export interface CheckpointData {
  /** Unique task identifier */
  taskId: string;
  /** Agent that created this checkpoint */
  agentId: string;
  /** Unique checkpoint identifier (UUID v4) */
  checkpointId: string;
  /** Unix timestamp in milliseconds when checkpoint was created */
  timestamp: number;
  /** Task progress percentage (0-100) */
  progress: number;
  /** Task-specific working context (state, variables, etc.) */
  workingContext: unknown;
  /** Optional partial results for resumable tasks */
  partialResults?: unknown;
  /** Minimal resource handle representations (paths, IDs, not actual objects) */
  resourceHandles: unknown[];
  /** Total time invested in this task in milliseconds */
  timeInvestedMs: number;
  /** CRC32 checksum of checkpoint data (hex string, validated on recovery) */
  checksum?: string;
  /** Vector clock for cross-machine ordering (serialized VectorClock) */
  vectorClock?: object;
}

/**
 * Metadata for checkpoint listing and sync status tracking.
 */
export interface CheckpointMetadata {
  /** Unique checkpoint identifier */
  checkpointId: string;
  /** Task identifier this checkpoint belongs to */
  taskId: string;
  /** Unix timestamp in milliseconds when checkpoint was created */
  createdAt: number;
  /** Checkpoint size in bytes (for storage monitoring) */
  sizeBytes: number;
  /** Whether checkpoint is local-only or synced to SQLite */
  syncStatus: 'local' | 'synced';
}

/**
 * Result of task resume validation.
 * Determines whether to resume, restart, skip, or request guidance.
 */
export interface ResumeResult {
  /** True if resume is possible and validated */
  success: boolean;
  /** Action to take based on validation */
  action: 'resume' | 'restart' | 'skip' | 'request_guidance';
  /** Human-readable reason for the action */
  reason?: string;
  /** Checkpoint data if action is 'resume' */
  checkpoint?: CheckpointData;
}

/**
 * Options for checkpoint creation.
 * Controls filtering and sync behavior.
 */
export interface CreateCheckpointOptions {
  /** Bypass 2-minute filter and force checkpoint creation */
  force?: boolean;
  /** Sync to SQLite immediately instead of waiting for periodic sync */
  syncImmediate?: boolean;
}

/**
 * Internal tracking for checkpoint filtering decisions.
 * Not exported - used internally by CheckpointManager.
 */
interface CheckpointState {
  lastCheckpointTime: Map<string, number>;
  lastCheckpointState: Map<string, string>;
  pendingSync: Set<string>;
}

/**
 * Validation result for checkpoint integrity.
 * Used internally during resume operations.
 */
interface CheckpointValidation {
  /** True if checkpoint is valid and can be loaded */
  valid: boolean;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Sync statistics for monitoring.
 */
export interface CheckpointSyncStats {
  /** Number of checkpoints pending sync to SQLite */
  pendingCount: number;
  /** Number of checkpoints successfully synced */
  syncedCount: number;
  /** Timestamp of last successful sync */
  lastSyncTime: number;
}

/**
 * Configuration options for CheckpointManager.
 * Per 04-03-PLAN.md Task 1: Extended with optional TaskQueue dependency.
 * Per 08-02-PLAN.md Task 1: Extended with mqttClient and agentId for corruption alerts.
 */
export interface CheckpointManagerOptions {
  /** Local file store for 60-second checkpoints */
  localStore: import('./store.js').LocalFileStore;
  /** SQLite sync for 5-minute sync and cross-machine recovery */
  sqliteSync: import('./sync.js').SQLiteSync;
  /** Sync interval in milliseconds (default: 300000 = 5 minutes) */
  syncIntervalMs?: number;
  /** Optional TaskQueue for actual task status queries in getTaskRef() */
  taskQueue?: TaskQueue;
  /** Optional MQTT client for publishing corruption alerts (08-02) */
  mqttClient?: import('../communication/mqtt.js').MqttClient;
  /** Optional agent ID for alert from field (08-02) */
  agentId?: string;
}
