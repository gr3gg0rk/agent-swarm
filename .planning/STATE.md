# Project State: OpenClaw Swarm

**Last updated:** 2026-02-23

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-22)

**Core value:** Minerva can assign a task to any agent in the swarm and get a result back
**Current focus:** Phase 10 - Context Recovery Integration

## Current Position

Phase: 10 of 11 (Context Recovery Integration) — COMPLETE
Plan: 1 of 1 in current phase
Status: Completed 10-01 (ContextManager Integration with CheckpointManager)
Last activity: 2026-02-23 — Completed 10-01: ContextManager integration with automatic context reference resolution during checkpoint recovery, closing CTX-REF-CHECKPOINT gap

Progress: [██████░░] 56% (18/18 v1.0 plans complete, 9/15 v1.1 plans)

## Performance Metrics

**Velocity:**
- Total plans completed: 24 (v1.0: 18, v1.1: 9)
- Average duration: ~16 min
- Total execution time: ~6.5 hours

**By Phase:**

| Phase | Plans | Total Time | Avg/Plan |
|-------|-------|------------|----------|
| 1 | 3 | ~1h | ~20min |
| 2 | 3 | ~1h | ~20min |
| 3 | 3 | ~1h | ~20min |
| 4 | 2 | ~40min | ~20min |
| 5 | 1 | ~20min | ~20min |
| 6 | 3 | ~15min | ~5min |
| 7 | 3 | ~12min | ~4min |
| 8 | 2 | ~10min | ~5min |
| 9 | 3 | ~9min | ~3min |
| 10 | 1 | ~45min | ~45min |

**Recent Trend:**
- Last 5 plans: ~5min each
- Trend: Consistent (Phase 9 complete with SSE real-time updates)

