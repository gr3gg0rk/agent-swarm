/**
 * Database Schema Initialization
 *
 * Creates and manages the database schema for task queue, agent status,
 * project context, and archive tables. Uses WAL mode for concurrent access.
 *
 * Per RESEARCH.md Pattern 1 and STATE-04 (WAL mode requirement).
 */

import Database from 'better-sqlite3';

/**
 * Initializes the database schema with all required tables and indexes.
 *
 * Creates:
 * - tasks: Task queue for agent coordination
 * - agent_status: Real-time agent heartbeat tracking
 * - project_context: Centralized project state storage
 * - tasks_archive: Historical task records
 * - status_archive: Historical agent status records
 *
 * All tables use IF NOT EXISTS for idempotency.
 *
 * @param db - Database instance to initialize
 * @throws Error if schema initialization fails
 *
 * @example
 * ```ts
 * const db = createDatabase({ dbPath: '/var/lib/openclaw-swarm/state.db' });
 * initializeSchema(db);
 * ```
 */
export function initializeSchema(db: Database.Database): void {
  // Enable foreign key support
  db.pragma('foreign_keys = ON');

  // Create tasks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'failed')) DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      assigned_agent TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      completed_at INTEGER,
      payload TEXT
    )
  `);

  // Create indexes for task queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority DESC)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(assigned_agent)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at)
  `);

  // Create agent_status table
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_status (
      agent_id TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'busy', 'error')) DEFAULT 'offline',
      last_heartbeat INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      current_task TEXT,
      capabilities TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (current_task) REFERENCES tasks(id) ON DELETE SET NULL
    )
  `);

  // Create indexes for agent status queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agent_status ON agent_status(status)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_last_heartbeat ON agent_status(last_heartbeat)
  `);

  // Create project_context table
  db.exec(`
    CREATE TABLE IF NOT EXISTS project_context (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create index for context queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_context_updated ON project_context(updated_at)
  `);

  // Create tasks_archive table for historical records
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_id TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      assigned_agent TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      completed_at INTEGER,
      payload TEXT,
      archived_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create indexes for archive queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_archive_original ON tasks_archive(original_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_archive_archived ON tasks_archive(archived_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_archive_status ON tasks_archive(status)
  `);

  // Create status_archive table for historical agent status
  db.exec(`
    CREATE TABLE IF NOT EXISTS status_archive (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      last_heartbeat INTEGER NOT NULL,
      current_task TEXT,
      capabilities TEXT,
      original_updated_at INTEGER NOT NULL,
      archived_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Create indexes for status archive queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_status_archive_agent ON status_archive(agent_id)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_status_archive_archived ON status_archive(archived_at)
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_status_archive_status ON status_archive(status)
  `);
}

/**
 * Validates the database schema by checking for expected tables.
 *
 * @param db - Database instance to validate
 * @returns true if all expected tables exist
 */
export function validateSchema(db: Database.Database): boolean {
  const expectedTables = [
    'tasks',
    'agent_status',
    'project_context',
    'tasks_archive',
    'status_archive',
  ];

  const result = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    )
    .all() as { name: string }[];

  const existingTables = new Set(result.map((row) => row.name));

  return expectedTables.every((table) => existingTables.has(table));
}

/**
 * Gets table row counts for monitoring.
 *
 * @param db - Database instance
 * @returns Object with row counts for each table
 */
export function getTableCounts(db: Database.Database): {
  tasks: number;
  agent_status: number;
  project_context: number;
  tasks_archive: number;
  status_archive: number;
} {
  const count = (table: string): number => {
    const result = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    };
    return result.count;
  };

  return {
    tasks: count('tasks'),
    agent_status: count('agent_status'),
    project_context: count('project_context'),
    tasks_archive: count('tasks_archive'),
    status_archive: count('status_archive'),
  };
}

/**
 * Drops all tables (useful for testing).
 *
 * WARNING: This will delete all data.
 *
 * @param db - Database instance
 */
export function dropAllTables(db: Database.Database): void {
  db.exec('DROP TABLE IF EXISTS tasks_archive');
  db.exec('DROP TABLE IF EXISTS status_archive');
  db.exec('DROP TABLE IF EXISTS tasks');
  db.exec('DROP TABLE IF EXISTS agent_status');
  db.exec('DROP TABLE IF EXISTS project_context');
}
