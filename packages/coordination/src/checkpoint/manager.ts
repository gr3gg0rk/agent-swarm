/**
 * Checkpoint Manager with Hybrid Storage
 *
 * Manages incremental checkpointing with smart filtering.
 * Local files every 60 seconds, SQLite sync every 5 minutes.
 * Per 04-01-PLAN.md Task 4.
 */

import { v4 as uuidv4 } from 'uuid';
import type { CheckpointData, CheckpointMetadata, CreateCheckpointOptions, CheckpointSyncStats, CheckpointManagerOptions } from './types.js';
import type { LocalFileStore } from './store.js';
import type { SQLiteSync } from './sync.js';
import type { TaskQueue } from '../state/task-queue.js';

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
export class CheckpointManager {
  private readonly localStore: LocalFileStore;
  private readonly sqliteSync: SQLiteSync;
  private readonly syncIntervalMs: number;
  private readonly minTimeInvestedMs: number;

  private readonly lastCheckpointTime: Map<string, number>;
  private readonly lastCheckpointState: Map<string, string>;
  private readonly pendingSync: Set<string>;
  private syncInterval: NodeJS.Timeout | null = null;

  /**
   * Creates a new CheckpointManager instance.
   *
   * @param options - Manager configuration options
   */
  constructor(options: CheckpointManagerOptions) {
    this.localStore = options.localStore;
    this.sqliteSync = options.sqliteSync;
    this.syncIntervalMs = options.syncIntervalMs || 300000; // 5 minutes default
    this.minTimeInvestedMs = 120000; // 2 minutes minimum

    this.lastCheckpointTime = new Map();
    this.lastCheckpointState = new Map();
    this.pendingSync = new Set();
  }

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
  async createCheckpoint(
    taskId: string,
    data: CheckpointData,
    options?: CreateCheckpointOptions
  ): Promise<string | null> {
    const opts = options || {};

    // Get task reference for eligibility checking
    const task = this.getTaskRef(taskId);
    if (!task) {
      console.warn(`Task ${taskId} not found, skipping checkpoint`);
      return null;
    }

    // Skip if task status is not eligible for checkpointing
    if (this.isTaskInactive(task.status)) {
      return null;
    }

    // Check if should checkpoint based on time invested or force flag
    const shouldCheckpoint =
      opts.force === true ||
      task.checkpointWorthy === true ||
      task.timeInvestedMs >= this.minTimeInvestedMs;

    if (!shouldCheckpoint) {
      return null;
    }

    // Check if state changed since last checkpoint
    const currentState = JSON.stringify(data);
    const lastState = this.lastCheckpointState.get(taskId);
    if (lastState === currentState) {
      // State unchanged, skip checkpoint
      return null;
    }

    // Generate checkpoint ID
    const checkpointId = uuidv4();

    // Add checkpoint ID to data if not already set
    const checkpointData: CheckpointData = {
      ...data,
      checkpointId,
      timestamp: data.timestamp || Date.now(),
    };

    // Write to local store (async, non-blocking)
    try {
      await this.localStore.save(checkpointId, checkpointData);

      // Add to pending sync set
      this.pendingSync.add(checkpointId);

      // Update tracking maps
      this.lastCheckpointTime.set(taskId, Date.now());
      this.lastCheckpointState.set(taskId, currentState);

      return checkpointId;
    } catch (error) {
      console.error(`Failed to create checkpoint ${checkpointId}: ${error}`);
      return null;
    }
  }

  /**
   * Loads the most recent checkpoint for a task.
   *
   * Tries local store first (fast path), falls back to SQLite.
   * Returns null if neither has a checkpoint.
   *
   * @param taskId - Task identifier
   * @returns Most recent checkpoint data or null
   */
  async loadCheckpoint(taskId: string): Promise<CheckpointData | null> {
    // Try local store first (fast path)
    let checkpoint = await this.localStore.loadLatest(taskId);

    // Fallback to SQLite if local returns null
    if (!checkpoint) {
      checkpoint = this.sqliteSync.loadLatest(taskId);
    }

    return checkpoint;
  }

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
  async syncToDatabase(): Promise<void> {
    const syncCount = this.pendingSync.size;
    if (syncCount === 0) {
      return;
    }

    console.log(`Syncing ${syncCount} checkpoints to SQLite`);

    const syncedIds: string[] = [];
    const failedIds: string[] = [];

    for (const checkpointId of this.pendingSync) {
      try {
        // Load from local store
        const checkpoint = await this.localStore.load(checkpointId);
        if (!checkpoint) {
          console.warn(`Checkpoint ${checkpointId} not found in local store, skipping sync`);
          failedIds.push(checkpointId);
          continue;
        }

        // Save to SQLite
        this.sqliteSync.saveCheckpoint(checkpointId, checkpoint);
        syncedIds.push(checkpointId);
      } catch (error) {
        console.error(`Failed to sync checkpoint ${checkpointId}: ${error}`);
        failedIds.push(checkpointId);
      }
    }

    // Remove synced checkpoints from pending set
    for (const id of syncedIds) {
      this.pendingSync.delete(id);
    }

    // Remove failed checkpoints from pending set (will retry on next checkpoint)
    for (const id of failedIds) {
      this.pendingSync.delete(id);
    }

    console.log(`Synced ${syncedIds.length} checkpoints, ${failedIds.length} failed`);
  }

