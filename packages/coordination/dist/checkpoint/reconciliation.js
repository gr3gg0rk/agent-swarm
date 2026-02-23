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
export function reconcileCheckpoint(checkpoint, current) {
    const conflicts = [];
    const merged = { ...checkpoint };
    // Progress resolution: Take MAX (never go backwards)
    if (current.progress > checkpoint.progress) {
        merged.progress = current.progress;
        conflicts.push({ field: 'progress', resolution: 'current' });
    }
    // If checkpoint progress is higher, keep it (no conflict logged)
    // Partial results resolution: Merge both sets
    if (checkpoint.partialResults !== undefined && current.partialResults !== undefined) {
        const checkpointResults = checkpoint.partialResults;
        const currentResults = current.partialResults;
        // Merge objects with array-aware handling
        merged.partialResults = mergePartialResults(checkpointResults, currentResults);
        conflicts.push({ field: 'partialResults', resolution: 'merged' });
    }
    else if (current.partialResults !== undefined) {
        // Only current has partial results, use it
        merged.partialResults = current.partialResults;
        conflicts.push({ field: 'partialResults', resolution: 'current' });
    }
    // If only checkpoint has partial results, keep it (no conflict logged)
    // Working context resolution: Newer timestamp wins
    if (checkpoint.workingContext !== undefined && current.workingContext !== undefined) {
        const checkpointContext = checkpoint.workingContext;
        const currentContext = current.workingContext;
        if (currentContext.timestamp !== undefined && checkpointContext.timestamp !== undefined) {
            if (currentContext.timestamp > checkpointContext.timestamp) {
                merged.workingContext = current.workingContext;
                conflicts.push({ field: 'workingContext', resolution: 'current' });
            }
            // If checkpoint timestamp is newer or equal, keep it (no conflict logged)
        }
        else {
            // Missing timestamp fields: keep checkpoint as fallback
            // No conflict logged - this is expected behavior
        }
    }
    else if (current.workingContext !== undefined) {
        // Only current has working context, use it
        merged.workingContext = current.workingContext;
        conflicts.push({ field: 'workingContext', resolution: 'current' });
    }
    // If only checkpoint has working context, keep it (no conflict logged)
    return { merged, conflicts };
}
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
export function mergePartialResults(checkpoint, current) {
    const merged = {};
    // Start with checkpoint results as base
    for (const [key, value] of Object.entries(checkpoint)) {
        merged[key] = value;
    }
    // Override/merge with current results
    for (const [key, currentValue] of Object.entries(current)) {
        const checkpointValue = checkpoint[key];
        // If both are arrays, concatenate and dedupe
        if (Array.isArray(checkpointValue) && Array.isArray(currentValue)) {
            merged[key] = [...new Set([...checkpointValue, ...currentValue])];
        }
        else {
            // Current value overrides checkpoint value
            merged[key] = currentValue;
        }
    }
    return merged;
}
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
export function createReconciliation(checkpoint, current) {
    return reconcileCheckpoint(checkpoint, current);
}
//# sourceMappingURL=reconciliation.js.map