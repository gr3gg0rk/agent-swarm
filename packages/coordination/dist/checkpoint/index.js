/**
 * Checkpoint Module Exports
 *
 * Exports all checkpoint types and classes for agent crash recovery.
 * Per 04-01-PLAN.md Task 5.
 * Per 04-02-PLAN.md Task 1.
 */
// Classes
export { LocalFileStore, createLocalFileStore } from './store.js';
export { SQLiteSync, createSQLiteSync } from './sync.js';
export { CheckpointManager, createCheckpointManager } from './manager.js';
export { ResumeLogic, createResumeLogic } from './resume.js';
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
export function createCheckpointManagerWithDefaults(options) {
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
//# sourceMappingURL=index.js.map