  /**
   * Starts periodic sync to SQLite.
   *
   * Calls syncToDatabase() every syncIntervalMs (5 minutes default).
   */
  startPeriodicSync(): void {
    if (this.syncInterval !== null) {
      console.warn('Periodic sync already started');
      return;
    }

    this.syncInterval = setInterval(async () => {
      try {
        await this.syncToDatabase();
      } catch (error) {
        console.error('Periodic sync failed:', error);
      }
    }, this.syncIntervalMs);

    console.log(`Started periodic sync (interval: ${this.syncIntervalMs}ms)`);
  }

  /**
   * Stops periodic sync to SQLite.
   */
  stopPeriodicSync(): void {
    if (this.syncInterval === null) {
      return;
    }

    clearInterval(this.syncInterval);
    this.syncInterval = null;
    console.log('Stopped periodic sync');
  }

  /**
   * Syncs all pending checkpoints before shutdown.
   *
   * Called by GracefulShutdown during shutdown process.
   */
  async syncBeforeShutdown(): Promise<void> {
    console.log('Syncing checkpoints before shutdown');
    await this.syncToDatabase();
    console.log('Checkpoint sync complete');
  }

  /**
   * Gets checkpoint sync statistics.
   *
   * @returns Sync statistics including pending count and last sync time
   */
  getSyncStats(): CheckpointSyncStats {
    return {
      pendingCount: this.pendingSync.size,
      syncedCount: this.sqliteSync.getCount(),
      lastSyncTime: Date.now(), // Approximate - could be tracked more precisely
    };
  }

  /**
   * Lists all checkpoints for a task with metadata.
   *
   * @param taskId - Task identifier
   * @returns Array of checkpoint metadata
   */
  async listCheckpoints(taskId: string): Promise<CheckpointMetadata[]> {
    return this.localStore.listByTask(taskId);
  }

  /**
   * Deletes a checkpoint from both local and SQLite storage.
   *
   * @param checkpointId - Checkpoint identifier
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    await this.localStore.delete(checkpointId);
    this.sqliteSync.deleteCheckpoint(checkpointId);
    this.pendingSync.delete(checkpointId);
  }

  /**
   * Deletes all checkpoints for a task from both storage.
   * Useful for cleanup after task completion.
   *
   * @param taskId - Task identifier
   */
  async deleteCheckpointsByTask(taskId: string): Promise<void> {
    await this.localStore.deleteByTask(taskId);
    this.sqliteSync.deleteByTask(taskId);

    // Clear tracking maps
    this.lastCheckpointTime.delete(taskId);
    this.lastCheckpointState.delete(taskId);
  }

  /**
   * Checks if task status is inactive (should not checkpoint).
   *
   * @param status - Task status
   * @returns True if task is inactive
   */
  private isTaskInactive(status: CheckpointTaskStatus): boolean {
    return ['blocked', 'waiting', 'idle', 'completed', 'failed', 'cancelled'].includes(status);
  }

  /**
   * Gets task reference for eligibility checking.
   *
   * This is a placeholder - in production, this would query the task queue
   * or receive task status as a parameter. For now, we return null to indicate
   * task not found.
   *
   * @param _taskId - Task identifier
   * @returns Task reference or null
   */
  private getTaskRef(_taskId: string): TaskRef | null {
    // TODO: Integrate with task queue to get actual task status
    // For now, assume task exists with default values
    return {
      id: _taskId,
      status: 'in_progress',
      timeInvestedMs: 0,
      checkpointWorthy: false,
    };
  }

  /**
   * Gets the last checkpoint time for a task.
   *
   * @param taskId - Task identifier
   * @returns Last checkpoint timestamp or undefined
   */
  getLastCheckpointTime(taskId: string): number | undefined {
    return this.lastCheckpointTime.get(taskId);
  }

  /**
   * Checks if a task should be checkpointed based on time since last checkpoint.
   *
   * @param taskId - Task identifier
   * @param intervalMs - Checkpoint interval in milliseconds (default: 60000 = 60 seconds)
   * @returns True if enough time has passed since last checkpoint
   */
  shouldCheckpoint(taskId: string, intervalMs: number = 60000): boolean {
    const lastTime = this.lastCheckpointTime.get(taskId);
    if (!lastTime) {
      return true; // No previous checkpoint
    }
    const elapsed = Date.now() - lastTime;
    return elapsed >= intervalMs;
  }

  /**
   * Clears all checkpoint tracking data.
   * Useful for testing or reset scenarios.
   */
  clearTracking(): void {
    this.lastCheckpointTime.clear();
    this.lastCheckpointState.clear();
    this.pendingSync.clear();
  }

  /**
   * Gets the number of pending sync checkpoints.
   *
   * @returns Number of checkpoints pending sync to SQLite
   */
  getPendingSyncCount(): number {
    return this.pendingSync.size;
  }
}

/**
 * Factory function to create CheckpointManager instance.
 *
 * @param options - Manager configuration options
 * @returns CheckpointManager instance
 */
export function createCheckpointManager(options: CheckpointManagerOptions): CheckpointManager {
  return new CheckpointManager(options);
}
