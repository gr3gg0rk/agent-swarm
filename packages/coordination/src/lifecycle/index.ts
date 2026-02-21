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

// Supervisor
export {
  generateSystemdService,
  installSystemdService,
  INSTALL_INSTRUCTIONS,
  SYSTEMD_TEMPLATE,
  type SupervisorConfig,
} from './supervisor.js';

// Shutdown
export {
  GracefulShutdown,
  createGracefulShutdown,
  type ShutdownConfig,
} from './shutdown.js';
