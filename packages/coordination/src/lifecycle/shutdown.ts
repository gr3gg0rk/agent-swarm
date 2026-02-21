/**
 * Graceful Shutdown Handler with Task Completion
 *
 * Per RESEARCH.md "Graceful Shutdown Handler" example:
 * Agents gracefully shutdown on SIGTERM, completing current task if possible.
 * Per LIFE-03: 30-second graceful shutdown timeout.
 * Per CONTEXT.md: On SIGTERM, agents finish in-progress tasks before exiting.
 */

import type { MqttClientMinimal } from '../discovery/registry.js';
import type { AgentDiscovery } from '../discovery/registry.js';
import type { HeartbeatPublisher } from './heartbeat.js';
import { getLogger } from '../errors/logger.js';

// Get logger instance for shutdown messages
const logger = getLogger('shutdown-handler');

/**
 * Configuration for graceful shutdown handler.
 */
export interface ShutdownConfig {
  /** Optional MQTT client to disconnect on shutdown */
  mqttClient?: MqttClientMinimal;
  /** Optional agent discovery to unregister on shutdown */
  agentDiscovery?: AgentDiscovery;
  /** Optional heartbeat publisher to stop on shutdown */
  heartbeatPublisher?: HeartbeatPublisher;
  /** Graceful shutdown timeout in milliseconds (30 seconds per systemd) */
  gracefulShutdownTimeout: number;
}

/**
 * Graceful shutdown handler.
 *
 * Waits for pending tasks to complete before exiting.
 * Handles SIGTERM from systemd and SIGINT (Ctrl+C) for development.
 */
export class GracefulShutdown {
  private isShuttingDown = false;
  private pendingTasks = new Set<string>();

  constructor(private config: ShutdownConfig) {
    this.setupSignalHandlers();
  }

  /**
   * Register a pending task for graceful shutdown tracking.
   * Call this when starting a task that may need time to complete.
   *
   * @param taskId - Task ID to track
   */
  registerTask(taskId: string): void {
    this.pendingTasks.add(taskId);
  }

  /**
   * Mark a task as completed.
   * Call this when a task finishes to remove it from shutdown tracking.
   *
   * @param taskId - Task ID to complete
   */
  completeTask(taskId: string): void {
    this.pendingTasks.delete(taskId);
  }

  /**
   * Set up signal handlers for SIGTERM and SIGINT.
   */
  private setupSignalHandlers(): void {
    process.on('SIGTERM', () => this.shutdown('SIGTERM'));
    process.on('SIGINT', () => this.shutdown('SIGINT'));
  }

  /**
   * Initiate graceful shutdown.
   *
   * Waits for pending tasks to complete (up to timeout).
   * Stops heartbeat publisher, unregisters agent, disconnects MQTT.
   *
   * @param signal - Signal that triggered shutdown
   */
  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info('Received shutdown signal', { event: 'shutdown_initiated', signal });

    try {
      // Wait for pending tasks to complete (up to timeout)
      const startTime = Date.now();
      while (this.pendingTasks.size > 0) {
        const elapsed = Date.now() - startTime;
        if (elapsed >= this.config.gracefulShutdownTimeout) {
          logger.info('Graceful shutdown timeout, forcing exit', { pendingTasks: this.pendingTasks.size });
          break;
        }
        logger.info('Waiting for tasks to complete', { pending_tasks: this.pendingTasks.size });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Stop heartbeat publisher
      if (this.config.heartbeatPublisher) {
        this.config.heartbeatPublisher.stop();
        logger.info('Heartbeat publisher stopped');
      }

      // Unregister agent (clear retained message)
      if (this.config.agentDiscovery) {
        // Get agent ID from discovery or use fallback
        const agentId = 'unknown'; // Will need to be passed in config or retrieved
        await this.config.agentDiscovery.unregisterAgent(agentId);
        logger.info('Agent unregistered from discovery', { agentId });
      }

      // Disconnect MQTT
      if (this.config.mqttClient) {
        await this.config.mqttClient.end();
        logger.info('MQTT client disconnected');
      }

      logger.info('Graceful shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }

  /**
   * Get current pending task count.
   *
   * @returns Number of pending tasks
   */
  getPendingTaskCount(): number {
    return this.pendingTasks.size;
  }
}

/**
 * Factory function to create graceful shutdown handler.
 *
 * @param config - Shutdown configuration
 * @returns GracefulShutdown instance
 */
export function createGracefulShutdown(config: ShutdownConfig): GracefulShutdown {
  return new GracefulShutdown(config);
}
