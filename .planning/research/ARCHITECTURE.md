# Architecture Research: OpenClaw Swarm v1.1 Enhancements

**Domain:** Distributed agent swarm coordination system
**Researched:** 2026-02-22
**Confidence:** MEDIUM

## Executive Summary

This document outlines the architectural patterns and integration points for OpenClaw Swarm v1.1 enhancements. The research covers advanced routing, optimization (context references, message batching, connection pooling), checkpointing gaps, and visualization architecture.

**Key Finding:** v1.1 enhancements should integrate with existing v1.0 architecture through extension rather than restructure. All four feature areas can build upon the existing MQTT/SQLite foundation with minimal disruption to deployed systems.

## Existing Architecture (v1.0)

### Current System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Minerva (griak-brain)                                          │
│  ├─ Task Router (role-based, static capability config)         │
│  ├─ DAG Dependency Manager                                      │
│  ├─ Memory Monitor (85% threshold)                             │
│  └─ REST API (12 endpoints)                                    │
├─────────────────────────────────────────────────────────────────┤
│  MQTT Pub/Sub (Mosquitto)                                       │
│  ├─ QoS 0: Heartbeats                                          │
│  ├─ QoS 1: Tasks                                               │
│  └─ MessagePack serialization                                  │
├─────────────────────────────────────────────────────────────────┤
│  SQLite State Store (WAL mode)                                  │
│  ├─ Agent registry (static config)                             │
│  ├─ Task tracking                                              │
│  └─ Checkpoint metadata                                        │
├─────────────────────────────────────────────────────────────────┤
│  Workers                                                        │
│  ├─ griak-server: Vulcan (fixed role)                          │
│  ├─ griak-worker-1: Flexible (dynamic roles)                   │
│  └─ griak-worker-2: Flexible (1GB RAM, throttled)              │
└─────────────────────────────────────────────────────────────────┘
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Minerva | Task orchestration, routing decisions | All workers via MQTT, SQLite for state |
| Task Router | Capability matching, DAG resolution | Minerva, agent registry |
| Memory Monitor | Load detection, task throttling | Local agent process |
| MQTT Broker | Message delivery, pub/sub routing | All agents |
| SQLite Store | Shared state, checkpoint metadata | REST API consumers |

## v1.1 Architecture Extensions

### System Overview with v1.1 Enhancements

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Minerva (griak-brain)                                                  │
│  ├─ Task Router (role-based + dynamic capabilities)                    │
│  ├─ Load Balancer (new)                                                │
│  ├─ DAG Dependency Manager                                             │
│  ├─ Memory Monitor (85% threshold)                                     │
│  ├─ REST API (12 endpoints + dashboard support)                        │
│  └─ WebSocket Bridge (new)                                             │
├─────────────────────────────────────────────────────────────────────────┤
│  MQTT Pub/Sub (Mosquitto)                                               │
│  ├─ QoS 0: Heartbeats                                                  │
│  ├─ QoS 1: Tasks                                                       │
│  ├─ MessagePack serialization                                          │
│  └─ Message Batching Layer (new)                                       │
├─────────────────────────────────────────────────────────────────────────┤
│  SQLite State Store (WAL mode + connection pooling)                     │
│  ├─ Agent registry (static + dynamic capabilities)                     │
│  ├─ Task tracking                                                      │
│  ├─ Checkpoint metadata + recovery completeness                        │
│  └─ Context references (new)                                           │
├─────────────────────────────────────────────────────────────────────────┤
│  Visualization Dashboard (new, runs on griak-brain)                     │
│  ├─ Static web server (serves from /opt/openclaw-swarm/dashboard)      │
│  ├─ WebSocket client (subscribes to bridge)                            │
│  ├─ REST API client                                                    │
│  └─ Auto-discovery (finds ~/.openclaw-swarm or OPENCLAW_SWARM_HOME)    │
├─────────────────────────────────────────────────────────────────────────┤
│  Workers (enhanced)                                                     │
│  ├─ griak-server: Vulcan (fixed role + load reporting)                 │
│  ├─ griak-worker-1: Flexible (dynamic roles + capability declaration)   │
│  └─ griak-worker-2: Flexible (1GB RAM, throttled + load reporting)      │
└─────────────────────────────────────────────────────────────────────────┘
```

## Architectural Patterns

### Pattern 1: Dynamic Capability Declaration

**What:** Workers declare their capabilities at runtime, extending the static configuration in v1.0.

**When to use:** For v1.1 advanced routing where workers need to advertise skills, performance characteristics, or current load.

**Trade-offs:**
- Pros: Flexible adaptation to changing worker capabilities, enables load-based routing
- Cons: Requires trust model (workers could lie about capabilities), adds startup latency

**Implementation:**

```typescript
// Worker capability declaration (runs on worker startup)
interface CapabilityDeclaration {
  workerId: string;
  capabilities: string[];
  performance: {
    avgTaskDuration: number;  // milliseconds
    successRate: number;       // 0-1
  };
  load: {
    cpu: number;               // 0-1
    memory: number;            // 0-1
    activeTasks: number;
  };
  timestamp: number;
}

