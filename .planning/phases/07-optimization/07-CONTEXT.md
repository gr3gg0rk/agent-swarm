# Phase 7: Optimization - Context

**Gathered:** 2026-02-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Performance optimization layer for the message passing system implementing batching, connection pooling, and context reference passing. This phase improves throughput by 10x through infrastructure-level optimizations: buffering high-frequency messages, reusing MQTT connections via pools (hardware-aware limits), and passing large contexts by reference ID instead of full content. Does not change message semantics, only transport efficiency.

</domain>

<decisions>
## Implementation Decisions

### Batching behavior
- All batching decisions delegated to Claude's discretion
- Per-type thresholds already defined: tasks=10ms, status=50ms, heartbeats=100ms
- Researcher should investigate optimal flush triggers, priority message handling, overflow behavior, and batch sizing strategies

### Connection pooling
- All pooling decisions delegated to Claude's discretion
- Hardware-aware pool limits already defined: Pi 2B=3, Pi 5=5, Beelink=10
- Researcher should investigate eviction policy, health check frequency, exhaustion handling, and reconnection strategy

### Context references
- All context reference decisions delegated to Claude's discretion
- Requirements specify: 10KB threshold for reference passing, SQLite storage with hash-based deduplication
- Researcher should investigate retention policy, garbage collection triggers, reference ID generation, and cache synchronization

### Degradation mode
- All degradation strategy decisions delegated to Claude's discretion
- System must remain functional even when optimization features fail
- Researcher should investigate fallback strategies for batching failures, pool exhaustion, context storage failures, and cascade failure scenarios

### Claude's Discretion
- All optimization implementation details are at Claude's discretion
- User has no specific preferences on batching triggers, pool policies, context lifecycle, or degradation paths
- Primary goal: achieve 10x throughput improvement while maintaining system reliability
- Research and planning phases should determine optimal approaches based on system constraints

</decisions>

<specifics>
## Specific Ideas

- No specific requirements or references — user trusts Claude to determine optimal implementation strategies
- Success criteria from roadmap are the primary constraints (batching thresholds, pool limits, context size threshold)
- Hardware constraints (Pi 2B, Pi 5, Beelink) must be respected in all optimization decisions

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-optimization*
*Context gathered: 2026-02-22*
