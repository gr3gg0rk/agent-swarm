/**
 * Project Context Storage
 *
 * Provides centralized key-value storage for project context.
 * Context values are stored as JSON strings for flexibility.
 *
 * Per STATE-03 (project context stored centrally).
 */

import Database from 'better-sqlite3';

/**
 * Context entry from database.
 */
export interface ContextEntry {
  /** Context key */
  key: string;
  /** Context value (JSON string) */
  value: string;
  /** Last update timestamp (Unix seconds) */
  updatedAt: number;
}

/**
 * Project context store with prepared statement caching.
 *
 * Stores arbitrary JSON-serializable values keyed by string.
 * All operations are synchronous and thread-safe.
 */
export class ContextStore {
  private upsertStmt: Database.Statement;
  private selectStmt: Database.Statement;
  private selectAllStmt: Database.Statement;
  private deleteStmt: Database.Statement;

  constructor(db: Database.Database) {
    // Prepare all statements once for reuse
    this.upsertStmt = db.prepare(`
      INSERT INTO project_context (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = excluded.updated_at
    `);

    this.selectStmt = db.prepare(`
      SELECT key, value, updated_at as updatedAt
      FROM project_context
      WHERE key = ?
    `);

    this.selectAllStmt = db.prepare(`
      SELECT key, value, updated_at as updatedAt
      FROM project_context
    `);

    this.deleteStmt = db.prepare(`
      DELETE FROM project_context
      WHERE key = ?
    `);
  }

  /**
   * Store a context value.
   *
   * Values are JSON-serialized before storage.
   * Existing keys are updated (UPSERT).
   *
   * @param key - Context key
   * @param value - Value to store (must be JSON-serializable)
   */
  setContext(key: string, value: unknown): void {
    const json = JSON.stringify(value);
    const now = Math.floor(Date.now() / 1000);

    this.upsertStmt.run(key, json, now);
  }

  /**
   * Retrieve a context value.
   *
   * Values are parsed from JSON.
   *
   * @param key - Context key
   * @returns Parsed value or null if not found
   */
  getContext<T = unknown>(key: string): T | null {
    const result = this.selectStmt.get(key) as ContextEntry | undefined;
    if (!result) {
      return null;
    }

    try {
      return JSON.parse(result.value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Get all context entries as a record.
   *
   * @returns Object with all context key-value pairs
   */
  getAllContext(): Record<string, unknown> {
    const results = this.selectAllStmt.all() as ContextEntry[];
    const context: Record<string, unknown> = {};

    for (const entry of results) {
      try {
        context[entry.key] = JSON.parse(entry.value);
      } catch {
        // Skip invalid JSON entries
        context[entry.key] = entry.value;
      }
    }

    return context;
  }

  /**
   * Delete a context key.
   *
   * @param key - Context key to delete
   * @returns true if key was deleted, false if not found
   */
  deleteContext(key: string): boolean {
    const result = this.deleteStmt.run(key);
    return result.changes > 0;
  }

  /**
   * Get context entry with metadata.
   *
   * @param key - Context key
   * @returns Context entry or null if not found
   */
  getContextEntry(key: string): ContextEntry | null {
    const result = this.selectStmt.get(key) as ContextEntry | undefined;
    return result || null;
  }

  /**
   * Get multiple context keys at once.
   *
   * @param keys - Array of context keys
   * @returns Record of found keys with their values
   */
  getMultipleContext(keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const value = this.getContext(key);
      if (value !== null) {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Set multiple context keys at once.
   *
   * Uses a transaction for atomicity.
   *
   * @param entries - Record of key-value pairs
   */
  setMultipleContext(entries: Record<string, unknown>): void {
    const now = Math.floor(Date.now() / 1000);

    // Use transaction for atomicity
    const db = this.upsertStmt.database;
    const setMultiple = db.transaction((entries: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(entries)) {
        const json = JSON.stringify(value);
        this.upsertStmt.run(key, json, now);
      }
    });

    setMultiple(entries);
  }

  /**
   * Get total context entry count.
   *
   * @returns Number of stored context entries
   */
  getContextCount(): number {
    const results = this.selectAllStmt.all() as ContextEntry[];
    return results.length;
  }
}

/**
 * Factory function to create context store instance.
 *
 * @param db - Database instance
 * @returns ContextStore instance
 */
export function createContextStore(db: Database.Database): ContextStore {
  return new ContextStore(db);
}
