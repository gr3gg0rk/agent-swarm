# Technology Stack

**Domain:** Lightweight Agent Swarm Coordination System
**Researched:** 2025-02-21
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Memory/CPU | Why Recommended |
|------------|---------|---------|------------|-----------------|
| **Node.js** | ≥22.0.0 | Runtime (OpenClaw dependency) | ~50-100MB baseline | Required by OpenClaw gateway; async I/O ideal for coordination |
| **MQTT (Mosquitto)** | 2.0.x | Message broker for agent communication | ~3-10MB RAM | Industry standard for IoT, minimal footprint, QoS support, retained messages for agent discovery |
| **Better-SQLite3** | ^9.0.0 | Shared state persistence | ~5-15MB RAM | Faster than file I/O, ACID transactions, WAL mode for concurrency, single-file database |
| **MQTT.js** | ^5.0.0 | MQTT client for Node.js agents | ~2-5MB RAM | Standard Node.js MQTT client, mature, WebSocket support |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **msgpackr** | ^0.6.0 | Binary serialization (MessagePack) | For task payloads >1KB; 3.5x faster than JSON, 15-50% smaller |
| **uuid** | ^11.0.0 | Agent and task ID generation | When you need distributed unique identifiers |
| **p-queue** | ^8.0.0 | In-memory task queue | For local task queuing before MQTT publishing |
| **eventemitter3** | ^6.0.0 | Async event handling | For decoupling agent components without heavy frameworks |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **TypeScript** | Type safety | Required for coordination layer consistency |
| **tsx** | Development execution | Fast TypeScript execution without build step |
| **esbuild** | Production bundling | Ultra-fast bundler for coordination modules |

## Installation

```bash
# Core coordination dependencies
npm install mqtt@5.0.0 better-sqlite3@9.0.0 msgpackr@0.6.0

# Agent identification and queuing
npm install uuid@11.0.0 p-queue@8.0.0 eventemitter3@6.0.0

# Dev dependencies
npm install -D typescript@5.9.3 tsx@4.21.0 @types/node@22.19.11
```

## Architecture Rationale

### Why MQTT over Alternatives

| Protocol | Memory | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| **MQTT (Mosquitto)** | ~3-10MB | QoS levels, retained messages, IoT standard | No built-in streaming | ✅ RECOMMENDED |
| **NATS Core** | ~5-10MB | Ultra-fast, minimal binary | Stateless (no offline buffering), fire-and-forget | ⚠️ Use only if you accept message loss |
| **NATS JetStream** | ~200MB+ | Durable streaming, clustering | ❌ NOT suitable for 1GB RAM Pi 2B | ❌ AVOID |
| **Redis Pub/Sub** | ~50-100MB+ | In-memory speed | Memory-hungry, requires separate Redis process | ⚠️ Only if you already need Redis |
| **ZeroMQ** | ~5MB | Complex patterns, low-latency | No broker, requires peer discovery | ⚠️ Use for direct agent-to-agent IPC only |

**MQTT Wins Because:**
- Retained messages enable instant agent discovery without polling
- QoS 1 ensures at-least-once delivery for critical coordination messages
- Minimal broker footprint (3-10MB) leaves room for Node.js runtime
- Industry standard means extensive tooling and debugging support

### Why Better-SQLite3 over File-Based or Redis

| Solution | Memory | Pros | Cons | Verdict |
|----------|--------|------|------|---------|
| **Better-SQLite3** | ~5-15MB | ACID transactions, indexing, faster than raw fs | Requires database knowledge | ✅ RECOMMENDED |
| **JSON Files** | ~2-5MB | Simple, human-readable | No transactions, race conditions, slower for queries | ⚠️ OK for config only |
| **Redis** | ~50-100MB+ | In-memory speed, pub/sub | Heavy memory footprint, separate process, persistence complexity | ❌ AVOID for 1GB Pi |

**Better-SQLite3 Wins Because:**
- Synchronous API is faster than async alternatives in Node.js
- WAL mode enables concurrent reads/writes without blocking
- Single-file database simplifies backup and migration
- Query capabilities for complex agent/task lookups
- Can use `:memory:` mode for hot state with file persistence

### Why MessagePack over JSON or CBOR

