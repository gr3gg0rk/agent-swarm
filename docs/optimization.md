# Optimization Features

This document describes the optimization features available in OpenClaw Swarm coordination layer for improved throughput and performance.

## Overview

OpenClaw Swarm provides two key optimization features for production deployments:

1. **Message Batching** - Buffers high-frequency messages and publishes them in batches
2. **Connection Pooling** - Reuses MQTT connections to reduce TCP handshake overhead

Both features are **enabled by default** for production use and can be disabled via environment variables for debugging.

## Activation

Optimization features are activated during agent initialization using environment variables:

```typescript
import { loadOptimizationConfig, MessageBatcher, ConnectionPoolManager } from '@openclaw-swarm/coordination';

const optConfig = loadOptimizationConfig();

// Activate connection pooling if enabled
if (optConfig.poolingEnabled) {
  const pool = new ConnectionPoolManager({
    brokerUrl: 'mqtt://localhost:1883',
    options: { clientId: 'my-agent' }
  });
  mqttClient.setConnectionPool(pool);
}

// Activate message batching if enabled
if (optConfig.batchingEnabled) {
  const batcher = new MessageBatcher(mqttClient);
  mqttClient.setBatchPublisher(batcher);
}
```

## Environment Variables

### SWARM_BATCHING_ENABLED

Controls whether message batching is enabled for high-frequency messages.

- **Type:** Boolean (string)
- **Default:** `true` (enabled)
- **Values:** `true` or `false` (any value other than `false` is treated as `true`)

**Description:** When enabled, high-frequency messages (progress updates, status changes, heartbeats) are buffered and published in batches. This reduces MQTT broker load and improves throughput by ~10x for high-volume scenarios.

**Batch thresholds:**
- Tasks: 10ms OR 50 messages
- Status: 50ms OR 100 messages
- Heartbeats: 100ms OR 20 messages

**Example (disable for debugging):**
```bash
export SWARM_BATCHING_ENABLED=false
```

### SWARM_POOLING_ENABLED

Controls whether MQTT connection pooling is enabled.

- **Type:** Boolean (string)
- **Default:** `true` (enabled)
- **Values:** `true` or `false` (any value other than `false` is treated as `true`)

**Description:** When enabled, MQTT connections are reused from a pool instead of creating new connections for each operation. Connection pool sizes are hardware-aware:

- Raspberry Pi 2B: 3 connections (1GB RAM)
- Raspberry Pi 5: 5 connections (4-8GB RAM)
- Beelink/PC: 10 connections (>8GB RAM)
- Default: 5 connections

**Example (disable for debugging):**
```bash
export SWARM_POOLING_ENABLED=false
```

## Configuration

### Custom Batch Configuration

You can customize batch thresholds by passing a `BatchConfig` to `MessageBatcher`:

```typescript
import { MessageBatcher, type BatchConfig } from '@openclaw-swarm/coordination';

const customConfig: BatchConfig = {
  tasks: { windowMs: 5, maxSize: 100 },    // Faster batching, larger buffer
  status: { windowMs: 100, maxSize: 200 },  // Slower batching, larger buffer
  heartbeats: { windowMs: 200, maxSize: 10 }
};

const batcher = new MessageBatcher(mqttClient, customConfig);
```

### Custom Pool Configuration

You can customize pool behavior by passing a `PoolConfig` to `ConnectionPoolManager`:

```typescript
import { ConnectionPoolManager, type HardwareProfile } from '@openclaw-swarm/coordination';

const customProfile: HardwareProfile = {
  maxConnections: 8,
  healthCheckInterval: 60000,  // Check every 60 seconds
  idleTimeout: 300000           // Close idle connections after 5 minutes
};

const pool = new ConnectionPoolManager({
  brokerUrl: 'mqtt://localhost:1883',
  options: { clientId: 'my-agent' },
  profile: customProfile
});
```

## Debugging

### Disabling Optimizations

To disable optimizations for debugging, set environment variables before starting the agent:

```bash
# Disable both optimizations
export SWARM_BATCHING_ENABLED=false
export SWARM_POOLING_ENABLED=false

# Run agent
tsx examples/basic-agent.ts
```

### Verifying Optimization Status

When optimizations are enabled, you'll see console log messages:

```
[Optimization] Connection pooling enabled
[Optimization] Message batching enabled
```

When disabled:
```
[Optimization] Connection pooling disabled
[Optimization] Message batching disabled
```

### Isolating Issues

To isolate issues to a specific optimization:

```bash
# Disable only batching (keep pooling)
export SWARM_BATCHING_ENABLED=false
# SWARM_POOLING_ENABLED is not set, so pooling stays enabled

# Disable only pooling (keep batching)
export SWARM_POOLING_ENABLED=false
# SWARM_BATCHING_ENABLED is not set, so batching stays enabled
```

## Performance

Expected performance improvements when optimizations are enabled:

| Feature | Improvement | Use Case |
|---------|-------------|----------|
| Message Batching | ~10x throughput | High-frequency messages (heartbeats, progress updates) |
| Connection Pooling | ~5x connection latency | Frequent publish operations |

**Note:** Task assignment messages (`type: 'task'`) bypass batching entirely for low latency, even when batching is enabled.

## Graceful Degradation

Optimization failures do not break core messaging:

- **Batcher failure:** Falls back to direct `MqttClient.publish()`
- **Pool failure:** Falls back to direct MQTT connection
- **Shutdown:** Batcher automatically flushes pending messages on `MqttClient.end()`

## See Also

- [Phase 7 Plan 1 Summary](../.planning/phases/07-optimization/07-01-SUMMARY.md) - Message batching implementation
- [Phase 7 Plan 2 Summary](../.planning/phases/07-optimization/07-02-SUMMARY.md) - Connection pooling implementation
- [Basic Agent Example](../examples/basic-agent.ts) - Full agent implementation with optimizations
