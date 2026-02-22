# Pitfalls Research: v1.1 Enhancements

**Domain:** Advanced Agent Swarm Coordination (v1.1 Enhancements)
**Project:** OpenClaw Swarm
**Researched:** 2026-02-22
**Confidence:** MEDIUM

## Focus: v1.1 Enhancement Pitfalls

This document covers pitfalls specific to adding v1.1 features to an already-working v1.0 system:
- Advanced routing (dynamic capabilities, load-based routing, multi-capability matching)
- Optimization (context references, message batching, connection pooling)
- Checkpointing gaps (cross-machine recovery, clock skew, corruption)
- Visualization (web dashboard, real-time updates)

**CRITICAL CONSTRAINT:** griak-worker-2 is a Pi 2B with 1GB RAM. Any feature pushing memory over 85% will trigger throttling.

---

## Critical Pitfalls

### Pitfall 1: Dynamic Routing Race Conditions

**What goes wrong:**
Capability updates and load tracking changes cause routing decisions based on stale data. Tasks routed to agents that no longer have the required capability, or routing cascades failures when multiple agents update simultaneously.

**Why it happens:**
Concurrent capability updates without proper synchronization create inconsistent routing state. Load tracking metrics arrive asynchronously, causing routing algorithms to make decisions based on outdated information. Dynamic capability advertisements propagate with delays, creating temporary routing inconsistencies.

**How to avoid:**
- Implement version vectors for capability sets to detect conflicts
- Use quorum reads before routing decisions (read from majority of agents)
- Cache capability data with short TTL (5-10s) and explicit invalidation
- Implement capability change notification via MQTT pub/sub
- Design routing to be tolerant of temporary inconsistencies

**Warning signs:**
- Tasks routed to agents lacking required capabilities
- "Agent not found" errors increase after capability changes
- Routing decisions oscillate between agents
- Load balancing produces uneven distribution despite metrics

**Phase to address:**
Phase 1 (Advanced Routing) - Implement versioned capability discovery from the start

**Detection:**
- Log routing decision timestamp vs. capability update timestamp
- Alert on task rejections due to capability mismatches
- Monitor routing stability (agent switching frequency)

---

### Pitfall 2: Load Tracking Overhead on Pi 2B

**What goes wrong:**
Load tracking itself consumes significant CPU/memory, paradoxically reducing available resources for actual work. Collection intervals too frequent create measurement overhead that degrades performance.

**Why it happens:**
Developers test on powerful machines (Pi 5, Beelink) where load tracking is negligible. On Pi 2B (1GB RAM), CPU sampling, memory measurement, and network I/O for reporting consume 10-15% of available resources. Collection intervals optimized for cloud systems (100ms) are far too aggressive for edge devices.

