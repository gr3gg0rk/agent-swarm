// packages/coordination/src/__tests__/integration.test.ts
// Source: 16-RESEARCH.md - Vitest integration testing pattern for database operations

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initializeSchema, validateSchema } from '../state/schema.js';
import { createTaskQueue } from '../state/task-queue.js';
import { createDatabase } from '../state/database.js';

describe('Database Integration (QA-03)', () => {
  let db: Database.Database;

  beforeEach(() => {
    // Create new in-memory database for each test (Pitfall 5 - prevents test interference)
    db = new Database(':memory:');
  });

  afterEach(() => {
    // Close database to prevent open handle warnings
    db.close();
  });

  describe('QA-03.1: Schema initialization', () => {
    it('should initialize schema successfully', () => {
      initializeSchema(db);
      // Schema init should create all required tables
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all() as { name: string }[];
      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('tasks');
      expect(tableNames).toContain('checkpoints');
      expect(tableNames).toContain('agent_status');
    });

    it('should validate schema successfully after initialization', () => {
      initializeSchema(db);
      expect(validateSchema(db)).toBe(true);
    });
  });

  describe('QA-03.2: INSERT operations', () => {
    it('should INSERT task with all 15 columns without errors', () => {
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
      expect(task.id).toBeDefined();
      expect(task.assignedAgent).toBe('test-agent');
      expect(task.dependencies).toEqual(['task-1', 'task-2']);
    });

    it('should INSERT task with minimal required fields', () => {
      initializeSchema(db);
      const queue = createTaskQueue(db);

      const task = queue.createTask({
        status: 'pending',
        priority: 5,
        payload: JSON.stringify({ minimal: true })
      });

      expect(task.id).toBeDefined();
      expect(task.status).toBe('pending');
    });
  });

  describe('QA-03.3: Pragma calls with simple option', () => {
    it('should return string from journal_mode pragma with simple option', () => {
      // Note: In-memory databases return 'memory' for journal_mode, not 'wal'
      // This test verifies the simple option returns a string, not a Database object
      const result = db.pragma('journal_mode', { simple: true }) as string;
      expect(typeof result).toBe('string');
      // In-memory databases use 'memory' mode
      expect(result.toLowerCase()).toBe('memory');
    });

    it('should return expected value from user_version pragma', () => {
      const version = db.pragma('user_version', { simple: true }) as number;
      expect(typeof version).toBe('number');
    });

    it('should return number from synchronous pragma query', () => {
      // Query the synchronous value (no assignment)
      const result = db.pragma('synchronous', { simple: true }) as number;
      expect(typeof result).toBe('number');
      // Default is usually 2 (FULL) for new databases
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(3);
    });

    it('should set synchronous to NORMAL and verify', () => {
      // Set synchronous to NORMAL
      db.pragma('synchronous = NORMAL');
      // Query the value to verify it was set
      const result = db.pragma('synchronous', { simple: true }) as number;
      expect(typeof result).toBe('number');
      expect(result).toBe(1); // NORMAL = 1
    });
  });

  describe('Database creation with WAL mode', () => {
    it('should create database with WAL mode enabled (file-based)', () => {
      // Create a temp file-based database to test WAL mode
      const { tmpdir } = require('os');
      const { join } = require('path');
      const { unlinkSync, existsSync } = require('fs');

      const dbPath = join(tmpdir(), `test-wal-${Date.now()}.db`);
      try {
        const db2 = createDatabase({ dbPath, walMode: true });
        const journalMode = db2.pragma('journal_mode', { simple: true }) as string;
        expect(journalMode.toLowerCase()).toBe('wal');
        db2.close();
      } finally {
        // Cleanup
        if (existsSync(dbPath)) {
          unlinkSync(dbPath);
        }
        const walPath = dbPath + '-wal';
        if (existsSync(walPath)) {
          unlinkSync(walPath);
        }
      }
    });
  });
});
