# Architecture Research

**Domain:** Distributed Agent Swarm Coordination Systems
**Researched:** 2026-02-21
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

Based on research into 2026 agent swarm coordination patterns and multi-agent systems, distributed agent coordination systems typically follow a **hybrid hierarchical architecture** combining centralized orchestration with decentralized execution:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Coordination Layer                           │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐        ┌──────────────┐      ┌─────────────┐    │
│  │   Minerva   │◄──────►│ Task Queue   │◄────►│  Agent      │    │
│  │ (Orchestrator)│      │ (Shared State)│      │  Registry  │    │
│  │             │        │              │      │             │    │
│  └──────┬──────┘        └──────┬───────┘      └─────────────┘    │
│         │                      │                                  │
├─────────┼──────────────────────┼──────────────────────────────────┤
│         │     Message Bus      │                                  │
│         │   (MQTT/NATS/ZeroMQ) │                                  │
├─────────┼──────────────────────┼──────────────────────────────────┤
│         ▼                      ▼                                  │
│  ┌─────────────┐        ┌──────────────┐      ┌─────────────┐    │
│  │   Vulcan    │        │  Worker-1    │      │  Worker-2   │    │
│  │  (Builder)  │        │  (Flexible)  │      │  (Flexible)  │    │
│  │             │        │              │      │             │    │
│  └─────────────┘        └──────────────┘      └─────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **Orchestrator (Minerva)** | Maintains project context, delegates tasks to agents, monitors progress, aggregates results | Central coordinator with full project state, decision-making logic for agent selection |
| **Agent Registry** | Tracks available agents, their capabilities, current status, and machine assignments | Discovery service with capability metadata and health checking |
| **Task Queue** | Shared state for pending/in-progress/completed tasks, supports dependency tracking | Persistent store with atomic operations, can use message broker queues |
| **Message Bus** | Transports messages between agents, handles routing, provides pub/sub and request/reply patterns | Lightweight broker (MQTT/NATS) or direct messaging (ZeroMQ) |
| **Worker Agents** | Execute assigned tasks, report status, request guidance when needed | Specialized processes with role-specific capabilities |
| **State Store** | Maintains shared project state accessible to all instances | Lightweight database or file-based store with synchronization |

## Recommended Project Structure

For OpenClaw Swarm coordination layer:

```
openclaw-swarm/
├── cmd/
│   ├── orchestrator/    # Minerva - runs on griak-brain
│   │   └── main.go
│   ├── worker/          # Worker agent - runs on all machines
│   │   └── main.go
│   └── registry/        # Optional standalone registry service
│       └── main.go
├── internal/
│   ├── agent/           # Agent core functionality
│   │   ├── agent.go     # Agent interface and base implementation
│   │   ├── lifecycle.go # Start/stop/restart logic
│   │   └── heartbeat.go # Health monitoring
│   ├── communication/   # Messaging layer
│   │   ├── bus.go       # Message bus abstraction
│   │   ├── mqtt.go      # MQTT implementation
│   │   ├── nats.go      # NATS implementation
│   │   └── zmq.go       # ZeroMQ implementation
│   ├── coordination/    # Coordination logic
│   │   ├── orchestrator.go # Task delegation and routing
│   │   ├── registry.go     # Agent discovery and registration
│   │   └── dispatcher.go   # Task assignment logic
│   ├── protocol/        # Message definitions
│   │   ├── messages.go  # Message types (Task, Status, Result)
│   │   └── codec.go     # Serialization/deserialization
│   ├── state/           # State management
│   │   ├── store.go     # Shared state interface
│   │   ├── memory.go    # In-memory implementation
│   │   └── sqlite.go    # Persistent implementation
│   └── transport/       # Transport layer
│       ├── client.go    # Transport client
│       └── server.go    # Transport server
├── pkg/
│   └── swarm/           # Public API for OpenClaw integration
│       ├── client.go    # Client for interacting with swarm
│       └── types.go     # Public types
├── config/
│   ├── brain.yaml       # Config for griak-brain (orchestrator)
│   ├── server.yaml      # Config for griak-server
│   └── worker.yaml      # Config for worker machines
└── scripts/
    ├── install.sh       # Installation script
    └── start-swarm.sh   # Startup script for all instances
```

