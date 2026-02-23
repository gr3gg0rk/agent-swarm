# Phase 8: Checkpointing Gaps - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Robustness enhancements for the existing checkpoint system — atomic writes with checksums, corruption recovery with multi-checkpoint fallback, state reconciliation during recovery, and vector clocks for cross-machine ordering. Checkpoint compression, incremental dumps, and rollback are v2.0 features.

</domain>

<decisions>
## Implementation Decisions

### Corruption handling
- Fallback + alert: Log warning, fall back to previous checkpoint (one of 3 retained), emit MQTT alert event for monitoring
- Validate CRC32 on local files only (SQLite is less prone to corruption)
- Compute checksum on write (before fsync) and validate on load — catch corruption early
- Delete corrupted checkpoint immediately after successful fallback (clean up storage)

### State reconciliation
- Timestamp-based merge: When checkpoint conflicts with current state, newer timestamps win on field-by-field basis
- For progress field: Take MAX(checkpoint progress, current progress) — progress should never go backwards
- For partialResults: Merge both sets (merge arrays, merge object keys)
- On incompatible states (schema mismatch): Restart task from scratch, log warning

### Vector clocks
- Hybrid approach: Wall clock timestamp + counter per machine (handles both skew and ordering)
- Reject older checkpoints: Accept only if vector clock comparison shows newer or concurrent
- No maximum age limit — vector clocks handle any amount of skew naturally
- Store vector clock data in checkpoint metadata field (separate from payload, indexed for queries)

### Retention policy
- Keep 3 most recent checkpoints per task — each task has independent fallback chain
- Cleanup on periodic sync (5-minute interval) — batch cleanup during SQLite sync
- Apply retention to both local files and SQLite entries (consistent state)
- On task completion: Delete all checkpoints (cleanest — completed tasks don't need recovery)

### Claude's Discretion
- Exact vector clock comparison algorithm (happened-before vs concurrent detection)
- CRC32 implementation details (library choice, performance optimization)
- MQTT alert topic and payload format for corruption events
- Indexing strategy for vector clock metadata in SQLite

</decisions>

<specifics>
## Specific Ideas

- Existing LocalFileStore already uses atomic write pattern (temp file + rename) — extend with CRC32 checksum
- SQLiteSync already has deleteOldCheckpoints() method — wire up retention policy
- CheckpointData interface can be extended with vectorClock field without breaking existing code

</specifics>

<deferred>
## Deferred Ideas

- Checkpoint compression with gzip (CHKP-06) — v2.0
- Incremental checkpoints (only dirty state, CHKP-07) — v2.0
- Rollback to previous checkpoint / time travel (CHKP-08) — v2.0

</deferred>

---

*Phase: 08-checkpointing-gaps*
*Context gathered: 2026-02-22*
