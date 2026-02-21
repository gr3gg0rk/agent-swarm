/**
 * Lifecycle module exports
 * Re-exports all lifecycle management types and functions.
 */

// Heartbeat
export {
  HeartbeatPublisher,
  HeartbeatTracker,
  createHeartbeatPublisher,
  createHeartbeatTracker,
  type HeartbeatConfig,
  type AgentHeartbeat,
} from './heartbeat.js';
