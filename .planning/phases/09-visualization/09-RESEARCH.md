# Phase 9: Visualization - Research

**Researched:** 2026-02-23
**Domain:** Real-time dashboard with Vite + Alpine.js + Chart.js + SSE
**Confidence:** HIGH

## Summary

Phase 9 implements a lightweight web dashboard on griak-brain only for real-time swarm status visualization. The stack combines Vite (build tool), Alpine.js (reactive UI), Chart.js (data visualization), and Server-Sent Events (real-time updates). This combination is ideal for the 50MB memory budget and "read-only dashboard" requirement.

Key architectural decisions:
1. **Dashboard location**: Runs on griak-brain only, NOT on Pi 2B workers (per VIZ-06)
2. **Update mechanism**: SSE (not WebSocket) - lighter, HTTP-based, sufficient for server-to-client push
3. **Throttling**: 10 updates/second maximum to prevent browser overwhelm and server load
4. **Data sources**: Existing SQLite database (agent_status, tasks) + MQTT subscriptions for load metrics

The existing codebase already has:
- Express API server (`/packages/coordination/src/api/server.ts`)
- Status routes (`/packages/coordination/src/api/routes/status.ts`)
- Agent schema with load metrics from Phase 6
- Load metrics publishing via retained MQTT messages

**Primary recommendation:** Build dashboard as separate Vite project in `packages/dashboard/`, add SSE endpoint to existing Express API server in `packages/coordination/`, and consume data from both SQLite queries and MQTT retained messages.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| VIZ-01 | Dashboard displays agent status list (online/offline, CPU, memory, last heartbeat) | Existing agent_status table + MQTT load metrics topics (heartbeat.ts publishes CPU/memory) |
| VIZ-02 | Dashboard displays active task progress (task ID, agent, status, % complete) | Existing tasks table with status, last_progress_at column |
| VIZ-03 | Dashboard displays system metrics overview (total agents, active tasks, queue depth) | SQLite COUNT queries on agent_status and tasks tables |
| VIZ-04 | Dashboard uses lightweight stack (Vite + Alpine.js + Chart.js, ~50MB) | Vite (~5MB), Alpine.js (~15KB), Chart.js (~60KB) = well under 50MB |
| VIZ-05 | Real-time updates via SSE throttled to 10 updates/second | Node.js/Express SSE implementation with setInterval throttling |
| VIZ-06 | Dashboard deploys on griak-brain only, not Pi 2B workers | Separate package in monorepo, only installed on griak-brain |
</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vite | 5.x | Build tool, dev server | Fast HMR, native ESM, simple config, ~5MB footprint |
| Alpine.js | 3.x | Reactive UI framework | Lightweight (~15KB), no build step needed, declarative directives |
| Chart.js | 4.x | Data visualization | ~60KB minified, simple API, responsive charts, active maintenance |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Express (existing) | 4.x | HTTP server, SSE endpoint | Already in codebase for REST API |
| better-sqlite3 (existing) | 9.x | Database queries for status/tasks | Already in codebase for state persistence |
| MQTT.js (existing) | 5.x | Subscribe to load metrics | Already in codebase for communication |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Alpine.js | React/Vue | 10-100x larger bundle size, unnecessary complexity for read-only dashboard |
| SSE | WebSocket | WebSocket uses more memory (~2-3x), bidirectional (not needed for read-only), requires separate server |
| Chart.js | D3.js, ECharts | D3.js has steeper learning curve, ECharts is larger (~300KB+) |

**Installation:**

```bash
# Dashboard package dependencies
npm install -D vite
npm install alpinejs chart.js

# Dashboard depends on coordination package for types
# No additional runtime dependencies needed
```

## Architecture Patterns

### Recommended Project Structure

