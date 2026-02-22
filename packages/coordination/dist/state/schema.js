/**
 * Database Schema Initialization
 *
 * Creates and manages the database schema for task queue, agent status,
 * project context, and archive tables. Uses WAL mode for concurrent access.
 *
 * Per RESEARCH.md Pattern 1 and STATE-04 (WAL mode requirement).
 */
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
export function initializeSchema(db) {
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
    // Add new columns for task delegation (Phase 3)
    // Using ALTER TABLE for backward compatibility with existing databases
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN dependencies TEXT`);
    }
    catch {
        // Column already exists, ignore error
    }
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN timeout_ms INTEGER`);
    }
    catch {
        // Column already exists, ignore error
    }
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN retry_count INTEGER DEFAULT 0`);
    }
    catch {
        // Column already exists, ignore error
    }
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN max_retries INTEGER DEFAULT 3`);
    }
    catch {
        // Column already exists, ignore error
    }
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN last_progress_at INTEGER`);
    }
    catch {
        // Column already exists, ignore error
    }
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN result_payload TEXT`);
    }
    catch {
        // Column already exists, ignore error
    }
    try {
        db.exec(`ALTER TABLE tasks ADD COLUMN error_type TEXT CHECK(error_type IN ('transient', 'permanent'))`);
    }
    catch {
        // Column already exists, ignore error
    }
    // Add index for last_progress_at (for progress tracking queries)
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_tasks_progress ON tasks(last_progress_at)
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
    // Create checkpoints table for crash recovery (Phase 4)
    db.exec(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
  `);
    // Create index for task_id for fast latest checkpoint lookup
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id)
  `);
    // Create index for created_at for checkpoint ordering
    db.exec(`
    CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON checkpoints(created_at)
  `);
}
/**
 * Validates the database schema by checking for expected tables.
 *
 * @param db - Database instance to validate
 * @returns true if all expected tables exist
 */
export function validateSchema(db) {
    const expectedTables = [
        'tasks',
        'agent_status',
        'project_context',
        'tasks_archive',
        'status_archive',
        'checkpoints',
    ];
    const result = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all();
    const existingTables = new Set(result.map((row) => row.name));
    return expectedTables.every((table) => existingTables.has(table));
}
/**
 * Gets table row counts for monitoring.
 *
 * @param db - Database instance
 * @returns Object with row counts for each table
 */
export function getTableCounts(db) {
    const count = (table) => {
        const result = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
        return result.count;
    };
    return {
        tasks: count('tasks'),
        agent_status: count('agent_status'),
        project_context: count('project_context'),
        tasks_archive: count('tasks_archive'),
        status_archive: count('status_archive'),
        checkpoints: count('checkpoints'),
    };
}
/**
 * Drops all tables (useful for testing).
 *
 * WARNING: This will delete all data.
 *
 * @param db - Database instance
 */
export function dropAllTables(db) {
    db.exec('DROP TABLE IF EXISTS tasks_archive');
    db.exec('DROP TABLE IF EXISTS status_archive');
    db.exec('DROP TABLE IF EXISTS checkpoints');
    db.exec('DROP TABLE IF EXISTS tasks');
    db.exec('DROP TABLE IF EXISTS agent_status');
    db.exec('DROP TABLE IF EXISTS project_context');
}
//# sourceMappingURL=schema.js.map