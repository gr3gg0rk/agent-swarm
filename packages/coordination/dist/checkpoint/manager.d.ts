/**
 * Checkpoint Manager with Hybrid Storage
 *
 * Manages incremental checkpointing with smart filtering.
 * Local files every 60 seconds, SQLite sync every 5 minutes.
 * Per 04-01-PLAN.md Task 4.
 */
import type { CheckpointData, CheckpointMetadata, CreateCheckpointOptions, CheckpointSyncStats, CheckpointManagerOptions } from './types.js';
import { VectorClockImpl } from './vector-clock.js';
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
    private readonly mqttClient?;
    private readonly agentId?;
    private readonly contextManager?;
    private readonly vectorClock;
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
     * Loads a checkpoint with fallback to previous checkpoints on corruption.
     *
     * Tries up to 3 most recent checkpoints for a task, falling back on corruption.
     * When corruption is detected:
     * - Logs a warning
     * - Deletes the corrupted checkpoint from both local and SQLite
     * - Emits an MQTT alert event for monitoring
     * - Continues to the next checkpoint
     *
     * Per 08-02-PLAN.md Task 1: Fallback + alert on corruption detection.
     *
     * @param taskId - Task identifier
     * @returns Most recent valid checkpoint data or null if all checkpoints failed
     */
    loadCheckpointWithFallback(taskId: string): Promise<CheckpointData | null>;
    /**
     * Emits a corruption alert via MQTT for monitoring.
     *
     * Creates a MessageEnvelope with corruption details and publishes
     * to the 'swarm/alerts/checkpoint' topic with QoS 1.
     *
     * Per 08-02-PLAN.md Task 1: Alert format includes taskId, checkpointId, error, severity.
     *
     * @param taskId - Task identifier
     * @param checkpointId - Corrupted checkpoint identifier
     * @param error - Error that occurred during load
     */
    private emitCorruptionAlert;
    /**
     * Syncs all pending checkpoints to SQLite.
     *
     * For each checkpoint in pendingSync set:
     * 1. Load from local store
     * 2. Save to SQLite
     * 3. Remove from pending sync
     *
     * Called every 5 minutes by periodic sync and before shutdown.
     * Per 08-02-PLAN.md Task 2: Enforces 3-checkpoint retention policy after sync.
     */
    syncToDatabase(): Promise<void>;
    /**
     * Enforces 3-checkpoint retention policy for all tasks.
     *
     * Keeps 3 most recent checkpoints per task, deletes older ones from both
     * local and SQLite storage. Runs during periodic sync (5-minute interval).
     *
     * Per 08-CONTEXT.md: Keep 3 most recent checkpoints per task for fallback.
     * Per 08-RESEARCH.md: Uses existing SQLiteSync.deleteOldCheckpoints() method.
     */
    private enforceRetentionPolicy;
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
     * Cleans up all checkpoints for a completed task.
     *
     * This method should be called when a task reaches 'completed' status.
     * Deletes all checkpoints from both local and SQLite storage, and clears
     * tracking maps to free up resources.
     *
     * Per 08-CONTEXT.md: On task completion, delete all checkpoints (completed
     * tasks don't need recovery). This is the cleanest approach.
     *
     * Per 08-02-PLAN.md Task 3: Hook for future integration with task completion
     * handlers. The actual call to this method will be added when task completion
     * handlers are implemented.
     *
     * @param taskId - Task identifier
     */
    cleanupOnTaskCompletion(taskId: string): Promise<void>;
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
    /**
     * Merges a vector clock from another machine.
     *
     * Called when receiving checkpoints from other machines to maintain
     * causality across the distributed system. Takes MAX of each counter.
     *
     * Per 08-03-PLAN.md Task 4: Integration point for cross-machine clock sync.
     *
     * @param other - Serialized vector clock from remote checkpoint
     */
    mergeVectorClock(other: object): void;
    /**
     * Gets the vector clock for this manager instance.
     *
     * Useful for testing and debugging.
     *
     * @returns Current vector clock state
     */
    getVectorClock(): VectorClockImpl;
}
/**
 * Factory function to create CheckpointManager instance.
 *
 * @param options - Manager configuration options
 * @returns CheckpointManager instance
 */
export declare function createCheckpointManager(options: CheckpointManagerOptions): CheckpointManager;
//# sourceMappingURL=manager.d.ts.map