// MQTT topic: openclaw/swarm/capabilities/declare
// Retained: true (so late-joining workers see current state)
// QoS: 1 (must be delivered)

// Integration with existing static config:
// - Static config provides baseline capabilities (from v1.0 agent registry)
// - Dynamic declarations add/override capabilities at runtime
// - Minerva merges: config.capabilities + declared.capabilities
```

**Integration Point:** Extends existing agent registry in SQLite. New table `dynamic_capabilities` linked to `agents` table.

### Pattern 2: Load-Based Routing

**What:** Route tasks based on current worker load, not just capabilities.

**When to use:** For optimization when some workers are overwhelmed while others idle.

**Trade-offs:**
- Pros: Better resource utilization, faster task completion
- Cons: Requires load monitoring (CPU/memory overhead), adds routing complexity

**Implementation:**

```typescript
// Load tracker (runs on each worker)
class LoadTracker {
  private interval: NodeJS.Timeout;

  constructor(private mqttClient: mqtt.Client, private workerId: string) {
    this.interval = setInterval(() => this.reportLoad(), 5000);
  }

  private reportLoad() {
    const load = {
      cpu: os.loadavg()[0] / os.cpus().length,
      memory: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
      activeTasks: this.getActiveTaskCount(),
      timestamp: Date.now()
    };

    // MQTT topic: openclaw/swarm/load/{workerId}
    // Retained: true (always has latest value)
    // QoS: 0 (latest value sufficient)
    this.mqttClient.publish(
      `openclaw/swarm/load/${this.workerId}`,
      MessagePack.encode(load),
      { retain: true, qos: 0 }
    );
  }
}

