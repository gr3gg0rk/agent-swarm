# OpenClaw Swarm

A lightweight agent coordination layer that enables multiple OpenClaw instances running on separate machines to work together as a cohesive team.

## Overview

OpenClaw Swarm allows Minerva (the brain agent) to delegate tasks to specialized agents running on worker machines. Workers execute tasks and report results back through a centralized message bus.

**Core Capability:** Minerva can assign a task to any agent in the swarm and get a result back.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         griak-brain (Beelink T4)                    │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────────────────┐ │
│  │   Minerva   │   │   REST API   │   │      Dashboard           │ │
│  │ (Orchestr.) │   │   :3000      │   │   :5173 (dev)            │ │
│  └──────┬──────┘   └──────┬───────┘   └────────────┬─────────────┘ │
│         │                 │                        │                │
│  ┌──────┴─────────────────┴────────────────────────┴─────────────┐ │
│  │                    MQTT Broker (Mosquitto :1883)               │ │
│  └────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                    │                    │                    │
         ┌──────────┴───────┐  ┌────────┴───────┐  ┌────────┴───────┐
         │  griak-server     │  │ griak-worker-1 │  │ griak-worker-2 │
         │  (Pi 5, 8GB)      │  │ (Pi 3B, 1GB)   │  │ (Pi 2B, 1GB)   │
         │  ┌─────────────┐  │  │ ┌────────────┐ │  │ ┌────────────┐ │
         │  │   Vulcan    │  │  │ │  Worker-2  │ │  │ │  Worker-3  │ │
         │  │  (Builder)  │  │  │ │ (Flexible) │ │  │ │ (Flexible) │ │
         │  └─────────────┘  │  │ └────────────┘ │  │ └────────────┘ │
         └───────────────────┘  └────────────────┘  └────────────────┘
```

## Components

### Packages

| Package | Purpose |
|---------|---------|
| `@openclaw-swarm/coordination` | Core library - MQTT messaging, state management, task routing |
| `@openclaw-swarm/dashboard` | Web UI for monitoring swarm status |

### Agent Roles

| Role | Machine | Responsibilities |
|------|---------|------------------|
| **Minerva** | griak-brain | Orchestrator, task delegation, project context |
| **Vulcan** | griak-server | Builder, code execution, testing |
| **Worker-2** | griak-worker-1 | Flexible multi-role worker |
| **Worker-3** | griak-worker-2 | Flexible multi-role worker |

## Quick Start

### Prerequisites

1. **Node.js** >= 22.0.0
2. **Mosquitto** MQTT broker (typically on port 1883)
3. **SQLite3** for state persistence

### 1. Install Dependencies

```bash
# Root dependencies
npm install

# Coordination package
cd packages/coordination
npm install
npm run build

# Dashboard package
cd ../dashboard
npm install
```

### 2. Start the MQTT Broker

On griak-brain (or wherever Mosquitto runs):

```bash
# Using Mosquitto
mosquitto -c /etc/mosquitto/mosquitto.conf

# Or via Docker
docker run -it -p 1883:1883 -p 9001:9001 eclipse-mosquitto
```

### 3. Start the Dashboard (griak-brain only)

```bash
cd packages/dashboard

# Development mode (with hot reload)
npm run dev
# Opens at http://localhost:5173

# Production mode
npm run build
npm run preview
```

The dashboard shows:
- Agent status (online/offline, CPU, memory)
- Active tasks with progress
- System metrics overview

### 4. Start the REST API Server

The coordination package includes a REST API server for state access:

```typescript
import { createStateApi, startServer, createDatabase } from '@openclaw-swarm/coordination';

const db = createDatabase({ dbPath: '/var/lib/openclaw-swarm/state.db' });
const app = createStateApi(db);
startServer(app, 3000);
```

API Endpoints:
- `GET /api/status` - Agent status
- `GET /api/tasks` - Task queue
- `POST /api/tasks` - Create task
- `GET /api/events` - SSE stream for real-time updates
- `GET /health` - Health check

## How Agents Connect

### Agent Registration

Agents register by connecting to the MQTT broker and publishing their info:

```typescript
import { connectToBroker, AgentDiscovery, Topics } from '@openclaw-swarm/coordination';