| Format | Speed vs JSON | Size vs JSON | Standardization | Verdict |
|--------|---------------|--------------|-----------------|---------|
| **MessagePack (msgpackr)** | 3.5x faster | 15-50% smaller | Widely adopted | ✅ RECOMMENDED |
| **JSON** | Baseline | Baseline | Universal | ⚠️ Use for debugging only |
| **CBOR** | 3.5x faster | 15-50% smaller | IETF standardized | ⚠️ Consider if标准化matters |
| **Protocol Buffers** | 6x faster | Smaller | Google standard | ❌ Requires schema definition |

**MessagePack Wins Because:**
- msgpackr achieves 1.5-2 GB/s throughput in Node.js
- Schema-less format fits dynamic agent payloads
- Record extension optimizes repeated structures
- Mature Node.js ecosystem with msgpackr

### Why NOT BullMQ/Bee-Queue (Task Queue Libraries)

| Library | Memory | Pros | Cons | Verdict |
|---------|--------|------|------|---------|
| **BullMQ** | ~30-50MB | Features, TypeScript | Requires Redis, adds complexity | ❌ AVOID |
| **Bee-Queue** | ~5-10MB | Minimal, fast | Still requires Redis | ⚠️ Use only if you already have Redis |
| **MQTT + p-queue** | ~2-5MB | Lightweight, flexible | Manual retry logic | ✅ RECOMMENDED |

**MQTT + p-queue Wins Because:**
- Avoids Redis dependency (saves ~50MB+ RAM)
- p-queue provides in-memory queuing with concurrency control
- MQTT provides distributed transport without extra infrastructure
- Simpler architecture = easier debugging on Pi 2B

## Memory Budget for Pi 2B (1GB RAM)

```
Total: 1024MB
├── OS + System: ~150MB
├── Node.js Runtime: ~80MB
├── OpenClaw Gateway: ~100MB (estimated)
├── MQTT Broker (Mosquitto): ~10MB
├── Coordination Layer (Node.js): ~50MB
│   ├── MQTT client: ~5MB
│   ├── SQLite state: ~15MB
│   ├── Task queue (p-queue): ~5MB
│   └── Application logic: ~25MB
└── Headroom: ~634MB (plenty for agent execution)
```

**Key Insight:** The coordination layer should consume less than 100MB total, leaving 600MB+ for actual agent work.

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| **Broker** | Mosquitto | NanoMQ | If you need MQTT-over-QUIC or multi-threaded broker |
| **Broker** | Mosquitto | Aedes (Node.js) | Only if you need embedded broker in Node.js process (higher memory) |
| **Database** | Better-SQLite3 | LowDB | Only for extremely simple key-value config (not agent state) |
| **Database** | Better-SQLite3 | Redis | Only if you already use Redis and have memory to spare |
| **Serialization** | MessagePack | JSON | For debugging, public APIs, or human readability |
| **Serialization** | MessagePack | CBOR | If IETF standardization is required |
| **Task Queue** | MQTT + p-queue | BullMQ | Only if you need complex job dependencies and have Redis |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **RabbitMQ** | ~100MB+ RAM, Erlang runtime, overkill for 4 agents | MQTT (Mosquitto) |
| **Kafka** | ~500MB+ RAM, designed for massive scale, complex setup | MQTT or NATS Core |
| **NATS JetStream** | 200MB+ RAM, not suitable for edge devices | NATS Core (if you accept message loss) |
| **PostgreSQL/MySQL** | ~50-100MB+ RAM, separate process | Better-SQLite3 |
| **LevelDB/RocksDB** | Complex compilation, heavier than SQLite | Better-SQLite3 |
| **gRPC** | Complex proto definitions, heavier than MQTT | MQTT for coordination |
| **BullMQ** | Requires Redis, adds ~50MB+ memory overhead | MQTT + p-queue |
| **FlatBuffers/Protobuf** | Requires schema definition, more complex | MessagePack (schema-less) |

## Stack Patterns by Variant

**If running on griak-brain (4GB RAM):**
- Consider running Aedes (Node.js MQTT broker) inline
- Can afford Redis for more complex caching
- May use BullMQ for advanced job scheduling

**If running on griak-server (Pi 5, 8GB RAM):**
- Can run full Mosquitto with persistence enabled
- Room for monitoring and metrics collection
- Could consider NATS JetStream if durability needed

**If running on griak-worker-1/2 (Pi 2B/3B, 1GB RAM):**
- Mosquitto broker OR connect to brain's broker
- Better-SQLite3 with WAL mode
- Minimal in-memory state, prefer MQTT retained messages
- Use MessagePack for all payloads

## Communication Protocol Specifications

### Topic Naming Convention

