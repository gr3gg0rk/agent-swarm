/**
 * Checkpoint Module Exports
 *
 * Exports all checkpoint types and classes for agent crash recovery.
 * Per 04-01-PLAN.md Task 5.
 * Per 04-02-PLAN.md Task 1.
 */

// Types
export type {
  CheckpointData,
  CheckpointMetadata,
  ResumeResult,
  CreateCheckpointOptions,
  CheckpointSyncStats,
  CheckpointManagerOptions,
} from './types.js';

// Classes
export { LocalFileStore, createLocalFileStore } from './store.js';
export type { LocalFileStoreOptions } from './store.js';

export { SQLiteSync, createSQLiteSync } from './sync.js';
export type { SQLiteSyncOptions } from './sync.js';

export { CheckpointManager, createCheckpointManager } from './manager.js';
export type {
  CheckpointTaskStatus,
  TaskRef,
} from './manager.js';

export { ResumeLogic, createResumeLogic } from './resume.js';
export type { ResumeLogicOptions } from './resume.js';

// Re-export TaskQueue for CheckpointManagerOptions
export type { TaskQueue } from '../state/task-queue.js';

/**
 * Factory function to create a fully configured CheckpointManager.
 *
 * Creates LocalFileStore and SQLiteSync instances if not provided,
 * then returns a configured CheckpointManager.
 *
 * @param options - Configuration options
 * @returns Configured CheckpointManager instance
 *
 * @example
 * ```ts
 * import Database from 'better-sqlite3';
 * import { createCheckpointManagerWithDefaults } from '@openclaw-swarm/coordination';
 *
 * const db = new Database('/var/lib/openclaw-swarm/state.db');
 * const manager = createCheckpointManagerWithDefaults({
 *   db,
 *   checkpointDir: './data/checkpoints',
 * });
 * ```
 */
export function createCheckpointManagerWithDefaults(options: {
  /** Database instance for SQLite sync */
  db: Parameters<typeof import('./sync.js')['createSQLiteSync']>[0]['db'];
  /** Checkpoint directory path (default: './data/checkpoints') */
  checkpointDir?: string;
  /** Sync interval in milliseconds (default: 300000 = 5 minutes) */
  syncIntervalMs?: number;
}): ReturnType<typeof import('./manager.js')['createCheckpointManager']> {
  const { createLocalFileStore } = require('./store.js');
  const { createSQLiteSync } = require('./sync.js');
  const { createCheckpointManager } = require('./manager.js');

  const localStore = createLocalFileStore({
    checkpointDir: options.checkpointDir,
  });

  const sqliteSync = createSQLiteSync({
    db: options.db,
  });

  return createCheckpointManager({
    localStore,
    sqliteSync,
    syncIntervalMs: options.syncIntervalMs,
  });
}