### Structure Rationale

- **cmd/**: Separate binaries for orchestrator, worker, and optional registry - allows role-based deployment
- **internal/agent/**: Core agent functionality with lifecycle management and health monitoring
- **internal/communication/**: Pluggable messaging layer supporting multiple protocols for flexibility
- **internal/coordination/**: Orchestrator logic, registry, and task dispatcher - clear separation of concerns
- **internal/protocol/**: Message definitions and codec - ensures type-safe communication
- **internal/state/**: Abstracted state management allowing different backends (memory, SQLite, Redis)
- **pkg/swarm/**: Public API for OpenClaw gateway integration - clean interface boundary
- **config/**: Separate configs per machine role - enables environment-specific tuning

## Architectural Patterns

### Pattern 1: Actor Model with Message Passing

**What:** Each agent is an "actor" that processes messages asynchronously, maintains private state, and communicates only via message passing. No direct state access between agents.

**When to use:**
- Concurrent task execution across multiple agents
- Fault isolation between agent processes
- Natural mapping to distributed systems

**Trade-offs:**
- Pros: Excellent concurrency, fault isolation, scales well
- Cons: Message overhead, debugging complexity, eventual consistency challenges

**Example:**
```go
// Agent as an actor
type Agent struct {
    id       string
    role     string
    inbox    chan Message
    state    AgentState
    handler  MessageHandler
}

func (a *Agent) Start() {
    go func() {
        for msg := range a.inbox {
            // Process message, update private state
            response := a.handler.Handle(msg, a.state)
            // Send response (no direct state access)
            a.send(response)
        }
    }()
}

// Communication via messages, not state access
type TaskMessage struct {
    TaskID   string
    Type     string
    Payload  interface{}
}
```

### Pattern 2: Master-Worker with Task Queue

**What:** Central orchestrator (Minerva) maintains task queue, assigns tasks to workers based on capabilities and availability. Workers pull tasks, execute, and report results.

**When to use:**
- Clear task decomposition and delegation workflow
- Centralized project context management
- Need for task dependencies and ordering

**Trade-offs:**
- Pros: Simple mental model, easy debugging, centralized control
- Cons: Single point of failure (orchestrator), potential bottleneck

**Example:**
```go
type Orchestrator struct {
    taskQueue  chan Task
    agents     map[string]*AgentInfo
    dispatcher *Dispatcher
}

func (o *Orchestrator) DelegateTask(task Task) error {
    // Select best agent based on role/capabilities
    agent := o.dispatcher.SelectBestAgent(task, o.agents)
    // Send task to selected agent
    return o.sendTask(agent, task)
}

type Worker struct {
    role      string
    taskQueue chan Task
}

func (w *Worker) Run() {
    for task := range w.taskQueue {
        result := w.execute(task)
        w.reportResult(result)
    }
}
```

### Pattern 3: Publish-Subscribe for Event Broadcasting

**What:** Agents publish events (status updates, completions) to topics; other agents subscribe to relevant topics. Decouples senders from receivers.

**When to use:**
- Status broadcasting (heartbeats, progress updates)
- Event-driven coordination
- Multi-agent notifications

**Trade-offs:**
- Pros: Loose coupling, flexible routing, natural for IoT/embedded
- Cons: No guaranteed delivery without QoS, message ordering challenges

**Example:**
```go
// Publisher (any agent)
func (a *Agent) PublishStatus(status Status) {
    msg := Message{
        Topic:   "agent.status",
        Payload: status,
    }
    a.bus.Publish(msg)
}

// Subscriber (orchestrator or other agents)
func (o *Orchestrator) SubscribeToStatuses() {
    o.bus.Subscribe("agent.status", func(msg Message) {
        status := msg.Payload.(Status)
        o.updateAgentStatus(status)
    })
}
```

### Pattern 4: Request-Reply for Synchronous Queries

**What:** Agent sends request and waits for reply. Useful for queries, guidance requests, and RPC-style interactions.

**When to use:**
- Agent requesting guidance from orchestrator
- Synchronous queries to registry
- Direct command-response patterns

**Trade-offs:**
- Pros: Simple request/response semantics, clear correlation
- Cons: Blocking, requires both endpoints available, less resilient

**Example:**
```go
// Requester (worker asking for guidance)
func (w *Worker) RequestGuidance(taskID string) (Guidance, error) {
    request := GuidanceRequest{
        TaskID: taskID,
        AgentID: w.id,
    }
    return w.client.Request("guidance", request)
}

// Replier (orchestrator providing guidance)
func (o *Orchestrator) HandleGuidanceRequest(req GuidanceRequest) Guidance {
    // Provide project context or task clarification
    return o.getGuidanceFor(req.TaskID)
}
```

## Data Flow

### Task Delegation Flow

```
User Request
    ↓
Minerva (Orchestrator)
    ↓ (analyze task)
Agent Registry (query capabilities)
    ↓ (select best agent)
Message Bus (send task)
    ↓
Worker Agent (receive task)
    ↓ (execute)
State Store (update status)
    ↓
Message Bus (publish result)
    ↓
Minerva (aggregate result)
    ↓
User Response
```

### State Management Flow

```
[Minerva]────────────┐
      │              │
      │ writes       │ reads
      ▼              │
  [Shared State Store]◀────┐
      │                      │
      │ publishes            │ subscribes
      ▼                      │
  [Message Bus]─────────────┼───────┐
      │                      │       │
      ▼                      ▼       ▼
  [Vulcan]            [Worker-1] [Worker-2]
   subscribes          subscribes subscribes
```

### Key Data Flows

1. **Task Assignment:** Minerva → Task Queue → Worker Agent (pull or push)
2. **Status Updates:** Worker Agent → Message Bus (pub) → Minerva (sub)
3. **Guidance Request:** Worker Agent → Message Bus (req/rep) → Minerva
4. **Result Reporting:** Worker Agent → State Store + Message Bus → Minerva
5. **Agent Discovery:** Worker Agent → Registry → Minerva (query)

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 2-4 agents (current) | Single orchestrator, in-memory state, lightweight broker (MQTT/ZeroMQ) |
| 5-10 agents | Add persistent state store (SQLite), consider clustering (NATS) |
| 10+ agents | Distributed orchestrator (leader election), Redis for state, partitioned topics |

### Scaling Priorities

1. **First bottleneck: Orchestrator memory/context**
   - Mitigation: Offload project context to persistent store, implement context windowing, streaming state updates

2. **Second bottleneck: Message bus throughput**
   - Mitigation: Switch from MQTT to NATS for higher throughput, use topic partitioning, implement message batching

3. **Third bottleneck: Network latency**
   - Mitigation: Local message queuing, compression for large payloads, opportunistic synchronization

## Anti-Patterns

### Anti-Pattern 1: Tight Coupling via Direct State Access

**What people do:** Agents directly read/write each other's state or share memory
**Why it's wrong:** Breaks encapsulation, creates race conditions, makes distributed debugging impossible
**Do this instead:** Use message passing with private actor state, all state changes via messages

### Anti-Pattern 2: Chatty Communications

**What people do:** Excessive small messages between agents (status updates per line of code)
**Why it's wrong:** Overwhelms message bus, especially on constrained networks (Pi 2B)
**Do this instead:** Batch updates, heartbeat intervals, event-driven (not polling) status

### Anti-Pattern 3: Synchronous Delegation Chains

**What people do:** Minerva → Worker-1 → Worker-2 synchronously, blocking at each hop
**Why it's wrong:** Long chains compound latency, single failure blocks entire chain
**Do this instead:** Fire-and-forget with callbacks, parallel delegation where possible

### Anti-Pattern 4: Ignoring Hardware Constraints

**What people do:** Design assuming cloud resources, not considering Pi 2B (1GB RAM)
**Why it's wrong:** OOM kills, swap thrashing, unusable system
**Do this instead:** Memory budget per agent, streaming processing, lightweight protocol (MQTT vs Kafka)

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| OpenClaw Gateway | Direct library integration | Use pkg/swarm client API |
| Message Broker (MQTT/NATS) | TCP client connection | Run on griak-brain, accessible to all |
| State Store | Embedded SQLite (v1) | Single file on griak-brain, synced via messaging |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Minerva ↔ Workers | Message Bus (req/rep + pub/sub) | Minerva sends tasks, receives results |
| Workers ↔ Registry | Message Bus (req/rep) | Workers register, query capabilities |
| Workers ↔ Workers | Message Bus (pub/sub) | Optional direct collaboration |
| Swarm Layer ↔ OpenClaw | Library calls (in-process) | On same machine, no network needed |

## Hardware-Aware Design

Given Pi 2B constraints (1GB RAM), architecture must prioritize:

1. **Memory Budget per Agent:** ~50-100MB max per agent process
2. **Protocol Choice:** MQTT (lightweight) preferred over heavier brokers
3. **State Storage:** SQLite with limited in-memory cache, not full Redis
4. **Message Batching:** Combine multiple status updates into single message
5. **Streaming Context:** Send task context in chunks, not all at once

## Recommended Build Order

Based on dependencies and complexity:

1. **Phase 1: Communication Layer**
   - Message bus abstraction + MQTT implementation
   - Protocol definitions (messages, codec)
   - Basic transport (client/server)

2. **Phase 2: Agent Core**
   - Agent base implementation with lifecycle
   - Heartbeat and health monitoring
   - Message handling loop

3. **Phase 3: Registry and Discovery**
   - Agent registration
   - Capability querying
   - Health tracking

4. **Phase 4: Task Queue and State**
   - Task queue implementation
   - Shared state store (SQLite)
   - Status tracking

5. **Phase 5: Orchestrator (Minerva)**
   - Task delegation logic
   - Agent selection based on capabilities
   - Result aggregation

6. **Phase 6: Worker Implementation**
   - Task execution wrapper
   - Status reporting
   - Guidance request handling

7. **Phase 7: OpenClaw Integration**
   - pkg/swarm client API
   - Gateway integration hooks
   - Configuration management

## Sources

### Agent Swarm Architecture Patterns
- [Agent 蜂群模式（Swarm）](https://juejin.cn/post/7603575399255949352) - Swarm vs Supervisor vs Chain mode comparison
- [AutoGen智能体开发：多代理设计模式](https://m.blog.csdn.net/shanghaiwren/article/details/155362307) - Multi-agent design patterns
- [AgentScope: Actor-Based Distributed Multi-Agent Platform](https://arxiv.org/html/2402.14034) - Actor-based distributed mechanism research

### Communication Protocols
- [MQTT.org - Official Site](https://mqtt.org/) - MQTT protocol specification
- [Eclipse Paho](https://www.eclipse.org/paho/index.php?page=clients/rust/index.php) - MQTT client implementations
- [NATS with MQTT Support](https://cloud.tencent.com/developer/article/2517911) - NATS 2.10+ MQTT integration
- [MQTT协议详解](https://m.blog.csdn.net/gitblog_00506/article/details/154165487) - MQTT protocol deep dive

### Actor Model and Messaging
- [Go语言的消息传递：ZeroMQ](https://m.blog.csdn.net/universsky2015/article/details/137281866) - ZeroMQ with Golang
- [Golang之ZeroMQ基础使用](https://juejin.cn/post/7127297450066313253) - ZeroMQ tutorial
- [Actor Model of Computation](https://xueshu.baidu.com/usercenter/paper/show?paperid=12f2249c49252cafde7690f36f3dfa50) - Actor model theory

### Lightweight Coordination
- [Adaptive Energy Management for Smart Microgrids](https://www.mdpi.com/2076-3417/15/19/10358) - Multi-agent with MQTT on Raspberry Pi
- [构建跨设备音频流的多媒体管理系统](https://wenku.csdn.net/doc/3xx0hrezde) - ZeroMQ on Raspberry Pi 3B+
- [nats-server边缘计算](https://m.blog.csdn.net/gitblog_00239/article/details/151143507) - NATS for edge computing

---
*Architecture research for: OpenClaw Swarm - Distributed Agent Coordination*
*Researched: 2026-02-21*
