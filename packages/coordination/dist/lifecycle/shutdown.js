/**
 * Graceful Shutdown Handler with Task Completion
 *
 * Per RESEARCH.md "Graceful Shutdown Handler" example:
 * Agents gracefully shutdown on SIGTERM, completing current task if possible.
 * Per LIFE-03: 30-second graceful shutdown timeout.
 * Per CONTEXT.md: On SIGTERM, agents finish in-progress tasks before exiting.
 */
import { getLogger, createErrorContext } from '../errors/logger.js';
// Get logger instance for shutdown messages
const logger = getLogger('shutdown-handler');
/**
 * Graceful shutdown handler.
 *
 * Waits for pending tasks to complete before exiting.
 * Handles SIGTERM from systemd and SIGINT (Ctrl+C) for development.
 */
export class GracefulShutdown {
    config;
    isShuttingDown = false;
    pendingTasks = new Set();
    constructor(config) {
        this.config = config;
        this.setupSignalHandlers();
    }
    /**
     * Register a pending task for graceful shutdown tracking.
     * Call this when starting a task that may need time to complete.
     *
     * @param taskId - Task ID to track
     */
    registerTask(taskId) {
        this.pendingTasks.add(taskId);
    }
    /**
     * Mark a task as completed.
     * Call this when a task finishes to remove it from shutdown tracking.
     *
     * @param taskId - Task ID to complete
     */
    completeTask(taskId) {
        this.pendingTasks.delete(taskId);
    }
    /**
     * Set up signal handlers for SIGTERM and SIGINT.
     */
    setupSignalHandlers() {
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
    async shutdown(signal) {
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
            // Sync checkpoints before stopping services (Per CONTEXT.md: graceful or crash)
            if (this.config.checkpointManager) {
                try {
                    await this.config.checkpointManager.syncBeforeShutdown();
                    logger.info('Checkpoints synced before shutdown');
                }
                catch (error) {
                    const errorContext = createErrorContext(error, 'shutdown-handler', 'shutdown-sync-fail');
                    logger.error('Failed to sync checkpoints before shutdown', errorContext);
                    // Continue with shutdown despite checkpoint sync failure
                }
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
        }
        catch (error) {
            console.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    }
    /**
     * Get current pending task count.
     *
     * @returns Number of pending tasks
     */
    getPendingTaskCount() {
        return this.pendingTasks.size;
    }
}
/**
 * Factory function to create graceful shutdown handler.
 *
 * @param config - Shutdown configuration
 * @returns GracefulShutdown instance
 */
export function createGracefulShutdown(config) {
    return new GracefulShutdown(config);
}
//# sourceMappingURL=shutdown.js.map