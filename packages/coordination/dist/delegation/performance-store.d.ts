/**
 * Performance Store for Historical Task Execution Tracking
 *
 * Tracks task execution results in SQLite for weighted scoring algorithm.
 * Per ROUT-03: Router uses 30% historical performance in routing decisions.
 * Per RESEARCH.md Pitfall 3: Keep only last 1000 tasks per agent to prevent unbounded growth.
 */
import Database from 'better-sqlite3';
import type { PerformanceRecord } from './types.js';
/**
 * Performance store options.
 */
export interface PerformanceStoreOptions {
    /** Maximum records to keep per agent (default 1000) */
    maxRecordsPerAgent?: number;
}
/**
 * Performance store for SQLite-backed task execution history.
 *
 * Records task results and provides historical performance data
 * for weighted scoring in router.
 */
export declare class PerformanceStore {
    private db;
    private maxRecordsPerAgent;
    constructor(db: Database.Database, options?: PerformanceStoreOptions);
    /**
     * Create performance_history table if not exists.
     */
    private initializeSchema;
    /**
     * Record task execution result.
     *
     * @param record - Performance record to store
     */
    recordTaskResult(record: PerformanceRecord): void;
    /**
     * Get performance history for an agent.
     *
     * Returns last N records ordered by timestamp (most recent first).
     *
     * @param agentId - Agent ID to query
     * @param limit - Maximum records to return (default 100)
     * @returns Performance records
     */
    getPerformanceHistory(agentId: string, limit?: number): PerformanceRecord[];
    /**
     * Prune old performance records for an agent.
     *
     * Keeps only maxRecordsPerAgent most recent records.
     *
     * @param agentId - Agent ID to prune
     */
    private pruneOldRecords;
    /**
     * Get average execution time for an agent.
     *
     * @param agentId - Agent ID to query
     * @returns Average execution time in ms, or undefined if no history
     */
    getAverageExecutionTime(agentId: string): number | undefined;
    /**
     * Get success rate for an agent.
     *
     * @param agentId - Agent ID to query
     * @returns Success rate (0-1), or undefined if no history
     */
    getSuccessRate(agentId: string): number | undefined;
}
/**
 * Factory function to create performance store.
 *
 * @param db - Database connection
 * @param options - Optional configuration
 * @returns PerformanceStore instance
 */
export declare function createPerformanceStore(db: Database.Database, options?: PerformanceStoreOptions): PerformanceStore;
//# sourceMappingURL=performance-store.d.ts.map