// Minerva load-aware routing (extends TaskRouter)
class LoadAwareRouter {
  selectWorker(requiredCapability: string): string {
    const candidates = this.getWorkersWithCapability(requiredCapability);

    // Score based on capability match + current load
    const scored = candidates.map(w => ({
      worker: w,
      score: this.calculateScore(w, requiredCapability)
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored[0].worker;
  }

  private calculateScore(worker: Worker, capability: string): number {
    const load = this.getWorkerLoad(worker.id);

    // Lower load = higher score
    // Available memory consideration for Pi 2B
    const loadScore = 1 - ((load.cpu * 0.5) + (load.memory * 0.5));

    // Historical performance for this capability
    const perfScore = this.getHistoricalPerformance(worker.id, capability);

    return (loadScore * 0.7) + (perfScore * 0.3);
  }
}
```

**Integration Point:** New component in Minerva. Requires workers to run LoadTracker. Load state stored in MQTT retained messages (not SQLite, for speed).

### Pattern 3: Multi-Capability Matching

**What:** Route tasks requiring multiple capabilities to workers that have all required skills.

**When to use:** For complex tasks requiring multiple agent types (e.g., "debug + test").

**Trade-offs:**
- Pros: Enables richer task descriptions, reduces task decomposition overhead
- Cons: Fewer workers qualify, harder to load balance

**Implementation:**

```typescript
// Multi-capability routing (extends TaskRouter)
class MultiCapabilityRouter {
  findWorker(requiredCapabilities: string[]): string | null {
    // Get all workers with ALL required capabilities
    const candidates = this.getWorkers()
      .filter(w => requiredCapabilities.every(cap =>
        w.capabilities.includes(cap)
      ));

    if (candidates.length === 0) {
      // Fallback: decompose task
      return this.decomposeAndRoute(requiredCapabilities);
    }

    // Apply load-based selection
    return this.selectByLoad(candidates);
  }

  private decomposeAndRoute(capabilities: string[]): string {
    // Create sub-tasks for each capability
    // Assign to different workers
    // Return orchestrator worker ID
    return this.createCompositeTask(capabilities);
  }
}
```

**Integration Point:** Extends existing TaskRouter. No new storage requirements.

### Pattern 4: Context References in SQLite

**What:** Store references to large context instead of duplicating data across tasks.

**When to use:** When tasks share large context (project files, conversation history).

**Trade-offs:**
- Pros: Reduces storage overhead, keeps checkpoint size small
- Cons: Requires reference resolution, adds query complexity

**Implementation:**

```typescript
// Context reference schema (SQLite)
CREATE TABLE context_references (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,  -- 'project', 'conversation', 'file'
  location TEXT NOT NULL,  -- file path or external reference
  hash TEXT,  -- content hash for change detection
  created_at INTEGER NOT NULL,
  accessed_at INTEGER,
  size_bytes INTEGER
);

// Task linking (modification to existing tasks table)
CREATE TABLE task_contexts (
  task_id TEXT NOT NULL,
  context_id TEXT NOT NULL,
  role TEXT,  -- 'input', 'output', 'reference'
  PRIMARY KEY (task_id, context_id),
  FOREIGN KEY (context_id) REFERENCES context_references(id)
);

// Usage pattern
class ContextManager {
  private db: Database;

  createContext(type: string, location: string, data: Buffer): string {
    const id = generateId();
    const hash = hashContent(data);

    // Check for duplicate
    const existing = this.db.prepare(
      'SELECT id FROM context_references WHERE hash = ? AND location = ?'
    ).get(hash, location);

    if (existing) {
      return existing.id;
    }

    // Store reference (data stored separately)
    this.db.prepare(
      'INSERT INTO context_references (id, type, location, hash, created_at, size_bytes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, type, location, hash, Date.now(), data.length);

    // Store data in separate location (file system or blob store)
    this.storeData(id, data);

    return id;
  }

  linkTaskToContext(taskId: string, contextId: string, role: string) {
    this.db.prepare(
      'INSERT INTO task_contexts (task_id, context_id, role) VALUES (?, ?, ?)'
    ).run(taskId, contextId, role);

    // Update access time
    this.db.prepare(
      'UPDATE context_references SET accessed_at = ? WHERE id = ?'
    ).run(Date.now(), contextId);
  }

  resolveContext(contextId: string): Buffer {
    const ref = this.db.prepare(
      'SELECT * FROM context_references WHERE id = ?'
    ).get(contextId);

    return this.loadData(ref.id);
  }
}
```

**Integration Point:** New SQLite tables and ContextManager service. Extends existing task storage.

### Pattern 5: Message Batching in MQTT

**What:** Batch multiple small messages into single MQTT publish for efficiency.

**When to use:** For high-frequency small messages (progress updates, metrics).

**Trade-offs:**
- Pros: Reduced protocol overhead, better throughput
- Cons: Increased latency, partial failure handling complexity

**Implementation:**

```typescript
// Message batcher (client-side)
class MessageBatcher {
  private buffer: Map<string, any[]> = new Map();
  private timeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private mqttClient: mqtt.Client,
    private config = {
      maxSize: 100,      // messages per batch
      maxWait: 500,      // milliseconds
      maxBytes: 64 * 1024 // 64KB
    }
  ) {}

  publish(topic: string, message: any, options?: mqtt.IClientPublishOptions) {
    const key = topic;  // batch per topic

    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }

    const batch = this.buffer.get(key)!;
    batch.push(message);

    // Check if should flush
    const size = JSON.stringify(batch).length;
    if (batch.length >= this.config.maxSize || size >= this.config.maxBytes) {
      this.flush(key, options);
    } else if (!this.timeouts.has(key)) {
      // Set timeout for auto-flush
      this.timeouts.set(key, setTimeout(() => {
        this.flush(key, options);
      }, this.config.maxWait));
    }
  }

  private flush(topic: string, options?: mqtt.IClientPublishOptions) {
    const batch = this.buffer.get(topic);
    if (!batch || batch.length === 0) return;

    const payload = MessagePack.encode({
      count: batch.length,
      messages: batch
    });

    this.mqttClient.publish(topic, payload, options);

    // Cleanup
    this.buffer.delete(topic);
    const timeout = this.timeouts.get(topic);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(topic);
    }
  }
}

// Usage for progress updates
const progressBatcher = new MessageBatcher(mqttClient, {
  maxSize: 50,
  maxWait: 1000  // 1 second
});

progressBatcher.publish('openclaw/swarm/progress', {
  taskId: 'task-123',
  progress: 45,
  message: 'Processing file 1 of 10'
});
```

**Integration Point:** Wraps existing MQTT client calls. Use for high-frequency topics only (progress, metrics), not task assignment.

### Pattern 6: Connection Pooling for SQLite

**What:** Reuse database connections instead of opening/closing for each query.

**When to use:** better-sqlite3 is synchronous, so traditional connection pooling doesn't apply. Instead, use a singleton connection with prepared statement caching.

**Trade-offs:**
- Pros: Faster queries, less overhead
- Cons: Single connection can become bottleneck (mitigated by WAL mode)

**Implementation:**

```typescript
// Connection singleton with prepared statement cache
class DatabaseConnection {
  private static instance: Database;
  private statements: Map<string, Statement> = new Map();

