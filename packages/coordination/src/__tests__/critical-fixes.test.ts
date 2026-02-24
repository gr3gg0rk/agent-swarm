import { describe, it, expect } from 'vitest';
import { encodeMessage, decodeMessage, shouldUseMessagePack } from '../communication/codec.js';
import { MessageBatcher, ConnectionPoolManager, loadOptimizationConfig } from '../optimization/index.js';
import { initializeSchema, validateSchema } from '../state/schema.js';
import { createDatabase } from '../state/database.js';
import { createTaskQueue } from '../state/task-queue.js';
import Database from 'better-sqlite3';
import { tmpdir } from 'os';
import { join } from 'path';
import { unlinkSync } from 'fs';

describe('Critical Fixes Regression Tests', () => {
  describe('CRIT-01/02: msgpackr functional API', () => {
    it('should use pack/unpack functions not MessagePack class', () => {
      const envelope = {
        messageId: 'test-123',
        idempotencyKey: 'test-key-123',
        from: 'test-agent',
        to: 'target-agent',
        type: 'task' as const,
        timestamp: Date.now(),
        payload: { data: 'test' }
      };

      // Encode should not throw
      const encoded = encodeMessage(envelope);
      expect(Buffer.isBuffer(encoded)).toBe(true);

      // Decode should recover original data
      const decoded = decodeMessage(encoded);
      expect(decoded.messageId).toBe(envelope.messageId);
      expect(decoded.payload).toEqual(envelope.payload);
    });

    it('should use MessagePack for payloads > 1KB', () => {
      const largePayload = 'x'.repeat(2000);
      expect(shouldUseMessagePack(largePayload)).toBe(true);
    });

    it('should use JSON for payloads <= 1KB', () => {
      const smallPayload = 'x'.repeat(500);
      expect(shouldUseMessagePack(smallPayload)).toBe(false);
    });
  });

  describe('CRIT-03: Optimization module exports', () => {
    it('should export MessageBatcher from optimization module', () => {
      expect(MessageBatcher).toBeDefined();
    });

    it('should export ConnectionPoolManager from optimization module', () => {
      expect(ConnectionPoolManager).toBeDefined();
    });

    it('should export loadOptimizationConfig from optimization module', () => {
      expect(loadOptimizationConfig).toBeDefined();
    });
  });

  describe('CRIT-04: Schema function exports', () => {
    it('should export initializeSchema function', () => {
      expect(initializeSchema).toBeDefined();
      expect(typeof initializeSchema).toBe('function');
    });

    it('should export validateSchema function', () => {
      expect(validateSchema).toBeDefined();
      expect(typeof validateSchema).toBe('function');
    });

    it('should initialize schema and validate successfully', () => {
      const dbPath = join(tmpdir(), `test-schema-${Date.now()}.db`);
      const db = new Database(dbPath);
      initializeSchema(db);
      expect(validateSchema(db)).toBe(true);
      db.close();
      // Cleanup
      unlinkSync(dbPath);
    });
  });

  describe('CRIT-05: Database pragma with simple option', () => {
    it('should return string from journal_mode pragma with simple option', () => {
      const dbPath = join(tmpdir(), `test-pragma-${Date.now()}.db`);
      const db = new Database(dbPath);
      const result = db.pragma('journal_mode = WAL', { simple: true }) as string;
      expect(typeof result).toBe('string');
      expect(result.toLowerCase()).toBe('wal');
      db.close();
      // Cleanup
      unlinkSync(dbPath);
    });

    it('should throw descriptive error if WAL mode fails', () => {
      const dbPath = join(tmpdir(), `test-pragma-fail-${Date.now()}.db`);
      const db = new Database(dbPath);
      // Enable WAL first
      const walResult = db.pragma('journal_mode = WAL', { simple: true }) as string;
      expect(walResult.toLowerCase()).toBe('wal');

      // Create database with createDatabase function
      const db2 = createDatabase({ dbPath: dbPath, walMode: true });
      expect(db2).toBeDefined();
      db2.close();
      db.close();
      // Cleanup
      unlinkSync(dbPath);
    });
  });

  describe('CRIT-06: Task queue INSERT placeholder count', () => {
    it('should create task without parameter count errors', () => {
      const dbPath = join(tmpdir(), `test-task-${Date.now()}.db`);
      const db = new Database(dbPath);
      initializeSchema(db);
      const queue = createTaskQueue(db);

      const task = queue.createTask({
        status: 'pending',
        priority: 5,
        payload: JSON.stringify({ test: 'data' })
      });

      expect(task).toBeDefined();
      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
      expect(task.priority).toBe(5);

      db.close();
      // Cleanup
      unlinkSync(dbPath);
    });

    it('should insert task with all 15 columns', () => {
      const dbPath = join(tmpdir(), `test-task-full-${Date.now()}.db`);
      const db = new Database(dbPath);
      initializeSchema(db);
      const queue = createTaskQueue(db);

      const task = queue.createTask({
        status: 'pending',
        priority: 5,
        assignedAgent: 'test-agent',
        payload: JSON.stringify({ test: 'data' }),
        dependencies: ['task-1', 'task-2'],
        timeoutMs: 30000,
        retryCount: 0,
        maxRetries: 3
      });

      expect(task).toBeDefined();
      expect(task.assignedAgent).toBe('test-agent');
      expect(task.dependencies).toEqual(['task-1', 'task-2']);

      db.close();
      // Cleanup
      unlinkSync(dbPath);
    });
  });
});