// 1. Connect to MQTT broker
const mqttClient = await connectToBroker({
  brokerUrl: 'mqtt://griak-brain:1883',
  clientId: 'worker-1'
});

// 2. Subscribe to command channel
await mqttClient.subscribe(Topics.agentCommand('worker-1'), 1);

// 3. Register with swarm
const discovery = new AgentDiscovery(mqttClient);
await discovery.registerAgent({
  agentId: 'worker-1',
  role: 'worker',
  capabilities: ['code', 'test'],
  hostname: 'griak-server',
  version: '0.1.0',
  startedAt: Date.now()
});

// 4. Start sending heartbeats (every 30 seconds)
```

### Example Agent Implementation

See `examples/basic-agent.ts` for a complete example:

```bash
# Run the example agent
CONFIG_PATH=/path/to/config.yaml tsx examples/basic-agent.ts
```

## How Agents Communicate

### MQTT Topic Hierarchy

```
agent/{agent_id}/command     → Task assignments (subscribe as worker)
agent/{agent_id}/result      → Task results (subscribe as orchestrator)
agent/{agent_id}/progress    → Progress updates
agent/{agent_id}/heartbeat   → Heartbeat signals
agent/{agent_id}/load        → Load metrics (retained)
agent/{agent_id}/cancel      → Task cancellation

swarm/agents/{agent_id}      → Agent registration (retained)
swarm/discovery              → Discovery broadcasts
swarm/status                 → System-wide status
```

### Message Flow

```
1. Minerva assigns task:
   PUBLISH agent/worker-1/command
   {
     messageId: "uuid",
     type: "task",
     from: "minerva",
     payload: { taskType: "code", description: "..." },
     qos: 1
   }

2. Worker processes and sends progress:
   PUBLISH agent/worker-1/progress
   { progress: 50, message: "Writing code..." }

3. Worker completes and sends result:
   PUBLISH agent/worker-1/result
   {
     correlationId: "<original messageId>",
     type: "result",
     payload: { status: "completed", output: "..." },
     qos: 1
   }
```

### QoS Levels

| QoS | Use Case | Example |
|-----|----------|---------|
| 0 | Fire-and-forget | Heartbeats, status updates |
| 1 | At-least-once delivery | Tasks, results |

## Configuration

### Agent Registry (`config/agents.yaml`)

```yaml
agents:
  - agentId: minerva
    hostname: griak-brain
    role: orchestrator

  - agentId: worker-1
    hostname: griak-server
    role: worker

  - agentId: worker-2
    hostname: griak-worker-1
    role: worker

  - agentId: worker-3
    hostname: griak-worker-2
    role: worker
```

### Agent Config (`examples/config.yaml`)

```yaml
agentId: minerva
role: orchestrator
brokerUrl: mqtt://griak-brain:1883
capabilities:
  - code
  - test
  - debug
  - plan
heartbeatInterval: 30000  # 30 seconds
```

### Optimization Feature Flags

```bash
# Disable message batching (for debugging)
export SWARM_BATCHING_ENABLED=false

# Disable connection pooling (for debugging)
export SWARM_POOLING_ENABLED=false
```

## Setting Up a New Worker

To add a new OpenClaw agent to the swarm:

### Step 1: Add to Agent Registry

Edit `config/agents.yaml` on griak-brain:

```yaml
agents:
  # ... existing agents ...
  - agentId: worker-4
    hostname: new-machine
    role: worker
```

### Step 2: Install on Worker Machine

```bash
# Clone the repository
git clone <repo-url> openclaw-swarm
cd openclaw-swarm

# Install dependencies
npm install
cd packages/coordination && npm install && npm run build
```

### Step 3: Create Worker Config

Create `worker-config.yaml`:

```yaml
agentId: worker-4
role: worker
brokerUrl: mqtt://griak-brain:1883
capabilities:
  - code
  - test