  static getInstance(): Database {
    if (!DatabaseConnection.instance) {
      const db = new Database('/opt/openclaw-swarm/state/swarm.db', {
        timeout: 5000,
        verbose: null
      });

      // Configure for multi-access
      db.pragma('journal_mode = WAL');
      db.pragma('cache_size = 32000');
      db.pragma('synchronous = NORMAL');
      db.pragma('wal_autocheckpoint = 1000');

      DatabaseConnection.instance = db;
    }

    return DatabaseConnection.instance;
  }

  // Prepared statement cache
  prepare(sql: string): Statement {
    if (!this.statements.has(sql)) {
      this.statements.set(sql, DatabaseConnection.instance.prepare(sql));
    }
    return this.statements.get(sql)!;
  }

  // Periodic checkpoint to prevent WAL growth
  startCheckpointManager() {
    setInterval(() => {
      try {
        DatabaseConnection.instance.pragma('wal_checkpoint(RESTART)');
      } catch (e) {
        console.error('Checkpoint failed:', e);
      }
    }, 5 * 60 * 1000);  // Every 5 minutes
  }
}

// Usage
const db = DatabaseConnection.getInstance();
const stmt = db.prepare('SELECT * FROM tasks WHERE status = ?');
const activeTasks = stmt.all('active');
```

**Integration Point:** Replace existing direct `new Database()` calls with singleton pattern. Add checkpoint manager for long-running processes.

### Pattern 7: Checkpoint Recovery Completeness

**What:** Ensure cross-machine recovery includes all distributed state.

**When to use:** For crash recovery where tasks were in-progress across multiple workers.

**Trade-offs:**
- Pros: Consistent recovery, no lost state
- Cons: Requires coordination during checkpoint, adds latency

**Implementation:**

```typescript
// Coordinated checkpoint (Chandy-Lamport inspired)
class DistributedCheckpoint {
  async createCheckpoint(): Promise<string> {
    const checkpointId = generateId();

    // Phase 1: Minerva initiates checkpoint
    // Pause new task assignment
    await this.pauseTaskAssignment();

    // Phase 2: Request all workers to checkpoint
    const workerPromises = this.workers.map(worker =>
      this.requestWorkerCheckpoint(worker, checkpointId)
    );

    const workerResults = await Promise.allSettled(workerPromises);

    // Phase 3: Record in-flight messages
    const inFlight = await this.recordInFlightMessages();

    // Phase 4: Write checkpoint metadata to SQLite
    this.db.prepare(`
      INSERT INTO checkpoints
      (id, timestamp, workers, in_flight_messages, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      checkpointId,
      Date.now(),
      JSON.stringify(workerResults),
      JSON.stringify(inFlight),
      'complete'
    );

    // Resume task assignment
    await this.resumeTaskAssignment();

    return checkpointId;
  }

  private async requestWorkerCheckpoint(
    worker: string,
    checkpointId: string
  ): Promise<WorkerCheckpoint> {
    return new Promise((resolve, reject) => {
      const topic = `openclaw/swarm/worker/${worker}/checkpoint`;
      const responseTopic = `openclaw/swarm/worker/${worker}/checkpoint/${checkpointId}`;

      // Subscribe for response
      this.mqtt.subscribe(responseTopic, { qos: 1 });

      const timeout = setTimeout(() => {
        this.mqtt.unsubscribe(responseTopic);
        reject(new Error(`Checkpoint timeout for ${worker}`));
      }, 30000);

      this.mqtt.once('message', (topic, message) => {
        if (topic === responseTopic) {
          clearTimeout(timeout);
          this.mqtt.unsubscribe(responseTopic);
          resolve(MessagePack.decode(message));
        }
      });

      // Send checkpoint request
      this.mqtt.publish(topic, MessagePack.encode({
        checkpointId,
        timestamp: Date.now()
      }), { qos: 1 });
    });
  }

  async restoreFromCheckpoint(checkpointId: string): Promise<void> {
    // Get checkpoint metadata
    const checkpoint = this.db.prepare(
      'SELECT * FROM checkpoints WHERE id = ?'
    ).get(checkpointId);

    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} not found`);
    }