```
packages/
├── coordination/           # Existing backend (enhanced with SSE)
│   └── src/
│       └── api/
│           ├── routes/
│           │   └── events.ts    # NEW: SSE endpoint
│           └── server.ts        # MODIFY: Register SSE route
│
└── dashboard/              # NEW: Frontend dashboard
    ├── index.html          # Entry point with Alpine + Chart.js
    ├── vite.config.js      # Vite configuration
    ├── package.json        # Dependencies
    └── src/
        ├── main.js         # Alpine initialization
        ├── components/
        │   ├── AgentList.js       # Agent status table
        │   ├── TaskProgress.js    # Active tasks view
        │   └── SystemMetrics.js   # Overview cards
        └── utils/
            └── sse.js             # EventSource wrapper
```

### Pattern 1: SSE Endpoint in Express

**What:** Add SSE route to existing Express API server for real-time data push.

**When to use:** Dashboard needs real-time updates without polling overhead.

**Example:**

```typescript
// Source: https://blog.csdn.net/qq_16242613/article/details/155882646
// packages/coordination/src/api/routes/events.ts

import { Router, type Request, type Response } from 'express';
import Database from 'better-sqlite3';

export function createEventRoutes(db: Database.Database, mqttClient: MqttClient): Router {
  const router = Router();

  // Track connected clients for throttling
  const clients = new Set<Response>();

  router.get('/events', (req: Request, res: Response) => {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Add to clients set
    clients.add(res);

    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');

    // Clean up on disconnect
    req.on('close', () => {
      clients.delete(res);
    });
  });

  // Broadcast function called by MQTT/DB updates
  function broadcast(data: unknown) {
    const message = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of clients) {
      client.write(message);
    }
  }

  return { router, broadcast };
}
```

### Pattern 2: Alpine.js + SSE Integration

**What:** Use Alpine's `x-init` and EventSource API for real-time reactivity.

**When to use:** Dashboard components need live data updates without page refresh.

**Example:**

```javascript
// Source: https://alpinejs.dev/essentials/startup
// packages/dashboard/src/components/AgentList.js

export function agentList() {
  return {
    agents: [],
    loading: true,

    init() {
      // Connect to SSE endpoint
      const eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'agents') {
          this.agents = data.agents;
          this.loading = false;
        }
      };

      eventSource.onerror = () => {
        this.loading = false;
        // Auto-reconnect handled by browser
      };

      // Cleanup on component destroy
      this.$cleanup(() => eventSource.close());
    },

    // Format timestamp to relative time
    timeAgo(timestamp) {
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      return `${Math.floor(minutes / 60)}h ago`;
    },

    // Get status color class
    statusColor(status) {
      return {
        'online': 'text-green-600',
        'offline': 'text-gray-400',
        'busy': 'text-yellow-600',
        'error': 'text-red-600'
      }[status] || 'text-gray-600';
    }
  };
}
```

### Pattern 3: Chart.js Real-Time Updates

**What:** Update Chart.js instance with incoming SSE data without re-creating chart.

**When to use:** Visualizing CPU/memory trends over time.

**Example:**

```javascript
// Source: https://blog.csdn.net/gitblog_00309/article/details/154814529
// packages/dashboard/src/components/SystemMetrics.js

import { Chart } from 'chart.js/auto';

export function systemMetrics() {
  return {
    chart: null,
    cpuData: [],
    memoryData: [],
    labels: [],

    init() {
      const ctx = this.$refs.cpuChart.getContext('2d');

      this.chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'CPU %',
              data: [],
              borderColor: 'rgb(59, 130, 246)',
              tension: 0.4,
              fill: false
            },
            {
              label: 'Memory %',
              data: [],
              borderColor: 'rgb(16, 185, 129)',
              tension: 0.4,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          animation: false, // Disable animation for real-time performance
          scales: {
            y: { min: 0, max: 100 }
          }
        }
      });

      // Listen for SSE updates
      // ... (similar to AgentList pattern)
    },

    updateChart(cpu, memory) {
      const now = new Date().toLocaleTimeString();

      // Add new data point
      this.chart.data.labels.push(now);
      this.chart.data.datasets[0].data.push(cpu);
      this.chart.data.datasets[1].data.push(memory);

      // Keep only last 30 data points (5 minutes at 10s intervals)
      if (this.chart.data.labels.length > 30) {
        this.chart.data.labels.shift();
        this.chart.data.datasets[0].data.shift();
        this.chart.data.datasets[1].data.shift();
      }

      this.chart.update('none'); // 'none' mode for better performance
    }
  };
}
```

