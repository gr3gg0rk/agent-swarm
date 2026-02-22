/**
 * Local File Store for Checkpoints
 *
 * Provides fast local JSON file storage for 60-second checkpoints.
 * Uses atomic write pattern (temp file + rename) to prevent corruption on crash.
 * Per 04-01-PLAN.md Task 2.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
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
export class LocalFileStore {
  private readonly checkpointDir: string;

  /**
   * Creates a new LocalFileStore instance.
   *
   * @param options - Store configuration options
   */
  constructor(options: LocalFileStoreOptions = {}) {
    this.checkpointDir = options.checkpointDir || './data/checkpoints';
    this.ensureDirectoryExists();
  }

  /**
   * Ensures the checkpoint directory exists.
   * Creates directory recursively if not exists.
   */
  private ensureDirectoryExists(): void {
    if (!existsSync(this.checkpointDir)) {
      fs.mkdir(this.checkpointDir, { recursive: true }).catch((error) => {
        // Log but don't throw - directory creation may race with other processes
        console.error(`Failed to create checkpoint directory: ${error}`);
      });
    }
  }

  /**
   * Gets the file path for a checkpoint.
   *
   * @param checkpointId - Checkpoint identifier
   * @returns Absolute path to checkpoint file
   */
  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.checkpointDir, `${checkpointId}.json`);
  }

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
  async save(checkpointId: string, data: CheckpointData): Promise<void> {
    const targetPath = this.getCheckpointPath(checkpointId);
    const tempPath = `${targetPath}.tmp`;

    try {
      // Serialize data as JSON
      const jsonData = JSON.stringify(data);

      // Write to temporary file first
      await fs.writeFile(tempPath, jsonData, 'utf-8');

      // Atomic rename to target path
      await fs.rename(tempPath, targetPath);
    } catch (error) {
      // Clean up temp file if write failed
      try {
        await fs.unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
      throw new Error(`Failed to save checkpoint ${checkpointId}: ${error}`);
    }
  }

  /**
   * Loads checkpoint data from local file.
   *
   * @param checkpointId - Checkpoint identifier
   * @returns Checkpoint data or null if file not found
   * @throws Error if parse fails (corruption detected)
   */
  async load(checkpointId: string): Promise<CheckpointData | null> {
    const filePath = this.getCheckpointPath(checkpointId);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content) as CheckpointData;
      return data;
    } catch (error) {
      // File not found is not an error - just return null
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      // Parse error indicates corruption
      throw new Error(`Failed to load checkpoint ${checkpointId}: corruption detected`);
    }
  }

  /**
   * Loads the most recent checkpoint for a task.
   *
   * Lists all checkpoint files for the task (pattern: {taskId}-*.json),
   * sorts by timestamp in filename, and returns the most recent.
   *
   * @param taskId - Task identifier
   * @returns Most recent checkpoint data or null if no checkpoints found
   */
  async loadLatest(taskId: string): Promise<CheckpointData | null> {
    try {
      const files = await fs.readdir(this.checkpointDir);

      // Filter files matching task pattern: {taskId}-*.json
      const taskFiles = files.filter((file) =>
        file.startsWith(`${taskId}-`) && file.endsWith('.json')
      );

      if (taskFiles.length === 0) {
        return null;
      }

      // Sort by filename timestamp (extract from checkpoint ID or use file stats)
      const fileStats = await Promise.all(
        taskFiles.map(async (file) => ({
          file,
          mtime: (await fs.stat(path.join(this.checkpointDir, file))).mtime.getTime(),
        }))
      );

      // Sort by modification time, most recent first
      fileStats.sort((a, b) => b.mtime - a.mtime);

      // Load the most recent checkpoint
      const checkpointId = fileStats[0].file.replace('.json', '');
      return this.load(checkpointId);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist yet
        return null;
      }
      throw new Error(`Failed to load latest checkpoint for task ${taskId}: ${error}`);
    }
  }

  /**
   * Deletes a checkpoint file.
   *
   * @param checkpointId - Checkpoint identifier
   * @throws Error if deletion fails
   */
  async delete(checkpointId: string): Promise<void> {
    const filePath = this.getCheckpointPath(checkpointId);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      // File not found is not an error
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new Error(`Failed to delete checkpoint ${checkpointId}: ${error}`);
      }
    }
  }

  /**
   * Lists all checkpoints for a task with metadata.
   *
   * @param taskId - Task identifier
   * @returns Array of checkpoint metadata
   */
  async listByTask(taskId: string): Promise<CheckpointMetadata[]> {
    try {
      const files = await fs.readdir(this.checkpointDir);

      // Filter files matching task pattern
      const taskFiles = files.filter((file) =>
        file.startsWith(`${taskId}-`) && file.endsWith('.json')
      );

      // Gather metadata for each checkpoint
      const metadata: CheckpointMetadata[] = [];
      for (const file of taskFiles) {
        const filePath = path.join(this.checkpointDir, file);
        const stats = await fs.stat(filePath);
        const checkpointId = file.replace('.json', '');

        // Load checkpoint to get taskId and timestamp
        const data = await this.load(checkpointId);
        if (data) {
          metadata.push({
            checkpointId,
            taskId: data.taskId,
            createdAt: data.timestamp,
            sizeBytes: stats.size,
            syncStatus: 'local', // Local files are always local until synced
          });
        }
      }

      // Sort by creation time, most recent first
      metadata.sort((a, b) => b.createdAt - a.createdAt);

      return metadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Directory doesn't exist yet
        return [];
      }
      throw new Error(`Failed to list checkpoints for task ${taskId}: ${error}`);
    }
  }

  /**
   * Deletes all checkpoints for a task.
   * Useful for cleanup after task completion.
   *
   * @param taskId - Task identifier
   * @returns Number of checkpoints deleted
   */
  async deleteByTask(taskId: string): Promise<number> {
    try {
      const metadata = await this.listByTask(taskId);
      await Promise.all(
        metadata.map((m) => this.delete(m.checkpointId))
      );
      return metadata.length;
    } catch (error) {
      throw new Error(`Failed to delete checkpoints for task ${taskId}: ${error}`);
    }
  }

  /**
   * Gets the checkpoint directory path.
   *
   * @returns Checkpoint directory path
   */
  getCheckpointDir(): string {
    return this.checkpointDir;
  }
}

/**
 * Factory function to create LocalFileStore instance.
 *
 * @param options - Store configuration options
 * @returns LocalFileStore instance
 */
export function createLocalFileStore(options?: LocalFileStoreOptions): LocalFileStore {
  return new LocalFileStore(options);
}
