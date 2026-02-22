/**
 * Checkpoint Manager with Hybrid Storage
 *
 * Manages incremental checkpointing with smart filtering.
 * Local files every 60 seconds, SQLite sync every 5 minutes.
 * Per 04-01-PLAN.md Task 4.
 */
import type { CheckpointData, CheckpointMetadata, CreateCheckpointOptions, CheckpointSyncStats, CheckpointManagerOptions } from './types.js';
/**
 * Task status for checkpoint filtering decisions.
 * Renamed to CheckpointTaskStatus to avoid conflict with state module's TaskStatus.
 */
export type CheckpointTaskStatus = 'pending' | 'in_progress' | 'blocked' | 'waiting' | 'idle' | 'completed' | 'failed' | 'cancelled';
/**
 * Task reference for checkpoint eligibility checking.
 */
export interface TaskRef {
    /** Task identifier */
    id: string;
    /** Task status */
    status: CheckpointTaskStatus;
    /** Time invested in milliseconds */
    timeInvestedMs: number;
    /** Whether task is explicitly marked checkpoint-worthy */
    checkpointWorthy?: boolean;
}
/**
 * Checkpoint manager with hybrid storage and smart filtering.
 *
 * - Local file storage every 60 seconds for fast recovery
 * - SQLite sync every 5 minutes for cross-machine recovery
 * - Smart filtering: skip tasks <2 min duration unless force or checkpointWorthy
 * - State change detection: skip if state unchanged since last checkpoint
 * - Active-only checkpointing: skip if task is blocked, waiting, or idle
 *
 * Per CONTEXT.md: 60-second checkpoint interval when task state has changed.
 * Per CONTEXT.md: Sync triggers: agent shutdown (graceful or crash) AND periodic 5-minute timer.
 * Per 02-02-SUMMARY.md: Interval management similar to HeartbeatPublisher.
 */
export declare class CheckpointManager {
    private readonly localStore;
    private readonly sqliteSync;
    private readonly syncIntervalMs;
    private readonly minTimeInvestedMs;
    private readonly taskQueue?;
    private readonly lastCheckpointTime;
    private readonly lastCheckpointState;
    private readonly pendingSync;
    private syncInterval;
    /**
     * Creates a new CheckpointManager instance.
     *
     * @param options - Manager configuration options
     */
    constructor(options: CheckpointManagerOptions);
    /**
     * Creates a checkpoint for a task.
     *
     * Smart filtering logic:
     * - Skip if task status is blocked, waiting, idle, completed, failed, or cancelled
     * - Skip if task time invested <2 min unless force or checkpointWorthy
     * - Skip if state unchanged since last checkpoint (compare JSON)
     *
     * @param taskId - Task identifier
     * @param data - Checkpoint data
     * @param options - Optional checkpoint creation options
     * @returns Checkpoint ID if created, null if skipped
     */
    createCheckpoint(taskId: string, data: CheckpointData, options?: CreateCheckpointOptions): Promise<string | null>;
    /**
     * Loads the most recent checkpoint for a task.
     *
     * Tries local store first (fast path), falls back to SQLite.
     * Returns null if neither has a checkpoint.
     *
     * @param taskId - Task identifier
     * @returns Most recent checkpoint data or null
     */
    loadCheckpoint(taskId: string): Promise<CheckpointData | null>;
    /**
     * Syncs all pending checkpoints to SQLite.
     *
     * For each checkpoint in pendingSync set:
     * 1. Load from local store
     * 2. Save to SQLite
     * 3. Remove from pending sync
     *
     * Called every 5 minutes by periodic sync and before shutdown.
     */
    syncToDatabase(): Promise<void>;
    /**
     * Starts periodic sync to SQLite.
     *
     * Calls syncToDatabase() every syncIntervalMs (5 minutes default).
     */
    startPeriodicSync(): void;
    /**
     * Stops periodic sync to SQLite.
     */
    stopPeriodicSync(): void;
    /**
     * Syncs all pending checkpoints before shutdown.
     *
     * Called by GracefulShutdown during shutdown process.
     */
    syncBeforeShutdown(): Promise<void>;
    /**
     * Gets checkpoint sync statistics.
     *
     * @returns Sync statistics including pending count and last sync time
     */
    getSyncStats(): CheckpointSyncStats;
    /**
     * Lists all checkpoints for a task with metadata.
     *
     * @param taskId - Task identifier
     * @returns Array of checkpoint metadata
     */
    listCheckpoints(taskId: string): Promise<CheckpointMetadata[]>;
    /**
     * Deletes a checkpoint from both local and SQLite storage.
     *
     * @param checkpointId - Checkpoint identifier
     */
    deleteCheckpoint(checkpointId: string): Promise<void>;
    /**
     * Deletes all checkpoints for a task from both storage.
     * Useful for cleanup after task completion.
     *
     * @param taskId - Task identifier
     */
    deleteCheckpointsByTask(taskId: string): Promise<void>;
    /**
     * Checks if task status is inactive (should not checkpoint).
     *
     * @param status - Task status
     * @returns True if task is inactive
     */
    private isTaskInactive;
    /**
     * Gets task reference for eligibility checking.
     *
     * Queries TaskQueue for actual task status, enabling the 2-minute time filter
     * and state-change detection to work correctly.
     *
     * Per 04-03-PLAN.md Task 2: Replaces hardcoded TODO stub with TaskQueue integration.
     *
     * @param taskId - Task identifier
     * @returns Task reference or null if task not found or TaskQueue not provided
     */
    private getTaskRef;
    /**
     * Gets the last checkpoint time for a task.
     *
     * @param taskId - Task identifier
     * @returns Last checkpoint timestamp or undefined
     */
    getLastCheckpointTime(taskId: string): number | undefined;
    /**
     * Checks if a task should be checkpointed based on time since last checkpoint.
     *
     * @param taskId - Task identifier
     * @param intervalMs - Checkpoint interval in milliseconds (default: 60000 = 60 seconds)
     * @returns True if enough time has passed since last checkpoint
     */
    shouldCheckpoint(taskId: string, intervalMs?: number): boolean;
    /**
     * Clears all checkpoint tracking data.
     * Useful for testing or reset scenarios.
     */
    clearTracking(): void;
    /**
     * Gets the number of pending sync checkpoints.
     *
     * @returns Number of checkpoints pending sync to SQLite
     */
    getPendingSyncCount(): number;
}
/**
 * Factory function to create CheckpointManager instance.
 *
 * @param options - Manager configuration options
 * @returns CheckpointManager instance
 */
export declare function createCheckpointManager(options: CheckpointManagerOptions): CheckpointManager;
//# sourceMappingURL=manager.d.ts.map