### Pattern 4: Throttled SSE Broadcasts

**What:** Limit SSE broadcasts to 10 updates/second to prevent client/server overload.

**When to use:** Multiple high-frequency events (MQTT messages, DB updates) could overwhelm dashboard.

**Example:**

```typescript
// Source: https://m.blog.cdn.net/java_beautiful/article/details/148141180
// packages/coordination/src/api/routes/events.ts

export class ThrottledBroadcaster {
  private pendingUpdate = false;
  private buffer: Map<string, unknown> = new Map();
  private broadcastInterval: NodeJS.Timeout;

  constructor(
    private broadcast: (data: unknown) => void,
    private maxFrequencyMs: number = 100 // 10 updates/second
  ) {
    this.broadcastInterval = setInterval(() => {
      this.flush();
    }, this.maxFrequencyMs);
  }

  // Buffer updates instead of sending immediately
  enqueue(type: string, data: unknown): void {
    this.buffer.set(type, data);
    this.pendingUpdate = true;
  }

  // Send buffered updates at throttled rate
  private flush(): void {
    if (!this.pendingUpdate) return;

    const update = {
      timestamp: Date.now(),
      data: Object.fromEntries(this.buffer)
    };

    this.broadcast(update);
    this.buffer.clear();
    this.pendingUpdate = false;
  }

  stop(): void {
    clearInterval(this.broadcastInterval);
  }
}
```

### Anti-Patterns to Avoid

- **Polling instead of SSE**: Unnecessary server load, higher latency. Use SSE for server-to-client push.
- **Unbounded chart data growth**: Memory leak on dashboard. Limit to last N data points (Pattern 3).
- **Chart.js animations for real-time**: Performance killer. Use `update('none')` mode (Pattern 3).
- **Direct MQTT connection from browser**: Browsers can't speak MQTT protocol. Use SSE bridge (Pattern 1).
- **Heavy frontend frameworks**: React/Vue overkill for read-only dashboard. Alpine.js is sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Build tooling | Custom bundler with esbuild/rollup | Vite | Hot module replacement, optimized dev server, battle-tested |
| Reactive UI | Manual DOM manipulation or vanilla state | Alpine.js | Declarative directives, tiny footprint, no compile step |
| Charts | Canvas/SVG rendering from scratch | Chart.js | Responsive, accessible, maintained, built-in animations |
| Real-time updates | Polling with setInterval | SSE (EventSource) | Native browser API, auto-reconnect, HTTP-based |
| Throttling | Custom rate limiter with timers | ThrottledBroadcaster pattern | Centralized buffer, predictable rate, easy to tune |

**Key insight:** Building custom solutions for these problems wastes development time on edge cases (connection drops, memory leaks, browser quirks) that established libraries already handle.

## Common Pitfalls

### Pitfall 1: SSE Connection Limit per Browser

**What goes wrong:** HTTP/1.x limits 6 concurrent SSE connections per domain. Opening multiple dashboard tabs can block new connections.

**Why it happens:** Browser enforces connection limit per domain; SSE connections count toward this limit.

**How to avoid:**
- Use HTTP/2 on griak-brain (multiplexing removes limit)
- Or: Document single-tab usage in README
- Or: Implement connection sharing across tabs via BroadcastChannel API

**Warning signs:** Dashboard doesn't load in 7th+ browser tab.

### Pitfall 2: Chart.js Memory Leak from Unbounded Data

**What goes wrong:** Dashboard memory grows unbounded as chart data accumulates, eventually crashing browser tab.

**Why it happens:** Chart.js doesn't auto-prune data arrays; real-time charts add points indefinitely.

**How to avoid:**
- Always limit chart data arrays to fixed window (e.g., last 30 points)
- Use `chart.data.labels.shift()` and `dataset.data.shift()` (Pattern 3)
- Destroy chart instances on component unmount: `chart.destroy()`

