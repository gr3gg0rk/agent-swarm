/**
 * Vector Clock for Cross-Machine Checkpoint Ordering
 *
 * Hybrid vector clock implementation combining wall clock timestamp
 * with per-machine logical counters. Handles clock skew while providing
 * accurate happened-before relationships across distributed agents.
 *
 * Per 08-03-PLAN.md Task 1.
 * Per 08-RESEARCH.md: Hybrid approach for clock skew tolerance.
 */
/**
 * Vector clock data structure.
 *
 * Combines wall clock timestamp with logical counters per machine.
 * The timestamp provides coarse ordering, counters provide precise causality.
 */
export interface VectorClock {
    /** Wall clock timestamp in milliseconds */
    timestamp: number;
    /** Per-machine logical counters (machineId -> counter) */
    counters: Map<string, number>;
}
/**
 * Result of comparing two vector clocks.
 *
 * Standard vector clock comparison outcomes from distributed systems literature.
 */
export type VectorClockComparison = 'before' | 'after' | 'concurrent' | 'equal';
/**
 * Vector clock implementation with hybrid (wall clock + counter) design.
 *
 * - Each machine has its own counter that increments on each event
 * - Wall clock timestamp updated on each tick for coarse ordering
 * - Comparison uses standard vector clock algorithm on counters
 * - Merge takes MAX of each counter for reconciliation
 *
 * Per 08-CONTEXT.md: Hybrid approach handles both skew and ordering.
 * Per 08-RESEARCH.md: Standard academic algorithm for comparison.
 *
 * @example
 * ```typescript
 * const clock1 = new VectorClockImpl('agent-1');
 * const clock2 = new VectorClockImpl('agent-2');
 *
 * // Tick both clocks independently
 * const vc1 = clock1.tick(); // agent-1 counter = 1
 * const vc2 = clock2.tick(); // agent-2 counter = 1
 *
 * // Compare clocks
 * const comparison = clock1.compare(vc2); // 'concurrent'
 *
 * // Merge remote clock
 * clock1.merge(vc2); // agent-1 counter = 1, agent-2 counter = 1
 * ```
 */
export declare class VectorClockImpl {
    /** Unique identifier for this machine/agent */
    private readonly machineId;
    /** Internal clock state */
    private clock;
    /**
     * Creates a new VectorClockImpl instance.
     *
     * @param machineId - Unique identifier for this machine (typically agent ID)
     * @param initialTimestamp - Optional initial timestamp (defaults to Date.now())
     */
    constructor(machineId: string, initialTimestamp?: number);
    /**
     * Increments this machine's counter and updates timestamp.
     *
     * Called before creating a checkpoint to establish causality.
     * Returns a clone to prevent external mutation of internal state.
     *
     * @returns Cloned vector clock after tick
     */
    tick(): VectorClock;
    /**
     * Merges another vector clock into this one.
     *
     * Takes MAX of each counter for all machines in both clocks.
     * Updates timestamp to maximum (handles clock skew).
     *
     * Called when receiving checkpoints from other machines to
     * maintain causality across the distributed system.
     *
     * @param other - Vector clock to merge (typically from remote checkpoint)
     */
    merge(other: VectorClock): void;
    /**
     * Compares this clock with another for happened-before relationship.
     *
     * Standard vector clock comparison algorithm:
     * - Check all machines in both clocks
     * - If all counters <= and at least one <, return 'before'
     * - If all counters >= and at least one >, return 'after'
     * - If neither condition met (some <, some >), return 'concurrent'
     * - If all equal, return 'equal'
     *
     * Per 08-RESEARCH.md: Academic algorithm from distributed systems literature.
     *
     * @param other - Vector clock to compare against
     * @returns Comparison result indicating ordering relationship
     */
    compare(other: VectorClock): VectorClockComparison;
    /**
     * Checks if this clock is newer or concurrent compared to another.
     *
     * Returns true if comparison is 'after' or 'concurrent'.
     * Used to accept/reject checkpoints during recovery.
     *
     * Per 08-CONTEXT.md: Reject older checkpoints, accept newer or concurrent.
     *
     * @param other - Vector clock to compare against
     * @returns True if this clock is newer or concurrent
     */
    isNewerOrConcurrent(other: VectorClock): boolean;
    /**
     * Creates a deep copy of the current clock.
     *
     * Returns a clone to prevent external mutation of internal state.
     * Used by tick() to return immutable snapshots.
     *
     * @returns Deep copy of the vector clock
     */
    clone(): VectorClock;
    /**
     * Serializes the vector clock to JSON for storage.
     *
     * Converts Map to plain object for JSON serialization.
     * Used when storing checkpoints in SQLite or local files.
     *
     * @returns Plain object representation for JSON serialization
     */
    toJSON(): object;
    /**
     * Deserializes JSON to create a new VectorClockImpl instance.
     *
     * Factory method that recreates a vector clock from stored JSON.
     * Used when loading checkpoints from storage.
     *
     * @param json - Plain object from JSON deserialization
     * @param machineId - Machine ID for the new instance
     * @returns New VectorClockImpl instance with restored clock state
     */
    static fromJSON(json: object, machineId: string): VectorClockImpl;
    /**
     * Gets the internal clock state.
     *
     * Useful for testing and debugging.
     *
     * @returns Current vector clock state
     */
    getClock(): VectorClock;
    /**
     * Gets the machine ID for this clock instance.
     *
     * @returns Machine ID
     */
    getMachineId(): string;
}
/**
 * Factory function to create a VectorClockImpl instance.
 *
 * @param machineId - Unique identifier for this machine
 * @param initialTimestamp - Optional initial timestamp
 * @returns New VectorClockImpl instance
 */
export declare function createVectorClock(machineId: string, initialTimestamp?: number): VectorClockImpl;
//# sourceMappingURL=vector-clock.d.ts.map