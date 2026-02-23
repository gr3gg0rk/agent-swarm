/**
 * Context Recovery Integration Tests
 *
 * E2E tests for Phase 10: ContextManager integration with CheckpointManager
 * Verifies context references are resolved during checkpoint recovery.
 *
 * Per 10-01-PLAN.md Task 3: Integration tests using Node.js built-in test runner.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { ContextManager } from '../../dist/optimization/context-manager.js';
import { CheckpointManager } from '../../dist/checkpoint/manager.js';
import { LocalFileStore } from '../../dist/checkpoint/store.js';
import { SQLiteSync } from '../../dist/checkpoint/sync.js';
import type { CheckpointData } from '../../dist/checkpoint/types.js';
import * as fs from 'fs/promises';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

describe('Context Recovery Integration', () => {
  let db: Database.Database;
  let contextManager: ContextManager;
  let checkpointManager: CheckpointManager;
  let localStore: LocalFileStore;
  let sqliteSync: SQLiteSync;
  let tempDir: string;

  beforeEach(async () => {
    // Setup in-memory database and temp directory
    db = new Database(':memory:');
    // Initialize context_refs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_refs (
        hash TEXT PRIMARY KEY,
        size INTEGER NOT NULL,
        content BLOB NOT NULL,
        access_count INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        last_accessed INTEGER DEFAULT (strftime('%s', 'now'))
      ) WITHOUT ROWID
    `);

    // Initialize checkpoints table for SQLiteSync
    db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        data BLOB NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    contextManager = new ContextManager(db);
    tempDir = await fs.mkdtemp(await fs.realpath(os.tmpdir()) + '/');
    localStore = new LocalFileStore({ checkpointDir: tempDir });
    sqliteSync = new SQLiteSync({ db });

    checkpointManager = new CheckpointManager({
      localStore,
      sqliteSync,
      contextManager, // Inject ContextManager
      agentId: 'test-agent'
    });
  });

  afterEach(async () => {
    // Cleanup temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }
    db.close();
  });

  it('should resolve context references during checkpoint recovery', async () => {
    // 1. Create large context content (>10KB threshold)
    const largeContent = Buffer.from('x'.repeat(12000));

    // 2. Store context and get reference
    const ref = contextManager.storeContext(largeContent);
    assert.ok(ref);
    assert.equal(ref!.ref.length, 64); // SHA-256 hex string
    assert.equal(ref!.size, 12000);

    // 3. Create checkpoint with context reference (simulating task checkpoint)
    // Checkpoint files are named as {taskId}-{uuid}.json
    const checkpointId = `test-task-large-context-${uuidv4()}`;
    const checkpointData: CheckpointData = {
      taskId: 'test-task-large-context',
      agentId: 'test-agent',
      checkpointId,
      timestamp: Date.now(),
      progress: 50,
      workingContext: {
        context: {
          ref: ref, // Store reference, not full content
          content: undefined
        },
        someOtherData: 'test'
      },
      resourceHandles: [],
      timeInvestedMs: 60000
    };

    // Save directly to LocalFileStore (bypassing createCheckpoint which requires TaskQueue)
    await localStore.save(checkpointId, checkpointData);

    // 4. Recover checkpoint - this should resolve context reference
    const recovered = await checkpointManager.loadCheckpointWithFallback('test-task-large-context');

    // 5. Verify context reference resolved to actual content
    assert.ok(recovered);
    assert.ok(recovered!.workingContext);
    const wc = recovered!.workingContext as any;
    assert.ok(wc.context);
    assert.equal(wc.context.content, 'x'.repeat(12000));
    assert.equal(wc.context.ref, undefined); // Ref resolved, not present
    assert.equal(wc.someOtherData, 'test'); // Other data preserved
  });

  it('should handle missing context references gracefully', async () => {
    // 1. Create checkpoint with context reference that was never stored
    const missingRef = {
      ref: '0'.repeat(64), // Non-existent SHA-256 hash
      size: 12000,
      compressed: false
    };

    const checkpointId = `test-task-missing-ref-${uuidv4()}`;
    const checkpointData: CheckpointData = {
      taskId: 'test-task-missing-ref',
      agentId: 'test-agent',
      checkpointId,
      timestamp: Date.now(),
      progress: 25,
      workingContext: {
        context: {
          ref: missingRef,
          content: undefined
        }
      },
      resourceHandles: [],
      timeInvestedMs: 30000
    };

    // Save directly to LocalFileStore
    await localStore.save(checkpointId, checkpointData);

    // 2. Recover checkpoint - should NOT throw, should return checkpoint with unresolved ref
    const recovered = await checkpointManager.loadCheckpointWithFallback('test-task-missing-ref');

    // 3. Verify checkpoint recovered but context reference not resolved (graceful degradation)
    assert.ok(recovered);
    const wc = recovered!.workingContext as any;
    assert.ok(wc.context.ref); // Ref still present
    assert.equal(wc.context.ref.ref, '0'.repeat(64));
    assert.equal(wc.context.content, undefined);
  });

  it('should work without ContextManager (backward compatibility)', async () => {
    // 1. Create CheckpointManager WITHOUT ContextManager
    const checkpointManagerNoContext = new CheckpointManager({
      localStore,
      sqliteSync,
      agentId: 'test-agent'
      // No contextManager provided
    });

    // 2. Create checkpoint with context reference
    const checkpointId = `test-task-no-context-mgr-${uuidv4()}`;
    const ref = { ref: 'a'.repeat(64), size: 5000, compressed: false };
    const checkpointData: CheckpointData = {
      taskId: 'test-task-no-context-mgr',
      agentId: 'test-agent',
      checkpointId,
      timestamp: Date.now(),
      progress: 10,
      workingContext: {
        context: { ref: ref, content: undefined }
      },
      resourceHandles: [],
      timeInvestedMs: 10000
    };

    // Save directly to LocalFileStore
    await localStore.save(checkpointId, checkpointData);

    // 3. Recover checkpoint - should work without error
    const recovered = await checkpointManagerNoContext.loadCheckpointWithFallback('test-task-no-context-mgr');

    // 4. Verify checkpoint returned (with unresolved ref, since no ContextManager)
    assert.ok(recovered);
    const wc = recovered!.workingContext as any;
    assert.ok(wc.context.ref);
  });

  it('should handle small inline contexts (<10KB) without references', async () => {
    // 1. Create small context that does NOT use reference passing
    const smallContent = Buffer.from('small context'); // <10KB threshold

    const checkpointId = `test-task-small-context-${uuidv4()}`;
    const checkpointData: CheckpointData = {
      taskId: 'test-task-small-context',
      agentId: 'test-agent',
      checkpointId,
      timestamp: Date.now(),
      progress: 75,
      workingContext: {
        context: {
          content: smallContent.toString(),
          ref: undefined // No reference for small content
        }
      },
      resourceHandles: [],
      timeInvestedMs: 90000
    };

    // Save directly to LocalFileStore
    await localStore.save(checkpointId, checkpointData);

    // 2. Recover checkpoint
    const recovered = await checkpointManager.loadCheckpointWithFallback('test-task-small-context');

    // 3. Verify small content preserved as-is
    assert.ok(recovered);
    const wc = recovered!.workingContext as any;
    assert.equal(wc.context.content, 'small context');
    assert.equal(wc.context.ref, undefined);
  });
});
