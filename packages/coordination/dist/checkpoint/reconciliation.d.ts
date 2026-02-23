/**
 * State Reconciliation for Checkpoint Recovery
 *
 * Merges checkpoint state with current agent state during recovery.
 * Prevents progress regression by using field-specific merge strategies:
 * - Progress: MAX (never go backwards)
 * - Partial results: Merge objects and arrays
 * - Working context: Newer timestamp wins
 *
 * Per 08-03-PLAN.md Task 2.
 * Per 08-CONTEXT.md: Timestamp-based merge with field-specific strategies.
 */
import type { CheckpointData } from './types.js';
/**
 * Result of reconciling checkpoint with current state.
 *
 * Contains merged checkpoint data and conflict resolution details.
 */
export interface ReconciliationResult {
    /** Merged checkpoint data (checkpoint + current state) */
    merged: CheckpointData;
    /** Conflicts resolved during merge with resolution strategy */
    conflicts: Array<{
        field: string;
        resolution: 'checkpoint' | 'current' | 'merged';
    }>;
}
/**
 * Current agent state for reconciliation.
 *
 * Represents the agent's current progress and partial work
 * that needs to be merged with checkpoint data.
 */
export interface CurrentState {
    /** Current task progress (0-100) */
    progress: number;
    /** Optional partial results from ongoing task execution */
    partialResults?: unknown;
    /** Optional working context from ongoing task execution */
    workingContext?: unknown;
}
/**
 * Reconciles checkpoint state with current agent state.
 *
 * Merge strategies per field:
 * - **Progress**: Takes MAX(checkpoint.progress, current.progress) — progress never goes backwards
 * - **Partial results**: Merges objects (current overrides checkpoint), concatenates and dedupes arrays
 * - **Working context**: Uses newer timestamp if both have timestamps, otherwise keeps checkpoint
 *
 * Per 08-CONTEXT.md: "When checkpoint conflicts with current state, newer timestamps win on field-by-field basis."
 * Per 08-CONTEXT.md: "Progress: Take MAX(checkpoint progress, current progress) — progress should never go backwards."
 *
 * @param checkpoint - Checkpoint data to reconcile
 * @param current - Current agent state to merge
 * @returns Reconciliation result with merged data and conflict resolutions
 */
export declare function reconcileCheckpoint(checkpoint: CheckpointData, current: CurrentState): ReconciliationResult;
/**
 * Merges partial results from checkpoint and current state.
 *
 * Merge strategy:
 * - Start with checkpoint results as base
 * - Override with current results (more recent)
 * - If both values are arrays for same key: concatenate and dedupe using Set
 * - Otherwise, current value overrides checkpoint value
 *
 * Per 08-CONTEXT.md: "Partial results: Merge both sets (merge arrays, merge object keys)."
 *
 * @param checkpoint - Partial results from checkpoint
 * @param current - Partial results from current state
 * @returns Merged partial results
 */
export declare function mergePartialResults(checkpoint: Record<string, unknown>, current: Record<string, unknown>): Record<string, unknown>;
/**
 * Factory function to reconcile checkpoint with current state.
 *
 * Convenience wrapper around reconcileCheckpoint for consistency
 * with other module factory functions.
 *
 * @param checkpoint - Checkpoint data to reconcile
 * @param current - Current agent state to merge
 * @returns Reconciliation result with merged data and conflict resolutions
 */
export declare function createReconciliation(checkpoint: CheckpointData, current: CurrentState): ReconciliationResult;
//# sourceMappingURL=reconciliation.d.ts.map