    const workers = JSON.parse(checkpoint.workers);

    // Restore each worker's state
    for (const result of workers) {
      if (result.status === 'fulfilled') {
        await this.restoreWorkerState(result.value);
      }
    }

    // Replay in-flight messages
    const inFlight = JSON.parse(checkpoint.in_flight_messages);
    await this.replayMessages(inFlight);
  }
}
```

**Integration Point:** Extends existing checkpoint system. Requires checkpoint coordination protocol via MQTT.

### Pattern 8: Dashboard Architecture

**What:** Web dashboard for real-time visualization of swarm state.

**When to use:** For monitoring, debugging, and understanding swarm behavior.

**Trade-offs:**
- Pros: Visibility into system state, easier debugging
- Cons: Adds dependency (web server), increases memory footprint

**Implementation:**

```typescript
// Dashboard architecture (inspired by openclaw-mission-control)
//
// Location: Runs on griak-brain (where Minerva and SQLite live)
// Stack: Node.js + Express + WebSocket + static HTML/JS
// Auto-discovery: Finds ~/.openclaw-swarm or OPENCLAW_SWARM_HOME
//
// Directory structure:
// /opt/openclaw-swarm/
//   ├── dashboard/
//   │   ├── dist/          # Built static files (HTML/CSS/JS)
//   │   │   └── bundle.js  # Frontend bundle
//   │   └── server.ts      # Dashboard server
//   └── state/
//       └── swarm.db       # SQLite database

// Dashboard server (runs alongside Minerva)
import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';

