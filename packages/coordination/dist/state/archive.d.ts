/**
 * Archive Manager for Database Size Control
 *
 * Manages archival of old task and agent status records to keep database
 * under 50MB requirement (STATE-05). Uses cron for scheduled archives.
 *
 * Per RESEARCH.md Pattern 4 (Archive) and STATE-05 (database <50MB).
 */
import Database from 'better-sqlite3';
/**
 * Archive statistics result.
 */
export interface ArchiveResult {
    /** Number of records archived */
    archived: number;
    /** Size of archived data in bytes */
    sizeBytes: number;
}
/**
 * Archive manager configuration.
 */
export interface ArchiveConfig {
    /** Age threshold for task archiving (days, default: 7) */
    taskArchiveDays?: number;
    /** Age threshold for status archiving (days, default: 30) */
    statusArchiveDays?: number;
    /** Cron schedule for archive job (default: daily at 2 AM) */
    cronSchedule?: string;
}
/**
 * Archive manager for database cleanup.
 *
 * Moves old records to archive tables and deletes from active tables.
 * Uses transactions for atomic archive+delete operations.
 */
export declare class ArchiveManager {
    private db;
    private cronTask;
    private config;
    constructor(db: Database.Database, config?: ArchiveConfig);
    /**
     * Archive completed tasks older than threshold.
     *
     * Moves tasks from tasks table to tasks_archive table,
     * then deletes from active table.
     *
     * @returns Archive statistics
     */
    archiveOldTasks(): ArchiveResult;
    /**
     * Archive old agent status records.
     *
     * Moves records from agent_status table to status_archive table,
     * then deletes from active table.
     *
     * @returns Archive statistics
     */
    archiveOldStatuses(): ArchiveResult;
    /**
     * Run both archive operations.
     *
     * @returns Combined archive statistics
     */
    runAllArchives(): {
        tasks: ArchiveResult;
        statuses: ArchiveResult;
    };
    /**
     * Start scheduled archive job.
     *
     * Runs daily at 2 AM by default.
     * Stops any existing scheduled job first.
     */
    startScheduledArchives(): void;
    /**
     * Stop scheduled archive job.
     */
    stopScheduledArchives(): void;
    /**
     * Get current database size in bytes.
     *
     * Useful for monitoring the 50MB limit (STATE-05).
     *
     * @returns Database file size in bytes
     */
    getDatabaseSize(): number;
    /**
     * Get archive table sizes.
     *
     * @returns Row counts for archive tables
     */
    getArchiveStats(): {
        tasksArchive: number;
        statusArchive: number;
        totalSizeBytes: number;
    };
    /**
     * Check if database is approaching size limit.
     *
     * @param thresholdMB - Warning threshold in MB (default: 40)
     * @returns true if database size exceeds threshold
     */
    isNearSizeLimit(thresholdMB?: number): boolean;
    /**
     * Manually trigger archive if database is large.
     *
     * Useful for on-demand cleanup.
     *
     * @returns Archive results if run, null if not needed
     */
    archiveIfNeeded(): {
        tasks: ArchiveResult;
        statuses: ArchiveResult;
    } | null;
}
/**
 * Factory function to create archive manager instance.
 *
 * @param db - Database instance
 * @param config - Optional configuration
 * @returns ArchiveManager instance
 */
export declare function createArchiveManager(db: Database.Database, config?: ArchiveConfig): ArchiveManager;
//# sourceMappingURL=archive.d.ts.map