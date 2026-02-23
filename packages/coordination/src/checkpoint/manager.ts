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
import type { MqttClient } from '../communication/mqtt.js';
import type { MessageEnvelope } from '../communication/message.js';
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
export class CheckpointManager {
  private readonly localStore: LocalFileStore;
  private readonly sqliteSync: SQLiteSync;
  private readonly syncIntervalMs: number;
  private readonly minTimeInvestedMs: number;
  private readonly taskQueue?: TaskQueue;
  private readonly mqttClient?: MqttClient;
  private readonly agentId?: string;
  private readonly vectorClock: VectorClockImpl;

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
    this.taskQueue = options.taskQueue;
    this.mqttClient = options.mqttClient;
    this.agentId = options.agentId;

    // Initialize vector clock for cross-machine ordering
    this.vectorClock = new VectorClockImpl(options.agentId || 'unknown');

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

    // Tick vector clock before creating checkpoint
    const clock = this.vectorClock.tick();

    // Generate checkpoint ID
    const checkpointId = uuidv4();

    // Add checkpoint ID to data if not already set
    const checkpointData: CheckpointData = {
      ...data,
      checkpointId,
      timestamp: clock.timestamp, // Use vector clock timestamp
      vectorClock: this.vectorClock.toJSON(), // Include vector clock for cross-machine ordering
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
  async loadCheckpointWithFallback(taskId: string): Promise<CheckpointData | null> {
    // Get all checkpoint metadata for task
    const metadata = await this.localStore.listByTask(taskId);

    if (metadata.length === 0) {
      return null; // No checkpoints found
    }

    // Try each checkpoint from newest to oldest (max 3)
    const maxAttempts = Math.min(metadata.length, 3);
    for (let i = 0; i < maxAttempts; i++) {
      const checkpointId = metadata[i].checkpointId;

      try {
        const checkpoint = await this.localStore.load(checkpointId);
        if (checkpoint) {
          return checkpoint; // Success - found valid checkpoint
        }
      } catch (error) {
        // Corruption detected
        console.warn(`Checkpoint ${checkpointId} corrupted, trying fallback ${i + 1}/${maxAttempts}`);

        // Delete corrupted checkpoint immediately (per CONTEXT.md decision)
        try {
          await this.localStore.delete(checkpointId);
          this.sqliteSync.deleteCheckpoint(checkpointId);
        } catch (deleteError) {
          console.error(`Failed to delete corrupted checkpoint ${checkpointId}: ${deleteError}`);
        }

        // Emit MQTT alert event for monitoring
        this.emitCorruptionAlert(taskId, checkpointId, error);

        // Continue to next checkpoint
        continue;
      }
    }

    // All checkpoints failed
    return null;
  }

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
  private emitCorruptionAlert(taskId: string, checkpointId: string, error: unknown): void {
    if (!this.mqttClient) {
      // No MQTT client configured, just log and return
      console.warn(`Corruption detected for checkpoint ${checkpointId} (no MQTT client configured)`);
      return;
    }

    try {
      const alertEnvelope: MessageEnvelope = {
        messageId: uuidv4(),
        idempotencyKey: `corruption-${checkpointId}-${Date.now()}`,
        from: this.agentId || 'checkpoint-manager',
        type: 'error',
        timestamp: Date.now(),
        payload: {
          taskId,
          checkpointId,
          error: error instanceof Error ? error.message : String(error),
          severity: 'warning',
          action: 'fallback_to_previous_checkpoint'
        },
        qos: 1 // Must be delivered for monitoring
      };

      // Publish to alert topic
      this.mqttClient.publish('swarm/alerts/checkpoint', alertEnvelope).catch((publishError) => {
        console.error(`Failed to publish corruption alert: ${publishError}`);
      });
    } catch (alertError) {
      console.error(`Failed to create corruption alert: ${alertError}`);
    }
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
   * Per 08-02-PLAN.md Task 2: Enforces 3-checkpoint retention policy after sync.
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

    // Enforce 3-checkpoint retention policy (per 08-02-PLAN.md Task 2)
    await this.enforceRetentionPolicy();

    console.log(`Synced ${syncedIds.length} checkpoints, ${failedIds.length} failed, enforced retention`);
  }

  /**
   * Enforces 3-checkpoint retention policy for all tasks.
   *
   * Keeps 3 most recent checkpoints per task, deletes older ones from both
   * local and SQLite storage. Runs during periodic sync (5-minute interval).
   *
   * Per 08-CONTEXT.md: Keep 3 most recent checkpoints per task for fallback.
   * Per 08-RESEARCH.md: Uses existing SQLiteSync.deleteOldCheckpoints() method.
   */
  private async enforceRetentionPolicy(): Promise<void> {
    // Get all tasks with checkpoints from SQLite
    const tasksWithCheckpoints = this.sqliteSync.getCountByTask();

    if (tasksWithCheckpoints.length === 0) {
      return; // No tasks with checkpoints
    }

    let totalDeleted = 0;

    for (const { taskId, count } of tasksWithCheckpoints) {
      if (count <= 3) {
        continue; // Task has 3 or fewer checkpoints, no cleanup needed
      }

      // Delete old checkpoints from SQLite (keep 3 most recent)
      const sqliteDeleted = this.sqliteSync.deleteOldCheckpoints(taskId, 3);

      // Also clean up local files beyond 3
      try {
        const localMetadata = await this.localStore.listByTask(taskId);
        for (let i = 3; i < localMetadata.length; i++) {
          await this.localStore.delete(localMetadata[i].checkpointId);
        }
        const localDeleted = Math.max(0, localMetadata.length - 3);
        totalDeleted += sqliteDeleted + localDeleted;

        if (sqliteDeleted > 0 || localDeleted > 0) {
          console.log(`Retention policy: deleted ${sqliteDeleted + localDeleted} old checkpoints for task ${taskId}`);
        }
      } catch (error) {
        console.error(`Failed to clean up local checkpoints for task ${taskId}: ${error}`);
      }
    }

    if (totalDeleted > 0) {
      console.log(`Retention policy: deleted ${totalDeleted} total old checkpoints`);
    }
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
  async cleanupOnTaskCompletion(taskId: string): Promise<void> {
    await this.deleteCheckpointsByTask(taskId);
    console.log(`Deleted all checkpoints for completed task ${taskId}`);
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
   * Queries TaskQueue for actual task status, enabling the 2-minute time filter
   * and state-change detection to work correctly.
   *
   * Per 04-03-PLAN.md Task 2: Replaces hardcoded TODO stub with TaskQueue integration.
   *
   * @param taskId - Task identifier
   * @returns Task reference or null if task not found or TaskQueue not provided
   */
  private getTaskRef(taskId: string): TaskRef | null {
    // If taskQueue not provided, return null (task not found)
    if (!this.taskQueue) {
      console.warn(`TaskQueue not provided to CheckpointManager, cannot check task ${taskId}`);
      return null;
    }

    // Query actual task status from TaskQueue
    const task = this.taskQueue.getTask(taskId);
    if (!task) {
      return null;
    }

    // Calculate time invested from task timestamps
    const now = Date.now();
    const createdAt = task.createdAt ? task.createdAt * 1000 : now;
    const timeInvestedMs = now - createdAt;

    // Map TaskStatus to CheckpointTaskStatus
    const statusMap: Record<string, CheckpointTaskStatus> = {
      'pending': 'pending',
      'in_progress': 'in_progress',
      'paused': 'idle',  // Paused tasks treated as idle for checkpointing
      'completed': 'completed',
      'failed': 'failed',
      'cancelled': 'cancelled',
    };

    const checkpointStatus = statusMap[task.status] || 'idle';

    return {
      id: task.id,
      status: checkpointStatus,
      timeInvestedMs,
      checkpointWorthy: false,  // Could be added to Task schema in future
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
  mergeVectorClock(other: object): void {
    const otherClock = VectorClockImpl.fromJSON(other, this.agentId || 'unknown');
    this.vectorClock.merge(otherClock.getClock());
  }

  /**
   * Gets the vector clock for this manager instance.
   *
   * Useful for testing and debugging.
   *
   * @returns Current vector clock state
   */
  getVectorClock(): VectorClockImpl {
    return this.vectorClock;
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
