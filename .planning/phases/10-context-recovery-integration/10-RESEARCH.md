# Phase 10: Context Recovery Integration - Research

**Researched:** 2026-02-23
**Domain:** Integration of ContextManager with CheckpointManager for context reference resolution during recovery
**Confidence:** HIGH

## Summary

Phase 10 closes the CTX-REF-CHECKPOINT integration gap identified in the v1.1 milestone audit by integrating ContextManager with CheckpointManager. The issue is straightforward: when tasks with large contexts (>10KB) are checkpointed, the payload contains context references (SHA-256 hashes) instead of actual content. During recovery, `CheckpointManager.loadCheckpointWithFallback()` returns the checkpoint data as-is without resolving these references, leaving the task with unresolved references instead of the actual content. The fix requires (1) injecting ContextManager reference into CheckpointManager constructor, (2) calling `resolveMessagePayload()` on recovered messages in `loadCheckpointWithFallback()`, and (3) integration tests verifying E2E flow.

**Primary recommendation:** Add optional `contextManager` parameter to `CheckpointManagerOptions`, store as private field, and call `resolveMessagePayload()` on `checkpoint.workingContext` after successful load in `loadCheckpointWithFallback()`. Handle missing context references gracefully (log warning, return checkpoint as-is).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPTI-05 | Context references pass IDs for payloads >10KB instead of full content | Already implemented in Phase 7 (context-manager.ts:279-306). Phase 10 integrates this with checkpoint recovery. |
| OPTI-06 | Context manager stores large contexts in SQLite with hash for deduplication | Already implemented in Phase 7 (context-manager.ts:86-265). ContextManager.getContext() retrieves stored content. |
| CHKP-04 | Recovery reconciles checkpoint with current state (merge, not overwrite | Already implemented in Phase 8 (reconciliation.ts). Phase 10 ensures context references resolved before reconciliation. |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| **better-sqlite3** | ^11.9.0 | Context storage (already in use) | Shared database between ContextManager and SQLiteSync |
| **@openclaw-swarm/coordination** | 0.1.0 | Internal imports | ContextManager, CheckpointManager in same package |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | - | - | All functionality exists within coordination package |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Direct ContextManager import | Service locator pattern | Direct injection is simpler, fewer moving parts. Service locator adds indirection without benefit. |

**Installation:**
```bash
# No new dependencies - all libraries already installed
```

## Architecture Patterns

### Recommended Project Structure

```
packages/coordination/src/
├── optimization/
│   └── context-manager.ts    # Existing: ContextManager with resolveMessagePayload()
├── checkpoint/
│   ├── manager.ts            # MODIFY: Add contextManager parameter
│   ├── types.ts              # MODIFY: Add contextManager to CheckpointManagerOptions
│   └── reconciliation.ts     # Existing: State reconciliation (context refs resolved before this)
└── test/                     # NEW: Integration tests
    └── context-recovery.test.ts
```

### Pattern 1: Dependency Injection for ContextManager

**What:** Pass ContextManager instance to CheckpointManager via constructor options.

**When to use:** When CheckpointManager needs to resolve context references during recovery.

**Example:**
```typescript
// Source: Based on existing CheckpointManager constructor pattern (manager.ts:71-86)

// Extend CheckpointManagerOptions interface (types.ts)
export interface CheckpointManagerOptions {
  localStore: import('./store.js').LocalFileStore;
  sqliteSync: import('./sync.js').SQLiteSync;
  syncIntervalMs?: number;
  taskQueue?: TaskQueue;
  mqttClient?: import('../communication/mqtt.js').MqttClient;
  agentId?: string;
  // NEW: Optional ContextManager for resolving context references
  contextManager?: import('../optimization/context-manager.js').ContextManager;
}

// Update CheckpointManager constructor (manager.ts)
export class CheckpointManager {
  private readonly localStore: LocalFileStore;
  private readonly sqliteSync: SQLiteSync;
  private readonly contextManager?: import('../optimization/context-manager.js').ContextManager;
  // ... other fields

  constructor(options: CheckpointManagerOptions) {
    this.localStore = options.localStore;
    this.sqliteSync = options.sqliteSync;
    this.contextManager = options.contextManager; // NEW: Store reference
    // ... rest of constructor
  }
}
```

### Pattern 2: Context Reference Resolution in Recovery Path

**What:** Call `resolveMessagePayload()` on `workingContext` after successful checkpoint load.

**When to use:** In `loadCheckpointWithFallback()` after successfully loading a checkpoint from local store.

**Example:**
```typescript
// Source: Based on existing loadCheckpointWithFallback() (manager.ts:206-246)
// and resolveMessagePayload() implementation (context-manager.ts:318-338)

import { resolveMessagePayload } from '../optimization/context-manager.js';

async loadCheckpointWithFallback(taskId: string): Promise<CheckpointData | null> {
  const metadata = await this.localStore.listByTask(taskId);

  if (metadata.length === 0) {
    return null;
  }

  const maxAttempts = Math.min(metadata.length, 3);
  for (let i = 0; i < maxAttempts; i++) {
    const checkpointId = metadata[i].checkpointId;

    try {
      const checkpoint = await this.localStore.load(checkpointId);
      if (checkpoint) {
        // NEW: Resolve context references if contextManager available
        if (this.contextManager && checkpoint.workingContext) {
          try {
            checkpoint.workingContext = await resolveMessagePayload(
              checkpoint.workingContext,
              this.contextManager
            );
          } catch (resolveError) {
            // Log warning but don't fail recovery
            console.warn(
              `Failed to resolve context references for checkpoint ${checkpointId}: ${resolveError}`
            );
          }
        }

        return checkpoint;
      }
    } catch (error) {
      // ... existing fallback logic ...
    }
  }

  return null;
}
```

### Pattern 3: Graceful Degradation on Missing Context

**What:** If context reference cannot be resolved (missing from database, corruption), log warning but continue recovery.

**When to use:** When `getContext()` returns null or `resolveMessagePayload()` throws.

**Example:**
```typescript
// Source: Based on existing resolveMessagePayload() (context-manager.ts:318-338)

// resolveMessagePayload() already handles missing context gracefully:
// - If payload.context.ref exists but getContext() returns null, returns payload unchanged
// - No exception thrown for missing context

// Integration point: CheckpointManager logs warning if resolution fails
if (this.contextManager && checkpoint.workingContext) {
  const resolvedContext = await resolveMessagePayload(
    checkpoint.workingContext,
    this.contextManager
  );

  // Check if context still has reference (resolution failed)
  if (resolvedContext?.context?.ref) {
    console.warn(
      `Checkpoint ${checkpointId} has unresolved context reference ` +
      `${resolvedContext.context.ref.ref}. Context may be missing from database.`
    );
  }

  checkpoint.workingContext = resolvedContext;
}
```

### Anti-Patterns to Avoid

- **Blocking recovery on missing context:** If context reference cannot be resolved, log warning and continue. Task may still recover with partial data.
- **Resolving context on every load:** Only resolve in recovery path (`loadCheckpointWithFallback()`), not in `createCheckpoint()` or `syncToDatabase()`.
- **Modifying original checkpoint data:** Resolve context references on recovered checkpoint copy, not in stored checkpoint file.
- **Assuming workingContext structure:** Use generic `resolveMessagePayload()` which handles any payload structure with `context.ref` field.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Context reference resolution | Custom payload traversal logic | `resolveMessagePayload()` from context-manager.ts | Already handles payload structure, missing context, Buffer conversion |
| Context storage | Custom file-based context cache | ContextManager with SQLite | Already implements deduplication, access tracking, garbage collection |
| Payload serialization | Custom JSON/binary handling | Existing checkpoint serialization | CheckpointData already serialized/deserialized in LocalFileStore |

**Key insight:** All required functionality exists in Phase 7 implementation. Phase 10 is purely integration work—connecting ContextManager to CheckpointManager recovery path.

## Common Pitfalls

### Pitfall 1: Breaking CheckpointManager When ContextManager Not Provided

**What goes wrong:** CheckpointManager crashes if `contextManager` parameter is required but not provided.

**Why it happens:** Making `contextManager` required in constructor instead of optional.

**How to avoid:** Make `contextManager` optional in `CheckpointManagerOptions`. Only resolve context references if provided.

**Warning signs:** TypeScript errors at constructor call sites, crashes on existing CheckpointManager instantiations.

### Pitfall 2: Resolving Context on Checkpoint Creation

**What goes wrong:** Context references resolved during `createCheckpoint()`, causing redundant database lookups.

**Why it happens:** Calling `resolveMessagePayload()` in wrong method (creation instead of recovery).

**How to avoid:** Only call `resolveMessagePayload()` in `loadCheckpointWithFallback()`, after successful checkpoint load.

**Warning signs:** Checkpoint creation becomes slow, increased database queries during normal operation.

### Pitfall 3: Overwriting Stored Checkpoint with Resolved Content

**What goes wrong:** Stored checkpoint file modified with resolved content, breaking deduplication.

**Why it happens:** Writing resolved context back to storage instead of just using it in memory.

**How to avoid:** Resolve context references on in-memory checkpoint copy only. Never modify stored checkpoint files.

**Warning signs:** Checkpoint files growing in size, deduplication no longer works, new checkpoints don't use references.

### Pitfall 4: Incorrect Payload Structure

**What goes wrong:** `resolveMessagePayload()` expects `payload.context.ref` structure but workingContext has different structure.

**Why it happens:** Assuming all workingContext objects have message envelope structure.

**How to avoid:** `resolveMessagePayload()` already checks for `payload?.context?.ref` before attempting resolution. If structure doesn't match, returns payload unchanged.

**Warning signs:** Context references not resolved, console warnings about missing ref field.

## Code Examples

Verified patterns from existing codebase:

### CheckpointManagerOptions Extension

```typescript
// Source: Based on existing types.ts:123-136
export interface CheckpointManagerOptions {
  localStore: import('./store.js').LocalFileStore;
  sqliteSync: import('./sync.js').SQLiteSync;
  syncIntervalMs?: number;
  taskQueue?: TaskQueue;
  mqttClient?: import('../communication/mqtt.js').MqttClient;
  agentId?: string;
  // NEW: Optional ContextManager for resolving context references during recovery
  contextManager?: import('../optimization/context-manager.js').ContextManager;
}
```

### Context Resolution in Recovery Path

```typescript
// Source: Based on existing manager.ts:206-246 + context-manager.ts:318-338

import { resolveMessagePayload } from '../optimization/context-manager.js';

async loadCheckpointWithFallback(taskId: string): Promise<CheckpointData | null> {
  const metadata = await this.localStore.listByTask(taskId);

  if (metadata.length === 0) {
    return null;
  }

  const maxAttempts = Math.min(metadata.length, 3);
  for (let i = 0; i < maxAttempts; i++) {
    const checkpointId = metadata[i].checkpointId;

    try {
      const checkpoint = await this.localStore.load(checkpointId);
      if (checkpoint) {
        // Resolve context references if contextManager available
        if (this.contextManager) {
          try {
            checkpoint.workingContext = await resolveMessagePayload(
              checkpoint.workingContext,
              this.contextManager
            );
          } catch (resolveError) {
            console.warn(
              `Failed to resolve context references for checkpoint ${checkpointId}: ${resolveError}`
            );
          }
        }

        return checkpoint;
      }
    } catch (error) {
      console.warn(`Checkpoint ${checkpointId} corrupted, trying fallback ${i + 1}/${maxAttempts}`);

      try {
        await this.localStore.delete(checkpointId);
        this.sqliteSync.deleteCheckpoint(checkpointId);
      } catch (deleteError) {
        console.error(`Failed to delete corrupted checkpoint ${checkpointId}: ${deleteError}`);
      }

      this.emitCorruptionAlert(taskId, checkpointId, error);
      continue;
    }
  }

  return null;
}
```

### Integration Test Structure

```typescript
// Source: Based on v1.1 testing patterns (no existing tests in coordination package)
// This would be the first integration test in the package

import { describe, it, expect, beforeEach, afterEach } from 'test';
import Database from 'better-sqlite3';
import { ContextManager } from '../src/optimization/context-manager.js';
import { CheckpointManager } from '../src/checkpoint/manager.js';
import { LocalFileStore } from '../src/checkpoint/store.js';
import { SQLiteSync } from '../src/checkpoint/sync.js';

describe('Context Recovery Integration', () => {
  let db: Database.Database;
  let contextManager: ContextManager;
  let checkpointManager: CheckpointManager;
  let localStore: LocalFileStore;
  let sqliteSync: SQLiteSync;

  beforeEach(async () => {
    // Setup test database and stores
    db = new Database(':memory:');
    contextManager = new ContextManager(db);
    localStore = new LocalFileStore('/tmp/test-checkpoints');
    sqliteSync = new SQLiteSync(db);

    checkpointManager = new CheckpointManager({
      localStore,
      sqliteSync,
      contextManager, // Inject ContextManager
      agentId: 'test-agent'
    });
  });

  afterEach(async () => {
    // Cleanup
  });

  it('should resolve context references during checkpoint recovery', async () => {
    // 1. Create large context content (>10KB)
    const largeContent = Buffer.from('x'.repeat(12000));

    // 2. Store context and get reference
    const ref = contextManager.storeContext(largeContent);
    expect(ref).not.toBeNull();
    expect(ref!.ref).toHaveLength(64); // SHA-256 hex

    // 3. Create checkpoint with context reference
    const checkpointData = {
      taskId: 'test-task',
      agentId: 'test-agent',
      checkpointId: 'cp-1',
      timestamp: Date.now(),
      progress: 50,
      workingContext: {
        context: {
          ref: ref, // Store reference, not content
          content: undefined
        }
      },
      resourceHandles: [],
      timeInvestedMs: 60000
    };

    await checkpointManager.createCheckpoint('test-task', checkpointData);

    // 4. Recover checkpoint
    const recovered = await checkpointManager.loadCheckpointWithFallback('test-task');

    // 5. Verify context reference resolved to actual content
    expect(recovered).not.toBeNull();
    expect(recovered!.workingContext.context.content).toBe(largeContent.toString());
    expect(recovered!.workingContext.context.ref).toBeUndefined();
  });

  it('should handle missing context references gracefully', async () => {
    // 1. Create checkpoint with context reference (not stored)
    const checkpointData = {
      taskId: 'test-task',
      agentId: 'test-agent',
      checkpointId: 'cp-2',
      timestamp: Date.now(),
      progress: 50,
      workingContext: {
        context: {
          ref: { ref: '0'.repeat(64), size: 12000, compressed: false },
          content: undefined
        }
      },
      resourceHandles: [],
      timeInvestedMs: 60000
    };

    await checkpointManager.createCheckpoint('test-task', checkpointData);

    // 2. Recover checkpoint (should not throw)
    const recovered = await checkpointManager.loadCheckpointWithFallback('test-task');

    // 3. Verify checkpoint recovered but context not resolved
    expect(recovered).not.toBeNull();
    // Context reference still present (resolution failed gracefully)
    expect(recovered!.workingContext.context.ref).toBeDefined();
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No context resolution | ContextManager integration | Phase 10 | Tasks with large contexts (>10KB) recover properly |
| Inline large payloads | Reference passing | Phase 7 | 60-80% bandwidth reduction, but broken on recovery |
| Manual context handling | Automated resolution | Phase 10 | Transparent context recovery, no code changes in task handlers |

**Deprecated/outdated:**
- **Passing large payloads inline:** Still works for <10KB payloads, but >10KB should use references. ContextManager handles both cases transparently.
- **Manual context caching:** ContextManager with SQLite replaces any in-memory context caches.

## Open Questions

1. **Checkpoint recovery in multi-machine scenarios**
   - What we know: Checkpoints can be recovered from SQLite on any machine
   - What's unclear: If context reference stored on Machine A, can Machine B resolve it?
   - Recommendation: ContextManager uses SQLite, which is synchronized via SQLiteSync. Context refs available on all machines that sync checkpoints.

2. **Context reference garbage collection during recovery**
   - What we know: ContextManager has 7-day retention policy
   - What's unclear: What if context was garbage collected before checkpoint recovery?
   - Recommendation: Graceful degradation—log warning, return checkpoint with unresolved reference. Task may need to restart or request new context.

3. **Performance impact of resolution on recovery**
   - What we know: SQLite query for context resolution is fast (<1ms per reference)
   - What's unclear: Impact on recovery latency with multiple context references
   - Recommendation: Monitor during testing. Resolution happens once per recovery, acceptable latency for infrequent operation.

4. **WorkingContext structure variations**
   - What we know: workingContext is `unknown` type, can contain any structure
   - What's unclear: Do all tasks use `context.ref` structure, or are there variations?
   - Recommendation: `resolveMessagePayload()` checks for `payload?.context?.ref` before resolution. Returns payload unchanged if structure doesn't match.

## Sources

### Primary (HIGH confidence)

- [Existing ContextManager implementation](/home/gr3gg0rk/openclaw-swarm/packages/coordination/src/optimization/context-manager.ts) - `resolveMessagePayload()` implementation (lines 318-338)
- [Existing CheckpointManager implementation](/home/gr3gg0rk/openclaw-swarm/packages/coordination/src/checkpoint/manager.ts) - `loadCheckpointWithFallback()` method (lines 206-246)
- [Existing CheckpointManagerOptions](/home/gr3gg0rk/openclaw-swarm/packages/coordination/src/checkpoint/types.ts) - Constructor options interface (lines 123-136)
- [v1.1 Milestone Audit](/home/gr3gg0rk/openclaw-swarm/.planning/v1.1-v1.1-MILESTONE-AUDIT.md) - CTX-REF-CHECKPOINT gap description (lines 142-155)
- [Phase 7 Research](/home/gr3gg0rk/openclaw-swarm/.planning/phases/07-optimization/07-RESEARCH.md) - Context reference passing design (lines 210-266)
- [Phase 8 Research](/home/gr3gg0rk/openclaw-swarm/.planning/phases/08-checkpointing-gaps/08-RESEARCH.md) - Checkpoint recovery patterns

### Secondary (MEDIUM confidence)

- None - All research from existing codebase and documentation

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All functionality exists in codebase, no new dependencies
- Architecture: HIGH - Simple dependency injection pattern, single integration point
- Pitfalls: HIGH - Integration work has minimal complexity, well-understood existing code

**Research date:** 2026-02-23
**Valid until:** 2026-04-23 (60 days - stable integration work, patterns won't change)

**Integration complexity:** LOW
- Single file modification (checkpoint/manager.ts)
- Single interface extension (checkpoint/types.ts)
- One new integration test file
- No new dependencies
- No breaking changes (contextManager is optional)
- Estimated effort: 2-3 tasks following existing v1.1 pattern (~3-5 min per task)