class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private mqttClient: mqtt.Client;
  private db: Database;

  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.db = DatabaseConnection.getInstance();
    this.mqttClient = getMQTTClient();

    this.setupRoutes();
    this.setupWebSocket();
    this.setupMQTTBridge();
  }

  private setupRoutes() {
    // Serve static files
    this.app.use(express.static('/opt/openclaw-swarm/dashboard/dist'));

    // REST API endpoints for dashboard
    this.app.get('/api/agents', (req, res) => {
      const agents = this.db.prepare('SELECT * FROM agents').all();
      res.json(agents);
    });

    this.app.get('/api/tasks', (req, res) => {
      const tasks = this.db.prepare(
        'SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100'
      ).all();
      res.json(tasks);
    });

    this.app.get('/api/workers/:workerId/load', (req, res) => {
      // Load comes from MQTT retained messages, not SQLite
      const load = this.getWorkerLoadFromMQTT(req.params.workerId);
      res.json(load);
    });
  }

  private setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Dashboard client connected');

      // Send initial state
      this.sendInitialState(ws);

      ws.on('close', () => {
        console.log('Dashboard client disconnected');
      });
    });
  }

  private setupMQTTBridge() {
    // Subscribe to all swarm topics
    this.mqttClient.subscribe('openclaw/swarm/#', { qos: 0 });

    // Bridge MQTT messages to WebSocket clients
    this.mqttClient.on('message', (topic, message) => {
      const data = MessagePack.decode(message);

      this.wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'mqtt',
            topic,
            data
          }));
        }
      });
    });
  }

  private sendInitialState(ws: WebSocket) {
    // Send agents, tasks, current state
    const state = {
      agents: this.db.prepare('SELECT * FROM agents').all(),
      tasks: this.db.prepare('SELECT * FROM tasks WHERE status != ?').all('completed'),
      workers: this.getCurrentWorkerStates()
    };

    ws.send(JSON.stringify({
      type: 'init',
      data: state
    }));
  }

  listen(port: number) {
    this.server.listen(port, () => {
      console.log(`Dashboard listening on port ${port}`);
    });
  }
}

// Auto-discovery (similar to openclaw-mission-control)
function discoverOpenClawSwarm() {
  const paths = [
    process.env.OPENCLAW_SWARM_HOME,
    path.join(os.homedir(), '.openclaw-swarm'),
    '/opt/openclaw-swarm'
  ].filter(Boolean);

  for (const p of paths) {
    if (fs.existsSync(path.join(p, 'state', 'swarm.db'))) {
      return p;
    }
  }

  throw new Error('Cannot find OpenClaw Swarm installation');
}
```

**Integration Point:** New DashboardServer runs on griak-brain. Serves static files, provides REST API, bridges MQTT to WebSocket. Minimal impact on existing components.

**Mosquitto Configuration for WebSocket:**

```ini
# /etc/mosquitto/mosquitto.conf

# Existing MQTT TCP
port 1883

# Add WebSocket support
listener 9001
protocol websockets
allow_anonymous false
password_file /etc/mosquitto/passwd
```

**Dashboard Connection Flow:**

```
Browser
  ↓ HTTP (port 3333)
Dashboard static files (HTML/JS)
  ↓ WebSocket (port 3333)
Dashboard WebSocket Server
  ↓ MQTT subscribe
Mosquitto Broker (port 1883/9001)
  ↓ publish
All workers and Minerva
```

## Data Flow

### v1.1 Enhanced Request Flow

```
[User Request via Dashboard]
    ↓
[Dashboard REST API]
    ↓
[Minerva Task Router] → [Capability Matcher] → [Load Balancer]
    ↓                           ↓                    ↓
[Worker Selection] ← [Agent Registry] ← [Worker Load Reports]
    ↓
[MQTT Task Publish]
    ↓
[Worker receives task]
    ↓
[Progress updates via Message Batcher]
    ↓
[MQTT Progress Publish]
    ↓
[Dashboard WebSocket Bridge]
    ↓
[Real-time UI Update]
```

### Checkpoint Recovery Flow

```
[Checkpoint Triggered]
    ↓
[Minerva pauses task assignment]
    ↓
[Send checkpoint request to all workers via MQTT]
    ↓
[Workers save local state (60s interval) → respond]
    ↓
[Minerva records in-flight messages]
    ↓
[Checkpoint metadata written to SQLite]
    ↓
[Resume task assignment]

On Recovery:
    ↓
[Minerva reads checkpoint metadata from SQLite]
    ↓
[Restore worker states from worker checkpoints]
    ↓
[Replay in-flight messages]
    ↓