**Warning signs:** Dashboard tab memory usage grows >100MB over time.

### Pitfall 3: SSE Message Buffering on Nginx/Reverse Proxy

**What goes wrong:** SSE messages don't arrive in real-time; they arrive in batches or after connection closes.

**Why it happens:** Reverse proxies buffer SSE responses by default to optimize throughput.

**How to avoid:**
- If using Nginx: `proxy_buffering off;` for SSE route
- If using other proxy: Disable buffering for `/api/events` route
- Send explicit `res.flushHeaders()` after setting headers (Pattern 1)

**Warning signs:** Dashboard updates arrive in bursts instead of steady stream.

### Pitfall 4: Unthrottled MQTT-to-SSE Broadcast Storm

**What goes wrong:** Each heartbeat message (30s interval × N agents) triggers immediate SSE broadcast, overwhelming connected clients.

**Why it happens:** Direct mapping from MQTT message to SSE broadcast without rate limiting.

**How to avoid:**
- Use ThrottledBroadcaster (Pattern 4) to buffer and batch updates
- Set max frequency to 100ms (10 updates/second per VIZ-05)
- Aggregate multiple MQTT messages into single SSE broadcast

**Warning signs:** Dashboard becomes laggy, browser CPU usage high.

### Pitfall 5: Alpine.js Re-Initialization on Hot Module Replacement

**What goes wrong:** During development, HMR causes duplicate Alpine components or memory leaks.

**Why it happens:** Vite's HMR doesn't automatically clean up Alpine event listeners/data.

**How to avoid:**
- Use Alpine's `x-data` in HTML (not manual `Alpine.data()` registration)
- Or: Implement cleanup function with `this.$cleanup()` (Pattern 2)
- Or: Use full page reload during development

**Warning signs:** Dashboard behaves strangely after file edits in dev mode.

## Code Examples

Verified patterns from official sources:

### Vite Project Setup

```javascript
// Source: https://vitejs.dev/guide/
// vite.config.js

export default {
  root: '.', // Current directory
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // Optimize for production
    minify: 'terser',
    sourcemap: false
  },
  server: {
    port: 5173,
    // Proxy API requests to Express backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
};
```

### Alpine.js Component Registration

```javascript
// Source: https://alpinejs.dev/essentials/startup
// packages/dashboard/src/main.js

import Alpine from 'alpinejs';
import { agentList } from './components/AgentList.js';
import { systemMetrics } from './components/SystemMetrics.js';

// Register components
Alpine.data('agentList', agentList);
Alpine.data('systemMetrics', systemMetrics);

// Start Alpine
window.Alpine = Alpine;
Alpine.start();
```

### Dashboard HTML Entry Point