*Updated after each plan completion*
| Phase 09-03 | 4min | 5 tasks | 5 files |
| Phase 09-02 | 3min | 5 tasks | 5 files |
| Phase 09-01 | 2min | 4 tasks | 4 files |
| Phase 08-02 | 8min | 3 tasks | 2 files |
| Phase 08-01 | 2min | 4 tasks | 4 files |
| Phase 07-optimization P02 | 3min | 3 tasks | 4 files |
| Phase 09-visualization P09-02 | 3min | 5 tasks | 5 files |
| Phase 09 P03 | 262 | 5 tasks | 5 files |
| Phase 10-context-recovery-integration P01 | 45min | 3 tasks | 3 files |
| Phase 11 P01 | 774 | 3 tasks | 6 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [v1.0]: MQTT for communication, SQLite for state, MessagePack for serialization
- [v1.0]: Role-based routing with hierarchical fallback
- [v1.0]: Hybrid checkpointing (60s local + 5min SQLite)
- [v1.1]: Dashboard uses Vite + Alpine.js + Chart.js (NOT Next.js)
- [v1.1]: Connection pools: Pi 2B=3, Pi 5=5, Beelink=10
- [06-01]: Load metrics published on 30-second interval (matching heartbeat), not 5 seconds. ROUT-02 specifies 'every 5 seconds' as minimum, not exact requirement.
- [06-01]: CPU usage calculated via delta measurement between process.cpuUsage() calls for accurate percentage calculation.
- [06-02]: Performance history limited to 1000 records per agent to prevent unbounded growth (per RESEARCH.md Pitfall 3).
- [06-02]: Neutral score (50) returned when no performance history available for graceful degradation.
- [06-02]: Weighted scoring algorithm: 70% load (CPU 40%, memory 40%, task ratio 20%) + 30% performance (success rate 70%, execution time 30%).
- [06-03]: Circuit breaker opens after 3 consecutive rejections, auto-transitions to Half-Open after 60 seconds.
- [06-03]: Exponential backoff: 2^n × 100ms with jitter, max 5s, up to 5 retry attempts.
- [07-01]: Task assignments bypass batching entirely (latency critical per 07-RESEARCH.md Open Question 4)
- [07-01]: Message batching uses dual-trigger flushing (time OR size, whichever first) to prevent unbounded buffer growth
- [07-01]: Per-type batch thresholds: tasks=10ms/50, status=50ms/100, heartbeats=100ms/20 (OPTI-02)
- [07-01]: Batcher wraps MqttClient.publish() with graceful fallback to direct publish on failure (Pitfall 4)
- [Phase 07-optimization]: Connection pooling is opt-in via BrokerConfig.connectionPool parameter
- [Phase 07-optimization]: Hardware detection uses CPU model and total memory (Pi 2B ARMv7, Pi 5 ARMv8, Beelink x86_64)
- [Phase 07-optimization]: LRU eviction when pool at capacity before creating new connection
- [Phase 07-optimization]: Health checks every 30 seconds with 2-minute idle timeout
- [07-03]: Context payloads >10KB passed by SHA-256 hash reference instead of full content (OPTI-05)
- [07-03]: Context stored in SQLite with WITHOUT ROWID optimization for hash primary key (OPTI-06)
- [07-03]: 7-day retention policy for unused contexts, 3-day for low-access contexts
- [07-03]: Automatic deduplication via SHA-256 hash collision detection
- [07-03]: Access tracking (access_count, last_accessed) for garbage collection heuristics
- [08-01]: Checksum computed before write (before fsync) to catch write-time corruption (CHKP-01)
- [08-01]: Checksum validation on local files only (SQLite has built-in WAL integrity)
- [08-01]: Optional checksum field for backward compatibility with existing checkpoints
- [08-01]: Checksum mismatch triggers corruption recovery flow (request_guidance action)
- [08-01]: CRC32 computed using crc-32 library (SheetJS, C-optimized, <1ms for 1MB)
- [08-02]: Keep 3 most recent checkpoints per task for fallback on corruption (CHKP-02)
- [08-02]: MQTT alert topic 'swarm/alerts/checkpoint' for corruption monitoring
- [08-02]: Retention cleanup runs during periodic 5-minute sync interval
- [08-02]: Corrupted checkpoints deleted immediately after successful fallback
- [08-02]: Task completion cleanup hook ready for integration with task handlers
- [Phase 08-checkpointing-gaps]: Vector clocks use hybrid design (wall clock timestamp + per-machine counters) to handle both clock skew and ordering accuracy
- [Phase 08-checkpointing-gaps]: Vector clock comparison uses standard academic algorithm (before/after/concurrent/equal) for happened-before detection
- [Phase 08-checkpointing-gaps]: Reconciliation merges checkpoint with current state (not overwrite) - progress uses MAX, partial results merge objects/arrays
- [Phase 08-checkpointing-gaps]: Older checkpoints rejected based on vector clock comparison, concurrent checkpoints accepted
- [09-01]: Dashboard runs on griak-brain only (per VIZ-06) - NOT installed on Pi 2B workers to respect memory constraints
- [09-01]: Vite chosen for build tool: fast HMR, native ESM, ~5MB footprint (well under 50MB requirement)
- [09-01]: Alpine.js for reactive UI: ~15KB vs React/Vue 10-100x larger footprint (sufficient for read-only dashboard)
- [09-01]: Chart.js 4.x for visualization: ~60KB minified, simple API, responsive charts
- [09-01]: Dev server proxy configured for /api -> localhost:3000 (coordination backend)
- [09-02]: Agent status uses color-coded text (not badges) for cleaner table design
- [09-02]: Progress bars calculate elapsed time vs timeout for visual feedback
- [09-02]: Chart.js initialized with empty datasets (populated via SSE in 09-03)
- [09-03]: SSE chosen over WebSocket for server-to-client push (lighter, sufficient for dashboard)
- [09-03]: Throttling set to 100ms interval (10 updates/second) per VIZ-05 requirement
- [09-03]: MQTT subscription to agent/+/load for load metrics updates
- [09-03]: Browser auto-reconnect for SSE connections (default EventSource behavior)
- [10-01]: ContextManager integration with CheckpointManager via optional constructor parameter (dependency injection pattern)
- [10-01]: Context references resolved via resolveMessagePayload() in loadCheckpointWithFallback() only (not during checkpoint creation)
- [10-01]: Graceful degradation for missing context references: log warning but continue recovery
- [10-01]: Checkpoint ID format must be {taskId}-{uuid} for listByTask() to work correctly
- [Phase 11]: Production-safe defaults: both optimizations enabled by default
- [Phase 11]: Independent feature flags allow granular debugging
- [Phase 11]: Environment variables as configuration (no dotenv dependency)

### Pending Todos

None.

### Blockers/Concerns

None.

### v1.1 Hardware Constraints

Critical for Phase 6-9:
- griak-worker-2 (Pi 2B, 1GB RAM) — coordination layer must stay under 85% memory
- Dashboard runs on griak-brain only, NOT on Pi 2B workers
- Connection pool limits: Pi 2B=3, Pi 5=5, Beelink=10

## Session Continuity

Last session: 2026-02-23
Stopped at: Completed 10-01 (Context Recovery Integration), Phase 10 COMPLETE
Resume file: None

Next: Phase 10 complete - CTX-REF-CHECKPOINT gap closed. Context references are now resolved automatically during checkpoint recovery. Ready for Phase 11: Opt-In Feature Activation.

---
*State updated: 2026-02-23 — Phase 10 COMPLETE (1/1 plans)*