```
agent/{agent_id}/state              # Retained: agent status, capabilities
agent/{agent_id}/tasks/inbound      # Subscribe: tasks assigned to agent
agent/{agent_id}/tasks/outbound     # Publish: task results, status updates
agent/{agent_id}/heartbeat          # Retained: last seen timestamp
swarm/discovery                     # Retained: all registered agents
swarm/task_queue                    # Publish: new tasks (coordinated by Minerva)
swarm/task/{task_id}                # Retained: task state, progress
```

### Message Format (MessagePack)

```typescript
interface AgentMessage {
  type: 'task' | 'result' | 'heartbeat' | 'state';
  from: string;  // agent_id
  to?: string;   // target agent_id (optional for broadcast)
  timestamp: number;
  payload: unknown;
}

interface TaskPayload {
  task_id: string;
  capability: string;  // 'code' | 'test' | 'research' | 'debug'
  priority: number;
  context: Record<string, unknown>;
}
```

### QoS Strategy

- **QoS 0** (at most once): Heartbeats, non-critical state updates
- **QoS 1** (at least once): Task assignments, results, critical state changes
- **Retained messages**: Agent state, discovery, task status

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| Node.js ≥22.0.0 | MQTT.js 5.x, better-sqlite3 9.x | Native ESM modules |
| MQTT.js 5.x | Mosquitto 2.x, Aedes 0.x | MQTT 3.1.1/5.0 support |
| better-sqlite3 9.x | Node.js ≥18.0.0 | Prebuilt binaries for ARMv6/ARMv7/ARM64 |
| msgpackr 0.6.x | Node.js ≥14.0.0 | Optional native addon for performance |

## Sources

### MQTT and Message Brokers
- [Why MQTT Outperforms NATS](https://www.hivemq.com/blog/building-unified-namespace-why-mqtt-outperforms-nats/) (HIGH confidence - official comparison)
- [Mosquitto Documentation](https://mosquitto.org/) (HIGH confidence - official docs)
- [NanoMQ GitHub](https://github.com/nanomq/nanomq) (MEDIUM confidence - GitHub repo)
- [MQTT.js npm](https://www.npmjs.com/package/mqtt) (HIGH confidence - official npm)

### State Management
- [SQLite About Page](https://www.sqlite.org/about.html) (HIGH confidence - official docs)
- [better-sqlite3 Documentation](https://github.com/WiseLibs/better-sqlite3) (HIGH confidence - official GitHub)
- [node-sqlite3 Performance Guide](https://m.blog.csdn.net/gitblog_00700/article/details/150922802) (MEDIUM confidence - 2025 article)

### Serialization
- [msgpackr npm](https://www.npmjs.com/package/msgpackr) (HIGH confidence - official npm)
- [msgpackr Performance Deep Dive](https://blog.csdn.net/gitblog_00056/article/details/139137556) (MEDIUM confidence - 2025 benchmark)
- [MessagePack vs JSON vs CBOR](https://m.blog.csdn.net/sunyuhua_keyboard/article/details/151194181) (MEDIUM confidence - 2025 comparison)

### Task Queues
- [BullMQ npm](https://www.npmjs.com/package/bullmq) (HIGH confidence - official npm)
- [Bee-Queue vs Bull vs Kue Comparison](https://m.blog.csdn.net/gitblog_00712/article/details/155127136) (MEDIUM confidence - 2025 comparison)
- [BullMQ Memory Optimization](https://m.blog.csdn.net/gitblog_00706/article/details/154322110) (MEDIUM confidence - 2025 guide)

### MQTT Retained Messages
- [MQTTnet Retained Messages](https://m.blog.csdn.net/gitblog_00111/article/details/154815107) (MEDIUM confidence - 2025 tutorial)
- [Retained Messages Best Practices](https://m.blog.csdn.net/2401_82978699/article/details/152138580) (MEDIUM confidence - 2025 guide)

### OpenClaw
- [OpenClaw Getting Started](https://www.cnblogs.com/deep-sky/p/19618325) (MEDIUM confidence - 2025 tutorial)
- [OpenClaw Architecture](https://cloud.tencent.com/developer/article/2629491) (MEDIUM confidence - architecture deep-dive)

### NATS
- [NATS JetStream on Edge Devices](https://www.hivemq.com/blog/building-unified-namespace-why-mqtt-outperforms-nats/) (HIGH confidence - official comparison with warnings about JetStream)

---
*Stack research for: OpenClaw Swarm - Lightweight Agent Coordination*
*Researched: 2025-02-21*