heartbeatInterval: 30000
```

### Step 4: Start the Agent

```bash
CONFIG_PATH=./worker-config.yaml tsx examples/basic-agent.ts
```

### Step 5: Verify Connection

Check the dashboard at `http://griak-brain:5173` - you should see `worker-4` in the agent list.

## Monitoring

### Dashboard

Access the web dashboard at `http://griak-brain:5173`

Features:
- Real-time agent status (online/offline, CPU, memory)
- Active task progress with completion percentage
- System metrics (total agents, active tasks, queue depth)
- Real-time updates via Server-Sent Events

### REST API

```bash
# Check agent status
curl http://griak-brain:3000/api/status

# List active tasks
curl http://griak-brain:3000/api/tasks

# Health check
curl http://griak-brain:3000/health

# Subscribe to real-time updates (SSE)
curl -N http://griak-brain:3000/api/events
```

### MQTT Topics (for debugging)

```bash
# Subscribe to all agent activity
mosquitto_sub -h griak-brain -t 'agent/#' -v

# Subscribe to all swarm events
mosquitto_sub -h griak-brain -t 'swarm/#' -v

# Watch a specific agent
mosquitto_sub -h griak-brain -t 'agent/worker-1/#' -v
```

## Memory Footprint

| Component | Memory Usage |
|-----------|--------------|
| Coordination layer | < 100MB |
| Dashboard | < 50MB (griak-brain only) |
| SQLite database | < 15MB |

The system is validated to run on Raspberry Pi 2B (1GB RAM).

## Troubleshooting

### Agent Not Showing in Dashboard

1. Check MQTT broker is running: `mosquitto_sub -h griak-brain -t 'swarm/agents/#' -v`
2. Verify agent ID matches registry in `config/agents.yaml`
3. Check agent logs for connection errors

### Tasks Not Being Assigned

1. Check agent capabilities match task requirements
2. Verify agent is publishing load metrics: `mosquitto_sub -h griak-brain -t 'agent/+/load' -v`
3. Check router logs for rejection/circuit breaker messages

### Dashboard Not Updating

1. Check REST API is running: `curl http://localhost:3000/health`
2. Check SSE connection in browser DevTools (Network tab)
3. Verify MQTT client is passed to createStateApi()

## Project Structure

```
openclaw-swarm/
├── packages/
│   ├── coordination/          # Core coordination library
│   │   ├── src/
│   │   │   ├── communication/ # MQTT messaging
│   │   │   ├── discovery/     # Agent registry
│   │   │   ├── delegation/    # Task routing
│   │   │   ├── state/         # SQLite database
│   │   │   ├── api/           # REST API
│   │   │   ├── lifecycle/     # Health monitoring
│   │   │   ├── checkpoint/    # State persistence
│   │   │   └── optimization/  # Batching, pooling
│   │   └── dist/              # Compiled JS
│   │
│   └── dashboard/             # Web dashboard
│       ├── index.html
│       └── src/
│           ├── main.js
│           └── components/
│
├── config/
│   └── agents.yaml            # Static agent registry
│
├── examples/
│   ├── config.yaml            # Example agent config
│   └── basic-agent.ts         # Example agent implementation
│
└── .planning/                 # Project planning docs
```

## Key Technical Details

### Serialization
- **MessagePack** for payloads > 1KB (3.5x faster than JSON)
- **JSON** for smaller messages

### State Persistence
- **SQLite** with WAL mode for concurrent access
- Checkpoints every 60 seconds (local) + 5 minutes (sync)

### Load Balancing
- Weighted scoring: 70% current load + 30% historical performance
- Circuit breaker: 3 rejections → 60s cooldown
- Exponential backoff: 2^n × 100ms, max 5s

### Optimization
- Message batching with dual triggers (time OR size)
- Hardware-aware connection pools (Pi 2B=3, Pi 5=5, Beelink=10)
- Context references for payloads > 10KB

---

*Last updated: 2026-02-23 (v1.1)*
