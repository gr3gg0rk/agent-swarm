# Phase 4: Error Handling & Recovery - Context

**Gathered:** 2026-02-21
**Status:** Ready for planning

<domain>
## Phase Boundary

System handles failures gracefully and recovers from crashes. Agents resume from last checkpoint after restart, and the system runs on constrained hardware (Pi 2B, 1GB RAM) without OOM errors. Creating new task types, new agent capabilities, or new communication patterns belong in other phases.

</domain>

<decisions>
## Implementation Decisions

### Checkpointing
- Hybrid storage: local files for frequent checkpoints (every 60s), sync to SQLite on both shutdown and every 5 minutes
- Cross-machine recovery: agent on any machine can resume from SQLite-synced checkpoint
- Include in checkpoint: task progress, working context, resource handles, time invested
- Sync triggers: agent shutdown (graceful or crash) AND periodic 5-minute timer
- Write pattern: async writes by default, sync writes for critical tasks (Claude's discretion based on task type)

### Checkpoint Frequency
- 60-second checkpoint interval when task state has changed (skip if unchanged)
- Smart filtering: checkpoint tasks over 2 minutes duration, or tasks explicitly marked checkpoint-worthy by Minerva
- Short tasks (<2 min, not marked): skip checkpointing, restart from scratch if crash
- Active-only checkpointing: skip if task is blocked, waiting on dependency, or idle

### Resume Behavior
- Resume from checkpoint by default (not restart fresh)
- Before resuming: check if task is still relevant (not cancelled, not timed out, dependencies still valid)
- Partial results: task-specific handling (some tasks resume partial, others need clean state - implementation decides)
- Checkpoint corruption: request guidance from Minerva (don't auto-restart, don't auto-recover)
- Progress reporting: combined message with resume event + current progress
- Retry budget: resume attempts independent from retry budget (resume 5x, retry 3x, separate counters)

### Memory Management (Pi 2B - 1GB RAM)
- Priority: balanced approach between system stability and task completion
- Throttle threshold: 85% memory usage (850MB of 1GB) before throttling kicks in
- Throttle action: pause in-progress tasks to free memory, resume when pressure decreases
- Temporary bursts: allow for critical tasks, but checkpoint and pause non-critical tasks
- Graceful degradation: prefer pausing over killing, checkpoint before stopping if possible

### Claude's Discretion
- Sync vs async checkpoint writes for specific task types
- Exact memory threshold tuning based on observed behavior
- How to handle tasks with no checkpoint data that crash near completion
- Resource handle serialization format (JSON, MessagePack, etc.)

</decisions>

<specifics>
## Specific Ideas

- "Hybrid approach balances performance with recovery - local for speed, SQLite for cross-machine"
- "Don't waste checkpoint I/O on tasks that don't need it (short tasks, unchanged state)"
- "Pause tasks, don't kill them - gives system chance to recover without losing work"
- "Check before resuming - no point continuing a task that was cancelled or timed out"

</specifics>

<deferred>
## Deferred Ideas

- Checkpointing for sub-2-minute tasks by default - could revisit if crash frequency is high
- Proactive task migration from overloaded machines - defer to future phase
- Memory prediction before task dispatch - defer to optimization phase

</deferred>

---

*Phase: 04-error-handling-recovery*
*Context gathered: 2026-02-21*