[Resume operation]
```

## Project Structure

### v1.1 Enhanced Structure

```
/opt/openclaw-swarm/
├── src/
│   ├── minerva/                      # Minerva orchestrator
│   │   ├── task-router.ts            # Existing: capability matching
│   │   ├── load-aware-router.ts      # NEW: load-based routing
│   │   ├── multi-capability-router.ts # NEW: multi-capability matching
│   │   ├── dag-manager.ts            # Existing: dependency resolution
│   │   └── checkpoint-coordinator.ts # NEW: distributed checkpointing
│   ├── workers/                      # Worker implementations
│   │   ├── load-tracker.ts           # NEW: load reporting
│   │   ├── capability-declarator.ts  # NEW: dynamic capability declaration
│   │   └── task-executor.ts          # Existing: task execution
│   ├── mqtt/
│   │   ├── client.ts                 # Existing: MQTT wrapper
│   │   ├── message-batcher.ts        # NEW: message batching
│   │   └── topics.ts                 # Existing: topic constants
│   ├── storage/
│   │   ├── database.ts               # Existing: SQLite connection
│   │   ├── connection-pool.ts        # NEW: singleton + prepared statements
│   │   ├── context-manager.ts        # NEW: context references
│   │   └── checkpoint-store.ts       # Existing: checkpoint metadata
│   ├── rest-api/
│   │   ├── server.ts                 # Existing: Express server
│   │   ├── routes/
│   │   │   ├── agents.ts             # Existing
│   │   │   ├── tasks.ts              # Existing
│   │   │   └── dashboard.ts          # NEW: dashboard-specific endpoints
│   │   └── websocket-bridge.ts       # NEW: MQTT → WebSocket bridge
│   └── dashboard/                    # NEW: Dashboard server & frontend
│       ├── server.ts                 # Dashboard HTTP/WebSocket server
│       ├── auto-discovery.ts         # Find OpenClaw Swarm installation
│       └── frontend/                 # Web UI source
│           ├── src/
│           │   ├── components/       # React components
│           │   │   ├── SwarmOverview.tsx
│           │   │   ├── TaskTimeline.tsx
│           │   │   ├── CapabilityMatrix.tsx
│           │   │   └── WorkerStatus.tsx
│           │   ├── hooks/
│           │   │   ├── useSwarmState.ts
│           │   │   └── useWebSocket.ts
│           │   └── pages/
│           │       └── Dashboard.tsx
│           └── package.json
├── state/
│   └── swarm.db                      # SQLite database (enhanced schema)
├── dashboard/
│   └── dist/                         # Built frontend assets
├── config/
│   ├── agent-registry.json           # Existing: static agent config
│   └── dashboard.json                # NEW: dashboard config
└── package.json
```

### Structure Rationale

- **minerva/**: Orchestrator enhancements for v1.1 features (routing, checkpointing)
- **workers/**: Worker-side enhancements (load tracking, capability declaration)
- **mqtt/**: Message batching layer, extends existing MQTT client
- **storage/**: Connection pooling, context references, extends existing SQLite access
- **rest-api/**: Adds dashboard support routes and WebSocket bridge
- **dashboard/**: New visualization layer, isolated to minimize impact on core

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Mosquitto MQTT | Existing MQTT.js client | Add WebSocket listener on port 9001 |
| SQLite | better-sqlite3 singleton | Add WAL checkpoint manager |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Minerva ↔ Workers | MQTT pub/sub | Add load reporting topics, capability declaration topics |
| Dashboard ↔ Minerva | REST API + WebSocket | REST for state queries, WebSocket for real-time updates |
| Dashboard ↔ MQTT | MQTT subscribe + WebSocket bridge | Bridge subscribes to `openclaw/swarm/#`, forwards to WebSocket clients |
| LoadTracker ↔ TaskRouter | MQTT retained messages | Load state in MQTT (not SQLite) for speed |
| ContextManager ↔ Tasks | SQLite foreign keys | New tables extend existing task schema |

## Memory Impact on Pi 2B

| Component | Additional Memory | Mitigation |
|-----------|-------------------|------------|
| Message Batching | ~1MB (buffer) | Configurable batch size, flush on memory pressure |
| Load Tracker | <100KB | Minimal, only reports metrics |
| Capability Declarator | <50KB | One-time at startup |
| Dashboard (griak-brain only) | ~30MB (server) | Not on Pi 2B workers |
| Connection Pooling | <1MB (statement cache) | Replaces connection overhead |
| Context Manager | <500KB | Reduces duplication |