**How to avoid:**
- Use adaptive collection intervals: 5s on Pi 2B, 1s on Pi 5/Beelink
- Batch load metrics with other status messages (don't send separate packets)
- Use OS-level /proc/stat reading instead of process sampling (lighter)
- Implement load tracking as opt-in per-agent type (disable for non-critical agents)
- Cache load calculations; don't recalculate on every routing decision

**Warning signs:**
- Coordination layer memory increases after adding load tracking
- CPU usage spikes correlate with metric collection intervals
- Pi 2B shows throttling even without active tasks
- Network traffic dominated by load status messages

**Phase to address:**
Phase 1 (Advanced Routing) - Set adaptive collection intervals based on detected hardware

**Detection:**
- Monitor coordination layer memory before/after load tracking
- Measure CPU time spent in load tracking vs. task execution
- Track message rate increase from load status updates

---

### Pitfall 3: Multi-Capability Matching Complexity Explosion

**What goes wrong:**
As agents advertise more capabilities and tasks require multiple capabilities, the matching algorithm becomes O(N×M×K) where N=agents, M=capabilities, K=task requirements. Matching latency increases quadratically, blocking task delegation.

**Why it happens:**
Naive implementation checks every agent against every task requirement. Capability matrix grows as agents add skills (Python, testing, debugging, research, etc.). Task requirements become more specific ("needs Python AND testing AND async experience"). No pre-filtering or indexing applied.

**How to avoid:**
- Build capability index: Map capability → list of agents having it
- Use bloom filters for fast "could match" pre-filtering
- Cache matching results for common requirement combinations
- Limit concurrent capability checks (max 3-4 per task)
- Use requirement priority: Check rare capabilities first (fail fast)
- Consider approximate matching when exact match takes >100ms

**Warning signs:**
- Task delegation latency increases as capability list grows
- Routing decisions take >200ms for complex tasks
- CPU usage spikes during capability matching
- Tasks wait unnecessarily because matching blocks event loop

**Phase to address:**
Phase 1 (Advanced Routing) - Implement indexed capability lookup from day one

**Detection:**
- Log matching algorithm duration per task
- Profile routing decision time complexity
- Monitor event loop blocking during delegation

---

### Pitfall 4: Task Rejection Cascades (Thundering Herd)

**What goes wrong:**
Load-based routing rejects tasks when agents are busy, but rejected tasks bounce between agents causing message storms. System enters death spiral where rejections consume more resources than actual work.

**Why it happens:**
No backpressure mechanism. Rejected tasks immediately re-routed without delay. Multiple agents simultaneously become busy (e.g., after deployment). Routing algorithm doesn't learn from rejections (keeps trying same agents). No exponential backoff on task rejection.

**How to avoid:**
- Implement rejection queue with exponential backoff (2^n × 100ms, max 5s)
- Add circuit breaker: Stop routing to agent after 3 consecutive rejections
- Use broker-level task queuing (don't bounce, queue centrally)
- Implement "least loaded" routing with headroom (route to <70% load, not <95%)
- Add rejection tracking: Log which agent rejected why, avoid repeated attempts

**Warning signs:**
- Message rate spikes without task completion increase
- Same task appears in multiple agent logs (rejection chain)
- Network traffic dominated by task reject/redispatch messages
- Tasks timeout after spending time in rejection loop

**Phase to address:**
Phase 1 (Advanced Routing) - Implement circuit breaker and backpressure from start

**Detection:**
- Track rejection rate per agent (alert >20% rejection rate)
- Monitor task hop count (number of routing attempts)
- Log task time in rejection queue vs. execution time

---

### Pitfall 5: Context Reference Invalidation During Batching

**What goes wrong:**
Message batching holds messages to amortize overhead, but context references (task IDs, agent IDs) become invalid during batching window. Batched messages reference stale state, causing silent failures or incorrect processing.

**Why it happens:**
Batch window (e.g., 100ms) allows state changes. Agent crashes during batch window. Task completes and is removed from registry before batch processes. Context shared by reference, not copied into batch. No validation of reference validity on batch processing.

**How to avoid:**
- Copy critical context into batched messages (don't use references)
- Add batch timestamp; reject processing if >1s old
- Validate all references (task exists, agent alive) before batch processing
- Use idempotent batch processing (safe to re-process)
- Implement batch integrity checks on receipt
- Shorter batch windows for high-churn scenarios (task completion = 50ms)

**Warning signs:**
- "Task not found" errors increase after enabling batching
- Silent failures (batches accepted but not processed)
- Inconsistent state after batch processing
- Messages marked done but work not completed

**Phase to address:**
Phase 2 (Optimization) - Validate reference handling before enabling batching

**Detection:**
- Log reference validation failures in batch processing
- Track batch processing error rate
- Monitor state consistency before/after batch processing

---

### Pitfall 6: Message Batching Latency vs. Throughput Trap

**What goes wrong:**
Batching configured for maximum throughput (large batches, long wait) causes unacceptable latency for urgent tasks. User-visible delays (5-10s) while batch fills. Time-critical guidance requests timeout waiting for batch.

**Why it happens:**
Single batching configuration for all message types. No priority queue (urgent messages wait behind bulk). Linger time optimized for throughput (100ms+) ignores latency-sensitive operations. Task routing considered "bulk" despite being latency-critical.

**How to avoid:**
- Implement per-message-type batching config:
  - Task delegation: 10ms max linger (latency-sensitive)
  - Status updates: 50ms max linger (moderate)
  - Heartbeats: 100ms max linger (throughput-optimized)
- Use priority queues: Urgent messages skip batch
- Adaptive batching: Reduce linger during high queue depth
- Separate batching paths: Real-time vs. bulk

**Warning signs:**
- Task delegation takes >100ms consistently
- Guidance requests timeout after batching enabled
- User-visible lag in status updates
- Latency increases non-linearly with load

**Phase to address:**
Phase 2 (Optimization) - Implement priority-aware batching from start

**Detection:**
- Measure end-to-end latency per message type
- Track timeout rate before/after batching
- Monitor batch fill time (actual vs. configured linger)

---

### Pitfall 7: Connection Pool Exhaustion on Pi 2B

**What goes wrong:**
Connection pooling creates more connections than Pi 2B can handle. Each connection uses file descriptors and memory buffers. Pool doesn't respect OS limits (ulimit -n). Too many idle connections exhaust resources before any work happens.

**Why it happens:**
Pool size configured for cloud environments (10-20 connections). Each MQTT connection = 1 file descriptor + buffers. Pi 2B default ulimit -n is 1024, but usable is ~800. Testing on Pi 5/Beelink doesn't reveal limits. No connection lifecycle management (idle connections never closed).

**How to avoid:**
- Limit pool size by detected hardware: Pi 2B = max 3 connections, Pi 5 = max 5
- Implement connection lifecycle: Close idle connections after 60s
- Monitor file descriptor usage: Alert at 70% of ulimit
- Use single multiplexed connection where possible (MQTT v5 shared subscriptions)
- Configure pool min/max explicitly (not unbounded)
- Add connection validation on checkout (close stale connections)

**Warning signs:**
- "EMFILE: too many open files" errors
- Connection creation failures
- Memory usage increases with connection count (even idle)
- System works initially, fails after connection churn

**Phase to address:**
Phase 2 (Optimization) - Implement hardware-aware connection pooling

**Detection:**
- Log file descriptor usage periodically
- Monitor connection pool size vs. actual usage
- Track connection creation failure rate

---

### Pitfall 8: Cross-Machine Checkpoint Recovery Edge Cases

**What goes wrong:**
Checkpoint recovery assumes consistent state across machines, but network partitions and clock skew create divergent realities. Recovery from checkpoint puts machine in state inconsistent with current swarm state. Agents refuse to work because their view of "current tasks" mismatches.

**Why it happens:**
Checkpoints stored locally and synced to SQLite with delay. Machine crashes with local checkpoint ahead of SQLite. Recovery reads stale checkpoint, conflicts with current reality. No checkpoint version validation. No conflict detection during recovery (blind overwrite).

**How to avoid:**
- Add checkpoint version/timestamp; validate against current state on recovery
- Implement checkpoint reconciliation: Compare local vs. remote, merge intelligently
- Use vector clocks to detect conflicting updates
- Design recovery as "merge" not "restore" (preserve post-checkpoint work)
- Add recovery safety checks: Verify critical references (agent IDs, task IDs)
- Log all recovery conflicts for manual review

**Warning signs:**
- After recovery, agents have different task lists
- Recovery causes immediate desynchronization
- Checkpoint loads but system doesn't work
- Manual intervention required after every crash recovery

**Phase to address:**
Phase 3 (Checkpointing) - Implement conflict-aware recovery before adding cross-machine sync

**Detection:**
- Log checkpoint version mismatches during recovery
- Track post-recovery consistency checks
- Monitor agent state differences after restart

---

### Pitfall 9: Clock Skew Breaking Checkpoint Ordering

**What goes wrong:**
Pi 2B clock drifts from Beelink/Pi 5 clocks. Checkpoint timestamps become unreliable. Recovery fails because "newer" checkpoint has older timestamp. Timeline visualization shows impossible event ordering.

**Why it happens:**
No NTP synchronization configured. Pi 2B lacks RTC (real-time clock), drift ~10s/day after boot. Checkpoint ordering uses naive timestamp comparison. No clock skew tolerance in recovery logic. Timeline visualizations assume perfect clock sync.

**How to avoid:**
- Require NTP synchronization on all machines (systemd-timesyncd)
- Add clock skew detection: Alert when clocks differ >5s
- Use Lamport clocks or vector clocks for checkpoint ordering
- Store logical timestamps (sequence numbers) alongside wall time
- Design visualization to tolerate clock skew (show "uncertain" periods)
- Include clock offset in checkpoint metadata

**Warning signs:**
- Checkpoint recovery fails with "version mismatch" on valid data
- Timeline shows events before their causes
- Agents report "checkpoint from future" errors
- Visualization displays impossible time sequences

**Phase to address:**
Phase 3 (Checkpointing) - Implement clock-skew-aware checkpoint ordering

**Detection:**
- Monitor clock offset between machines (log periodically)
- Track checkpoint ordering failures
- Alert on timeline inconsistencies in visualization

---

### Pitfall 10: Partial Checkpoint Corruption

**What goes wrong:**
Power loss or crash during checkpoint write leaves partial/corrupt checkpoint file. Recovery attempts to load corrupt file and crashes permanently. System becomes unrecoverable without manual intervention.

**Why it happens:**
SQLite checkpoint uses transaction, but local JSON checkpoint doesn't. Write crash after metadata but before data. No atomic write for local checkpoint. No checksum validation on load. No backup/rollback for corrupt checkpoints.

**How to avoid:**
- Use atomic write: Write to temp file, then atomic rename
- Add checksum (CRC32) to checkpoint footer; validate on load
- Implement checkpoint rotation: Keep last 3 checkpoints, fallback on corruption
- Add "checkpoint is valid" flag at end of write
- Test recovery by injecting corrupt checkpoints
- Log all checkpoint validation failures

**Warning signs:**
- Recovery crashes with parse errors
- Checkpoint file size changes between writes
- "Invalid JSON" or "corrupt data" errors on load
- System fails to recover from any crash

**Phase to address:**
Phase 3 (Checkpointing) - Implement atomic writes and validation

**Detection:**
- Validate checkpoint integrity on every write
- Log checkpoint file size and checksum
- Test recovery from corrupted checkpoints in CI

---

### Pitfall 11: Dashboard Memory Footprint on Pi 2B

**What goes wrong:**
Real-time dashboard stores unlimited history of metrics. WebSocket connections buffer unbounded message history. Visualizations render all data points instead of downsampling. Dashboard process itself exceeds 100MB, pushing coordination layer over 85% memory threshold on Pi 2B.

**Why it happens:**
Dashboard tested on Pi 5/Beelink with ample memory. No data retention limits configured. WebSocket libraries buffer by default. Chart libraries assume modern browser memory limits. No difference between "brain" dashboard (4GB) and "worker" dashboard (1GB).

**How to avoid:**
- Implement rolling windows: Keep only last 60-120 data points per metric
- Downsample historical data: Keep 1s resolution for recent, 10s for older
- Limit WebSocket buffer size: 10KB max per connection
- Use server-side aggregation: Send pre-computed stats, not raw data
- Different dashboards by hardware: Full on brain, minimal on workers
- Monitor dashboard memory usage; add hard limits (50MB max on Pi 2B)

**Warning signs:**
- Dashboard process memory grows without bound
- Pi 2B shows high memory usage even without active tasks
- WebSocket errors or disconnections under load
- Browser becomes slow with dashboard open

**Phase to address:**
Phase 4 (Visualization) - Implement memory-bounded dashboard from start

**Detection:**
- Monitor dashboard process memory continuously
- Track WebSocket buffer sizes
- Alert on memory growth >10MB/minute

---

### Pitfall 12: WebSocket Connection Management Overhead

**What goes wrong:**
Dashboard creates new WebSocket for each data stream (tasks, agents, metrics). No connection pooling or multiplexing. Each connection has overhead (TLS handshake, buffers). Connection churn under load creates/recreates connections rapidly. On Pi 2B, connection overhead exceeds data transfer cost.

**Why it happens:**
Simple implementation: One WebSocket per data type. No connection lifecycle management. Browser reconnects aggressively on network hiccups. Server doesn't limit connection rate. Testing on stable network doesn't reveal churn.

**How to avoid:**
- Single multiplexed WebSocket: Use message topics instead of multiple connections
- Implement connection backpressure: Slow down sends if client can't keep up
- Add reconnection backoff: Exponential backoff max 30s between reconnects
- Limit connection rate per client: Max 1 new connection per 5s
- Use WebSocket compression (permessage-deflate) to reduce bandwidth
- Monitor connection churn; alert on >10 connections/minute/client

**Warning signs:**
- High CPU usage in WebSocket handler
- Network traffic dominated by WebSocket handshakes
- "Too many connections" errors under load
- Dashboard lags despite low data volume

**Phase to address:**
Phase 4 (Visualization) - Implement single multiplexed WebSocket

**Detection:**
- Log WebSocket connection lifecycle (connect/disconnect rate)
- Monitor WebSocket handler CPU usage
- Track bytes transferred vs. handshake overhead

---

### Pitfall 13: Real-Time Update Overwhelming Pi 2B

**What goes wrong:**
Dashboard pushes updates on every state change. Task progress updates (10-100 events/second) create real-time update storm. Pi 2B spends more time sending WebSocket messages than doing actual work. Browser can't render updates fast enough, creating backlog.

**Why it happens:**
No update throttling or batching. Every task progress event triggers WebSocket push. No client-side rate limiting. Dashboard assumes gigabit network and fast browser. Testing on powerful machines hides performance cliff.

**How to avoid:**
- Implement update throttling: Max 10 updates/second per client
- Batch updates: Send accumulated changes every 100ms
- Use differential updates: Send only changed fields, not full state
- Client-side request rate: Don't send faster than client can render
- Priority-based updates: Task completion > progress > heartbeat
- Add "live vs. sampled" mode: Real-time on demand, sampled by default

**Warning signs:**
- WebSocket message rate >100/second sustained
- Browser tab becomes unresponsive with dashboard open
- Pi 2B CPU usage spikes when dashboard connected
- Network traffic dominated by dashboard updates

**Phase to address:**
Phase 4 (Visualization) - Implement update throttling before real-time features

**Detection:**
- Monitor WebSocket message rate per client
- Track browser frame rate (requestAnimationFrame)
- Measure client-side message processing time

---

## Moderate Pitfalls

### Pitfall 14: Context Compression Losing Critical Information

**What goes wrong:**
Context optimization (removing duplicates, summarizing) accidentally drops critical details. Agent makes wrong decision because key constraint was "summarized away". Subtle bugs from lost context are hard to diagnose.

**Why it happens:**
Over-aggressive summarization to save memory. No semantic understanding of what's important. Lossy compression applied uniformly. Testing doesn't catch missing context (agent works, just suboptimally).

**How to avoid:**
- Preserve constraints explicitly (never summarize requirements)
- Use lossless compression for structured data (MessagePack)
- Summarize only narrative text, not structured fields
- Add "important" flag for context that must never be dropped
- Validate compressed context against original before sending
- Log what was removed during compression

**Warning signs:**
- Agents miss obvious constraints in task descriptions
- Repeated clarification requests after context compression
- Tasks fail due to missing "mentioned in description" requirements

**Phase to address:**
Phase 2 (Optimization) - Validate context preservation before optimization

---

### Pitfall 15: Capability Drift Without Reconciliation

**What goes wrong:**
Agent capabilities evolve organically (new skills learned, old ones deprecated). No capability versioning or deprecation mechanism. Swarm assigns tasks based on outdated capabilities. Agent receives task it can no longer perform.

**Why it happens:**
Capabilities treated as static after registration. No capability expiry or refresh. No distinction between "can do" and "currently doing well". Testing with short-running sessions doesn't reveal drift. Manual capability updates not synchronized.

**How to avoid:**
- Add capability version/timestamp
- Implement capability expiry: Refresh every 24 hours
- Track capability confidence: High (validated), Medium (assumed), Low (deprecated)
- Support capability deprecation: Mark as "do not assign new tasks"
- Periodic capability validation: Re-test claimed capabilities
- Log capability changes with audit trail

**Warning signs:**
- Agents reject tasks they're "supposed to handle"
- Capability registry grows stale (claims not verified)
- Tasks fail with "agent lacks capability" despite registry saying otherwise

**Phase to address:**
Phase 1 (Advanced Routing) - Implement capability lifecycle management

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| No context validation in batching | Faster implementation | Silent failures, incorrect state | Never - validate from start |
| Fixed-size connection pools | Simple configuration | Wastes resources on Pi 5, limits on Pi 2B | Only for MVP, replace with adaptive |
| Single checkpoint file | Simple implementation | No recovery from corruption | Never - use atomic writes + rotation |
| Unlimited dashboard history | Easy implementation | Memory exhaustion on Pi 2B | Never - enforce limits from day one |
| No capability versioning | Simpler data structures | Stale routing, capability drift | Acceptable for v1.0, add in v1.1 |
| No clock sync verification | Skips NTP setup complexity | Recovery failures, timeline bugs | Never - require NTP from v1.0 |
| Best-effort WebSocket delivery | Simpler code | Lost updates, inconsistent UI | Acceptable for non-critical status, not for tasks |
| No rejection backoff | Faster task routing | Thundering herd, message storms | Never - always implement backoff |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Dynamic capability updates | Update local registry without notifying swarm | Publish capability change via MQTT, retain + notify subscribers |
| Load tracking | Query OS on every routing decision | Cache load metrics, refresh every 5s, invalidate on state change |
| Message batching | Batch all messages with same config | Per-type batching: urgent=10ms, bulk=100ms, use priority queues |
| Connection pooling | Configure pool size for powerful machines | Detect hardware, limit pool: Pi 2B=3, Pi 5=5, Beelink=10 |
| Cross-machine checkpoint | Assume checkpoint is source of truth | Validate checkpoint version, merge with current state |
| Dashboard WebSocket | Open one connection per data stream | Single multiplexed connection with message topics |
| Real-time updates | Push every state change immediately | Throttle updates, batch to 100ms, send differentials |
| Checkpoint ordering | Use wall-clock timestamp for versioning | Use vector clocks or sequence numbers, tolerate clock skew |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| O(N×M) capability matching | Routing slows as capabilities grow | Index capability→agents, bloom filter pre-filtering | >5 capabilities per agent, >10 agents |
| Unbounded dashboard history | Memory grows unbounded on Pi 2B | Fixed rolling window (60-120 points), aggressive downsampling | Any long-running session on Pi 2B |
| No message batching | Network overhead dominates throughput | Per-type batching with adaptive linger | >10 messages/second sustained |
| Connection pool doesn't scale | Too many connections on Pi 2B | Hardware-aware pool limits (Pi 2B=3 max) | Pi 2B with >3 parallel operations |
| Load tracking overhead | Load tracking consumes 15% CPU | Adaptive intervals (5s on Pi 2B, 1s on Pi 5) | Always on Pi 2B, check with profiler |
| No update throttling | WebSocket sends 100+ updates/second | Max 10 updates/second, batch to 100ms | Dashboard with >5 active tasks |

---

## "Looks Done But Isn't" Checklist

- [ ] **Advanced routing:** Often missing capability version conflict detection — verify concurrent updates handled correctly
- [ ] **Load-based routing:** Often missing adaptive collection intervals — verify Pi 2B uses 5s intervals, Pi 5 uses 1s
- [ ] **Message batching:** Often missing reference validation — verify batched context references still valid on processing
- [ ] **Connection pooling:** Often missing hardware-aware limits — verify pool size respects Pi 2B constraints
- [ ] **Cross-machine recovery:** Often missing checkpoint conflict resolution — verify recovery merges state, doesn't clobber
- [ ] **Clock skew handling:** Often missing clock offset monitoring — verify alerts fire when clocks drift >5s
- [ ] **Checkpoint corruption:** Often missing atomic writes and validation — verify power loss during write is recoverable
- [ ] **Dashboard memory:** Often missing data retention limits — verify dashboard memory stays <50MB on Pi 2B
- [ ] **WebSocket multiplexing:** Often missing single-connection design — verify one WebSocket per client, not per data stream
- [ ] **Real-time updates:** Often missing update throttling — verify dashboard doesn't send >10 updates/second

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Routing race conditions | MEDIUM | Force full capability resync; reject all in-flight tasks; rebuild routing table |
| Load tracking overload | LOW | Disable load tracking temporarily; restart agent with longer intervals |
| Task rejection cascades | MEDIUM | Stop task delegation; drain existing queues; implement circuit breaker; resume gradually |
| Context invalidation | HIGH | Identify invalid references; restore from pre-batch checkpoint; add validation before next batch |
| Connection pool exhaustion | LOW | Close idle connections; reduce pool size; restart agent with hardware-aware limits |
| Checkpoint corruption | HIGH | Restore from backup checkpoint (keep last 3); implement atomic writes for future |
| Clock skew issues | MEDIUM | Resync NTP on all machines; use sequence numbers instead of timestamps; reconcile checkpoints |
| Dashboard memory overflow | MEDIUM | Restart dashboard with stricter limits; implement data retention; clear client cache |
| WebSocket connection storm | LOW | Implement connection rate limiting; force disconnect idle clients; reduce update rate |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | v1.1 Phase to Address | Verification |
|---------|------------------|----------------------|--------------|
| Dynamic routing race conditions | Phase 1 (Advanced Routing) | Advanced Routing | Test concurrent capability updates, verify version conflict detection |
| Load tracking overhead | Phase 1 (Advanced Routing) | Advanced Routing | Measure CPU overhead on Pi 2B, verify adaptive intervals |
| Multi-capability matching complexity | Phase 1 (Advanced Routing) | Advanced Routing | Profile routing time with 10 agents × 20 capabilities, verify <100ms |
| Task rejection cascades | Phase 1 (Advanced Routing) | Advanced Routing | Simulate agent overload, verify circuit breaker and backoff work |
| Context reference invalidation | Phase 2 (Optimization) | Optimization | Inject stale references into batch, verify validation catches them |
| Batching latency trap | Phase 2 (Optimization) | Optimization | Measure per-message-type latency, verify urgent messages <50ms |
| Connection pool exhaustion | Phase 2 (Optimization) | Optimization | Test with 20 concurrent operations on Pi 2B, verify no exhaustion |
| Cross-machine checkpoint issues | Phase 3 (Checkpointing) | Checkpointing Gaps | Crash during checkpoint, verify recovery merges state correctly |
| Clock skew breaking ordering | Phase 3 (Checkpointing) | Checkpointing Gaps | Set clock 10s ahead, verify checkpoint ordering still works |
| Partial checkpoint corruption | Phase 3 (Checkpointing) | Checkpointing Gaps | Kill process during write, verify recovery from backup works |
| Dashboard memory footprint | Phase 4 (Visualization) | Visualization | Run dashboard on Pi 2B for 1 hour, verify memory <50MB |
| WebSocket connection overhead | Phase 4 (Visualization) | Visualization | Connect 5 clients, verify single multiplexed connection per client |
| Real-time update overhead | Phase 4 (Visualization) | Visualization | Spawn 10 tasks, verify update rate <10/second |

---

## Phase-Specific Warnings

### Phase 1: Advanced Routing
**Critical risks:**
- Capability matching complexity can block event loop if not indexed
- Load tracking can consume 15%+ CPU on Pi 2B if intervals too aggressive
- Task rejections can cascade into message storms without circuit breaker

**Mitigation:**
- Implement capability→agent index before multi-capability matching
- Use hardware-adaptive metric collection (5s on Pi 2B, 1s on Pi 5)
- Add circuit breaker after 3 consecutive rejections; implement exponential backoff

### Phase 2: Optimization
**Critical risks:**
- Message batching can hide latency issues if not per-type configured
- Context references can become invalid during batch window
- Connection pooling can exhaust file descriptors on Pi 2B

**Mitigation:**
- Configure batching per message type: urgent=10ms, status=50ms, bulk=100ms
- Validate all references on batch processing, copy critical context
- Limit pool size by hardware: Pi 2B=3, Pi 5=5, Beelink=10

### Phase 3: Checkpointing Gaps
**Critical risks:**
- Checkpoint corruption can make system unrecoverable
- Clock skew can break checkpoint ordering
- Cross-machine recovery can create conflicting state

**Mitigation:**
- Use atomic writes (temp file + rename), keep last 3 checkpoints
- Use vector clocks, not just timestamps, for ordering
- Implement checkpoint reconciliation (merge, don't clobber)

### Phase 4: Visualization
**Critical risks:**
- Dashboard can exceed 100MB memory on Pi 2B
- WebSocket connections can overwhelm Pi 2B without multiplexing
- Real-time updates can create update storms without throttling

**Mitigation:**
- Limit data retention: 60-120 points rolling window, aggressive downsampling
- Single multiplexed WebSocket per client, connection rate limiting
- Throttle to 10 updates/second, batch to 100ms, use differential updates

---

## Memory Budget for v1.1 Features (Pi 2B)

```
Total available: 1024MB
├── OS + System: ~150MB
├── Node.js Runtime: ~80MB
├── OpenClaw Gateway: ~100MB
├── MQTT Broker: ~10MB
├── v1.0 Coordination: ~50MB
└── v1.1 Enhancements: ~150MB (max)
    ├── Advanced routing: ~30MB
    │   ├── Capability index: ~5MB
    │   ├── Load tracking cache: ~10MB
    │   └── Matching algorithm: ~15MB
    ├── Optimization: ~40MB
    │   ├── Message batching buffers: ~15MB
    │   ├── Connection pools: ~10MB (3 connections × ~3MB)
    │   └── Context compression: ~15MB
    ├── Checkpointing: ~30MB
    │   ├── Checkpoint buffers: ~15MB
    │   └── Recovery state: ~15MB
    └── Visualization: ~50MB (on worker)
        ├── Dashboard process: ~35MB
        ├── WebSocket buffers: ~10MB (2 clients × ~5MB)
        └── Metric storage: ~5MB (120 points × 50 metrics)

Remaining headroom: ~464MB (for agent execution)
```

**Critical:** If v1.1 features exceed ~150MB total on Pi 2B, system will cross 85% memory threshold and trigger throttling.

---

## Sources

### Advanced Routing Pitfalls
- [Race Condition Analysis in Distributed Systems](https://dev.to/georgekobaidze/how-a-simple-race-condition-can-take-down-even-the-biggest-systems-16l0) (MEDIUM confidence - 2025 article)
- [Dynamic Routing Architectures](https://m.zhangqiaokeyan.com/academic-conference-foreign_meeting-256765_thesis/0205118322543.html) (MEDIUM confidence - 2020 research)
- [Load Balancing Algorithms](https://bbs.huaweicloud.com/blogs/466961) (MEDIUM confidence - 2025 guide)
- [Task Scheduling Routing Strategies](https://segmentfault.com/a/1190000047223225) (MEDIUM confidence - 2025 analysis)

### Optimization & Batching
- [Producer Batching Analysis](https://arxiv.org/html/2512.16146v1) (HIGH confidence - 2025 benchmark study)
- [Kafka Producer Optimization](https://access.redhat.com/documentation/zh-cn/red_hat_streams/2.3/html/kafka_configuration_tuning/con-producer-config-properties-throughput-str) (HIGH confidence - official docs)
- [MQTT Connection Pool Design](https://blog.csdn.net/gitblog_00832/article/details/151628867) (MEDIUM confidence - 2025 guide)
- [Context Invalidation in Multi-Agent Systems](https://arxiv.org/html/2602.14849v1) (MEDIUM confidence - 2025 research)

### Cascading Failures
- [Circuit Breaker Pattern](https://m.blog.csdn.net/IOIO_/article/details/156490917) (MEDIUM confidence - 2026 guide)
- [Circuit Breaker in Distributed Systems](https://m.blog.csdn.net/gitblog_00684/article/details/151386151) (MEDIUM confidence - 2025 analysis)
- [Netflix Failure Analysis](https://m.blog.csdn.net/gitblog_00684/article/details/151386151) (MEDIUM confidence - 2025 reference)

### Checkpointing & Clock Skew
- [Tracing and Clock Skew](https://arxiv.org/html/2510.02991v1) (HIGH confidence - 2025 research)
- [Checkpoint-Rollback Mechanisms](https://arxiv.org/html/2602.14849v1) (HIGH confidence - 2025 paper)
- [Timestamp-based Checkpointing](https://m.zhangqiaokeyan.com/academic-conference-foreign_meeting-231611_thesis/020515734176.html) (MEDIUM confidence - 2025 research)
- [Two-Level Checkpoint System](https://m.zhangqiaokeyan.com/academic-conference-foreign_meeting-256783_thesis/0705010251338.html) (MEDIUM confidence - 2025 study)

### Visualization & Memory Constraints
- [uWebSockets Memory Pool](https://m.blog.csdn.net/gitblog_00570/article/details/152869107) (MEDIUM confidence - 2025 benchmark)
- [Linux Dash Performance](https://m.blog.csdn.net/gitblog_00740/article/details/153513495) (MEDIUM confidence - 2025 analysis)
- [Memory-Efficient Architectures](https://www.mdpi.com/2673-4591/104/1/77) (HIGH confidence - 2025 research)
- [Dashboard Security Considerations](https://learn.microsoft.com/zh-cn/dotnet/aspire/fundamentals/dashboard/security-considerations) (HIGH confidence - official docs)

### Existing v1.0 Research
- [UC Berkeley Multi-Agent Failures](https://example.com/uc-berkeley-research) (Referenced in v1.0 PITFALLS.md)
- [Mosquitto MQTT Documentation](https://mosquitto.org/) (HIGH confidence - official)
- [Better-SQLite3 Performance](https://github.com/WiseLibs/better-sqlite3) (HIGH confidence - official)

---

*Pitfalls research for: OpenClaw Swarm v1.1 Enhancements*
*Researched: 2026-02-22*
*Focus: Advanced routing, optimization, checkpointing gaps, visualization*
