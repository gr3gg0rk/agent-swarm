/**
 * Local File Store for Checkpoints
 *
 * Provides fast local JSON file storage for 60-second checkpoints.
 * Uses atomic write pattern (temp file + rename) to prevent corruption on crash.
 * Per 04-01-PLAN.md Task 2.
 */
import type { CheckpointData, CheckpointMetadata } from './types.js';
/**
 * Configuration for LocalFileStore.
 */
export interface LocalFileStoreOptions {
    /** Directory path for checkpoint files (default: './data/checkpoints') */
    checkpointDir?: string;
}
/**
 * Local file-based checkpoint storage.
 *
 * Stores checkpoints as JSON files in a local directory.
 * Uses atomic write pattern: write to temp file, then rename.
 * This prevents corruption if the process crashes during write.
 *
 * Per RESEARCH.md: Async file operations similar to ArchiveManager from 02-01-SUMMARY.md.
 */
export declare class LocalFileStore {
    private readonly checkpointDir;
    /**
     * Creates a new LocalFileStore instance.
     *
     * @param options - Store configuration options
     */
    constructor(options?: LocalFileStoreOptions);
    /**
     * Ensures the checkpoint directory exists.
     * Creates directory recursively if not exists.
     */
    private ensureDirectoryExists;
    /**
     * Gets the file path for a checkpoint.
     *
     * @param checkpointId - Checkpoint identifier
     * @returns Absolute path to checkpoint file
     */
    private getCheckpointPath;
    /**
     * Saves checkpoint data to local file.
     *
     * Uses atomic write pattern:
     * 1. Write to temporary file
     * 2. Rename temp file to target path
     *
     * This prevents corruption if process crashes during write.
     *
     * @param checkpointId - Checkpoint identifier
     * @param data - Checkpoint data to save
     * @throws Error if write fails
     */
    save(checkpointId: string, data: CheckpointData): Promise<void>;
    /**
     * Loads checkpoint data from local file.
     *
     * @param checkpointId - Checkpoint identifier
     * @returns Checkpoint data or null if file not found
     * @throws Error if parse fails (corruption detected)
     */
    load(checkpointId: string): Promise<CheckpointData | null>;
    /**
     * Loads the most recent checkpoint for a task.
     *
     * Lists all checkpoint files for the task (pattern: {taskId}-*.json),
     * sorts by timestamp in filename, and returns the most recent.
     *
     * @param taskId - Task identifier
     * @returns Most recent checkpoint data or null if no checkpoints found
     */
    loadLatest(taskId: string): Promise<CheckpointData | null>;
    /**
     * Deletes a checkpoint file.
     *
     * @param checkpointId - Checkpoint identifier
     * @throws Error if deletion fails
     */
    delete(checkpointId: string): Promise<void>;
    /**
     * Lists all checkpoints for a task with metadata.
     *
     * @param taskId - Task identifier
     * @returns Array of checkpoint metadata
     */
    listByTask(taskId: string): Promise<CheckpointMetadata[]>;
    /**
     * Deletes all checkpoints for a task.
     * Useful for cleanup after task completion.
     *
     * @param taskId - Task identifier
     * @returns Number of checkpoints deleted
     */
    deleteByTask(taskId: string): Promise<number>;
    /**
     * Gets the checkpoint directory path.
     *
     * @returns Checkpoint directory path
     */
    getCheckpointDir(): string;
}
/**
 * Factory function to create LocalFileStore instance.
 *
 * @param options - Store configuration options
 * @returns LocalFileStore instance
 */
export declare function createLocalFileStore(options?: LocalFileStoreOptions): LocalFileStore;
//# sourceMappingURL=store.d.ts.map