**Total on Pi 2B workers:** ~2-3MB additional
**Total on griak-brain:** ~35MB additional (dashboard server)
**Conclusion:** Acceptable within 1GB constraint, especially with existing 85% throttling threshold.

## Scaling Considerations

| Scale | Current Architecture | v1.1 Impact |
|-------|---------------------|-------------|
| 4 workers (current) | MQTT handles easily | No change needed |
| 10 workers | MQTT still fine | Dashboard may need rate limiting |
| 50+ workers | Message batching critical | Load-based routing essential |

### Scaling Priorities

1. **First bottleneck:** Dashboard WebSocket connection count (mitigate with connection pooling on server)
2. **Second bottleneck:** SQLite concurrent access (mitigate with WAL mode + connection pooling)

## Anti-Patterns

### Anti-Pattern 1: Synchronous Load Reporting

**What people do:** Query workers for load on every routing decision.

**Why it's wrong:** Blocks task assignment, high latency, worker overload from polling.

**Do this instead:** Workers push load via MQTT retained messages every 5 seconds. Minerva reads from retained message (cache hit, no worker query).

### Anti-Pattern 2: Storing Load State in SQLite

**What people do:** Write load metrics to SQLite on every update.

**Why it's wrong:** High write contention, unnecessary persistence (load is ephemeral), slower queries.

**Do this instead:** Use MQTT retained messages for load state. Only persist to SQLite for historical analysis (async, separate table).

### Anti-Pattern 3: Large Checkpoint Transactions

**What people do:** Wrap entire checkpoint in single SQLite transaction.

**Why it's wrong:** Blocks all other access, huge WAL growth, recovery time explodes.

**Do this instead:** Per-worker checkpoints stored separately. SQLite only stores metadata and coordination state. Workers checkpoint locally first, then register with Minerva.

### Anti-Pattern 4: Dashboard Polling REST API

**What people do:** Frontend polls REST API every second for updates.

**Why it's wrong:** High server load, stale data, unnecessary network traffic.

**Do this instead:** WebSocket + MQTT bridge for real-time push updates. REST API only for initial state and queries.

### Anti-Pattern 5: Message Batching Everything

**What people do:** Batch all MQTT messages including task assignment.

**Why it's wrong:** Adds unacceptable latency to task assignment, complex partial failure handling.

**Do this instead:** Only batch high-frequency, low-value messages (progress, metrics, heartbeats). Task assignment and critical control messages remain unbatched.

## Sources

- [Gossip-Enhanced Communication for Agentic AI](https://arxiv.org/html/2512.03285v1) - Dynamic capability discovery patterns
- [Microsoft Learn: Cloud Challenges - Fault Tolerance](https://learn.microsoft.com/zh-cn/training/modules/cmu-distributed-programming-introduction/12-challenges-fault-tolerance/) - Distributed checkpoint consistency
- [Mosquitto Web Management Tools (CSDN)](https://blog.csdn.net/gitblog_00216/article/details/151525166) - WebSocket configuration
- [MQTT.js Documentation](http://www.jb51.net/article/281193.htm) - WebSocket connection patterns
- [SQLite Advanced Usage and Security (CSDN)](https://m.blog.csdn.net/qq_62848032/article/details/147366088) - WAL mode optimization
- [openclaw-mission-control](https://github.com/robsannaa/openclaw-mission-control) - Dashboard architecture reference
- [Eunomia: Checkpoint/Restore Systems](https://eunomia.dev/zh/blog/posts/check-restore/) - Checkpoint implementation patterns
- [GeeksforGeeks: Message Logging and Checkpointing](https://www.geeksforgeeks.org/system-design/distributed-system-fault-tolerance-using-message-logging-and-checkpointing/) - Recovery patterns

---
*Architecture research for: OpenClaw Swarm v1.1 Enhancements*
*Researched: 2026-02-22*