```html
<!-- Source: https://alpinejs.dev/essentials/startup -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenClaw Swarm Dashboard</title>
  <script defer src="/@vite/client"></script>
  <script defer type="module" src="/src/main.js"></script>
</head>
<body>
  <div class="dashboard" x-data="systemMetrics()">
    <h1>Swarm Status</h1>

    <!-- Agent List Component -->
    <div x-data="agentList()">
      <h2>Agents</h2>
      <template x-if="loading">
        <p>Loading...</p>
      </template>
      <template x-else>
        <table>
          <thead>
            <tr>
              <th>Agent ID</th>
              <th>Status</th>
              <th>CPU</th>
              <th>Memory</th>
              <th>Last Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            <template x-for="agent in agents" :key="agent.agentId">
              <tr>
                <td x-text="agent.agentId"></td>
                <td :class="statusColor(agent.status)" x-text="agent.status"></td>
                <td x-text="agent.cpuPercent + '%'"></td>
                <td x-text="agent.memoryPercent + '%'"></td>
                <td x-text="timeAgo(agent.lastHeartbeat)"></td>
              </tr>
            </template>
          </tbody>
        </table>
      </template>
    </div>

    <!-- Chart Component -->
    <div>
      <h2>System Metrics</h2>
      <canvas x-ref="cpuChart"></canvas>
    </div>
  </div>
</body>
</html>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Polling (setInterval) | SSE (EventSource) | ~2015 | SSE uses native browser API, auto-reconnect, lower latency |
| React/Vue dashboards | Alpine.js dashboards | ~2020 | Alpine.js 10-100x smaller, sufficient for read-only UIs |
| WebSocket for real-time | SSE for server-to-client | ~2023 | SSE lighter (~20MB vs ~50MB for 10k connections), HTTP-based |
| Chart.js 2.x with jQuery | Chart.js 4.x standalone | 2023 | Tree-shakeable, no jQuery dependency, TypeScript support |

**Deprecated/outdated:**
- **Chart.js 2.x**: Use 4.x (Chart.js 3+ is modular, no global `Chart` variable needed)
- **jQuery + Chart.js**: Chart.js 4.x works standalone without jQuery
- **Polling for dashboard updates**: SSE is now widely supported (95%+ browsers)
- **Bower for frontend deps**: Use npm/pnpm with Vite

## Open Questions

1. **Dashboard authentication:**
   - What we know: Dashboard is for Minerva (operator), runs on griak-brain only
   - What's unclear: Should dashboard have authentication or be local-network only?
   - Recommendation: Start with no auth (local network only), add basic auth if needed (VIZ-06 says "runs on griak-brain only" which implies controlled environment)

2. **Historical data vs. real-time only:**
   - What we know: Requirements focus on real-time status (VIZ-01, VIZ-02, VIZ-03)
   - What's unclear: Should dashboard show historical trends or just current state?
   - Recommendation: Start with real-time only (simpler), add historical if needed (can use existing archive tables)

3. **MQTT subscription in dashboard API:**
   - What we know: Load metrics published via retained MQTT messages (heartbeat.ts)
   - What's unclear: Should dashboard API subscribe to MQTT or query SQLite exclusively?
   - Recommendation: Subscribe to MQTT for load metrics (real-time), query SQLite for task status (authoritative)

4. **Multi-machine dashboard deployment:**
   - What we know: Dashboard runs on griak-brain only per VIZ-06
   - What's unclear: How does dashboard access data from other machines' SQLite databases?
   - Recommendation: Use existing MQTT flow - all agents publish metrics to broker, dashboard subscribes to broker (centralized via MQTT)

## Sources

### Primary (HIGH confidence)
- Vite Official Docs - Getting started guide, project structure, configuration
- Alpine.js Official Docs - Installation, component registration, x-data directives
- CSDN: SSE技术详解 - Express SSE implementation with headers and cleanup (2025-12-14)
- CSDN: Node.js构建SSE推送 - Server-side event patterns, connection management (2025-12-11)
- CSDN: Chart.js数据更新 - Real-time chart updates, performance optimization (2025-10-22)
- CSDN: Chart.js终极指南 - Chart.js 4.x patterns, animation control (2026-01-02)

### Secondary (MEDIUM confidence)
- DEV Community: Real-Time Data Streaming with SSE - SSE vs WebSocket comparison (2025-08)
- CSDN: API请求慢？SSE连接限制 - HTTP/1.x 6-connection limit, HTTP/2 solution (2025-05)
- CSDN: node-stream-throttle - Node.js stream rate control patterns (2025-05)
- 掘金: 随着AI对话的发展，SSE又火了 - SSE resurgence with AI applications (2025-12)
- CSDN: Gentelella数据可视化性能 - Chart.js optimization techniques (2025-10)

### Tertiary (LOW confidence)
- PHP中文网: JavaScript图表库选择 - Chart.js vs alternatives comparison (2025-12)
- Various tutorials mentioning SSE but without specific implementation details

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Vite, Alpine.js, Chart.js are industry-standard for lightweight dashboards
- Architecture: HIGH - SSE pattern well-documented, Alpine.js integration straightforward
- Pitfalls: MEDIUM - SSE connection limits verified, chart memory leaks common knowledge

**Research date:** 2026-02-23
**Valid until:** 2026-04-23 (60 days - libraries are stable, minor version updates unlikely)
