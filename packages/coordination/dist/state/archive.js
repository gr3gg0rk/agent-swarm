/**
 * Archive Manager for Database Size Control
 *
 * Manages archival of old task and agent status records to keep database
 * under 50MB requirement (STATE-05). Uses cron for scheduled archives.
 *
 * Per RESEARCH.md Pattern 4 (Archive) and STATE-05 (database <50MB).
 */
import cron from 'node-cron';
/**
 * Archive manager for database cleanup.
 *
 * Moves old records to archive tables and deletes from active tables.
 * Uses transactions for atomic archive+delete operations.
 */
export class ArchiveManager {
    db;
    cronTask = null;
    config;
    constructor(db, config = {}) {
        this.db = db;
        this.config = {
            taskArchiveDays: config.taskArchiveDays ?? 7,
            statusArchiveDays: config.statusArchiveDays ?? 30,
            cronSchedule: config.cronSchedule ?? '0 2 * * *',
        };
    }
    /**
     * Archive completed tasks older than threshold.
     *
     * Moves tasks from tasks table to tasks_archive table,
     * then deletes from active table.
     *
     * @returns Archive statistics
     */
    archiveOldTasks() {
        const cutoffTime = Math.floor(Date.now() / 1000) - this.config.taskArchiveDays * 86400;
        // First, count tasks to be archived
        const countStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM tasks
      WHERE status IN ('completed', 'failed')
        AND completed_at < ?
    `);
        const countResult = countStmt.get(cutoffTime);
        const count = countResult.count;
        if (count === 0) {
            return { archived: 0, sizeBytes: 0 };
        }
        // Get size before archiving
        const pageCount = this.db.pragma('page_count', { simple: true });
        const pageSize = this.db.pragma('page_size', { simple: true });
        const sizeBefore = pageCount * pageSize;
        // Use transaction for atomic archive+delete
        const archiveTx = this.db.transaction((cutoff) => {
            // Insert into archive
            this.db.prepare(`
        INSERT INTO tasks_archive (original_id, status, priority, assigned_agent,
                                   created_at, updated_at, completed_at, payload)
        SELECT id, status, priority, assigned_agent, created_at, updated_at, completed_at, payload
        FROM tasks
        WHERE status IN ('completed', 'failed')
          AND completed_at < ?
      `).run(cutoff);
            // Delete from active table
            this.db.prepare(`
        DELETE FROM tasks
        WHERE status IN ('completed', 'failed')
          AND completed_at < ?
      `).run(cutoff);
            // Run VACUUM to reclaim space
            this.db.pragma('incremental_vacuum');
        });
        archiveTx(cutoffTime);
        // Get size after archiving
        const pageCountAfter = this.db.pragma('page_count', { simple: true });
        const pageSizeAfter = this.db.pragma('page_size', { simple: true });
        const sizeAfter = pageCountAfter * pageSizeAfter;
        return {
            archived: count,
            sizeBytes: Math.max(0, sizeBefore - sizeAfter),
        };
    }
    /**
     * Archive old agent status records.
     *
     * Moves records from agent_status table to status_archive table,
     * then deletes from active table.
     *
     * @returns Archive statistics
     */
    archiveOldStatuses() {
        const cutoffTime = Math.floor(Date.now() / 1000) - this.config.statusArchiveDays * 86400;
        // First, count statuses to be archived
        const countStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM agent_status
      WHERE updated_at < ?
    `);
        const countResult = countStmt.get(cutoffTime);
        const count = countResult.count;
        if (count === 0) {
            return { archived: 0, sizeBytes: 0 };
        }
        // Get size before archiving
        const pageCount = this.db.pragma('page_count', { simple: true });
        const pageSize = this.db.pragma('page_size', { simple: true });
        const sizeBefore = pageCount * pageSize;
        // Use transaction for atomic archive+delete
        const archiveTx = this.db.transaction((cutoff) => {
            // Insert into archive
            this.db.prepare(`
        INSERT INTO status_archive (agent_id, status, last_heartbeat, current_task,
                                    capabilities, original_updated_at)
        SELECT agent_id, status, last_heartbeat, current_task, capabilities, updated_at
        FROM agent_status
        WHERE updated_at < ?
      `).run(cutoff);
            // Delete from active table (for all agents, not just offline ones)
            this.db.prepare(`
        DELETE FROM agent_status
        WHERE updated_at < ?
      `).run(cutoff);
            // Run VACUUM to reclaim space
            this.db.pragma('incremental_vacuum');
        });
        archiveTx(cutoffTime);
        // Get size after archiving
        const pageCountAfter = this.db.pragma('page_count', { simple: true });
        const pageSizeAfter = this.db.pragma('page_size', { simple: true });
        const sizeAfter = pageCountAfter * pageSizeAfter;
        return {
            archived: count,
            sizeBytes: Math.max(0, sizeBefore - sizeAfter),
        };
    }
    /**
     * Run both archive operations.
     *
     * @returns Combined archive statistics
     */
    runAllArchives() {
        return {
            tasks: this.archiveOldTasks(),
            statuses: this.archiveOldStatuses(),
        };
    }
    /**
     * Start scheduled archive job.
     *
     * Runs daily at 2 AM by default.
     * Stops any existing scheduled job first.
     */
    startScheduledArchives() {
        this.stopScheduledArchives();
        this.cronTask = cron.schedule(this.config.cronSchedule, () => {
            try {
                const results = this.runAllArchives();
                console.info(`[ArchiveManager] Archived ${results.tasks.archived} tasks, ` +
                    `${results.statuses.archived} statuses`);
            }
            catch (error) {
                console.error('[ArchiveManager] Archive job failed:', error);
            }
        }, {
            scheduled: true,
            timezone: 'UTC',
        });
        console.info(`[ArchiveManager] Scheduled archive job: ${this.config.cronSchedule}`);
    }
    /**
     * Stop scheduled archive job.
     */
    stopScheduledArchives() {
        if (this.cronTask) {
            this.cronTask.stop();
            this.cronTask = null;
            console.info('[ArchiveManager] Stopped scheduled archive job');
        }
    }
    /**
     * Get current database size in bytes.
     *
     * Useful for monitoring the 50MB limit (STATE-05).
     *
     * @returns Database file size in bytes
     */
    getDatabaseSize() {
        const pageCount = this.db.pragma('page_count', { simple: true });
        const pageSize = this.db.pragma('page_size', { simple: true });
        return pageCount * pageSize;
    }
    /**
     * Get archive table sizes.
     *
     * @returns Row counts for archive tables
     */
    getArchiveStats() {
        const tasksStmt = this.db.prepare('SELECT COUNT(*) AS count FROM tasks_archive');
        const statusStmt = this.db.prepare('SELECT COUNT(*) AS count FROM status_archive');
        const tasksResult = tasksStmt.get();
        const statusResult = statusStmt.get();
        return {
            tasksArchive: tasksResult.count,
            statusArchive: statusResult.count,
            totalSizeBytes: this.getDatabaseSize(),
        };
    }
    /**
     * Check if database is approaching size limit.
     *
     * @param thresholdMB - Warning threshold in MB (default: 40)
     * @returns true if database size exceeds threshold
     */
    isNearSizeLimit(thresholdMB = 40) {
        const sizeBytes = this.getDatabaseSize();
        const limitBytes = thresholdMB * 1024 * 1024;
        return sizeBytes > limitBytes;
    }
    /**
     * Manually trigger archive if database is large.
     *
     * Useful for on-demand cleanup.
     *
     * @returns Archive results if run, null if not needed
     */
    archiveIfNeeded() {
        if (this.isNearSizeLimit(35)) {
            return this.runAllArchives();
        }
        return null;
    }
}
/**
 * Factory function to create archive manager instance.
 *
 * @param db - Database instance
 * @param config - Optional configuration
 * @returns ArchiveManager instance
 */
export function createArchiveManager(db, config) {
    return new ArchiveManager(db, config);
}
//# sourceMappingURL=archive.js.map