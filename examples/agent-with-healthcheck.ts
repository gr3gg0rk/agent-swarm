/**
 * Agent with Health Check Example
 *
 * Demonstrates all Phase 2 features:
 * - Heartbeat publishing with status changes (idle -> busy -> idle)
 * - Health check server with HTTP /health endpoint
 * - Database connectivity check (if database path provided)
 * - MQTT connection check
 * - Graceful shutdown with task completion
 * - Idempotency tracking
 * - Agent discovery with registration
 *
 * Run with: tsx examples/agent-with-healthcheck.ts
 *
 * Health check: curl http://localhost:3001/health
 *
 * Port allocation:
 * - minerva: 3001
 * - worker-1: 3002
 * - worker-2: 3003
 * - worker-3: 3004
 */

import { readFile } from 'node:fs/promises';
import type {
  BrokerConfig,
  MessageEnvelope,
  AgentRegistration,
} from '@openclaw-swarm/coordination';
import {
  connectToBroker,
  Topics,
  AgentDiscovery,
  createAgentDiscovery,
  IdempotencyTracker,
  getLogger,
  createErrorContext,
  HeartbeatPublisher,
  createHeartbeatPublisher,
  HealthCheckServer,
  createHealthCheckServer,
  GracefulShutdown,
  createGracefulShutdown,
} from '@openclaw-swarm/coordination';

/**
 * Agent configuration interface.
 */
interface AgentConfig {
  agentId: string;
  role: 'orchestrator' | 'worker';
  brokerUrl: string;
  capabilities: string[];
  heartbeatInterval: number;
  healthCheckPort: number;
  databasePath?: string;
}

/**
 * Simple YAML config parser for example purposes.
 */
async function loadConfig(configPath: string): Promise<AgentConfig> {
  const content = await readFile(configPath, 'utf-8');
  const lines = content.split('\n');

  const config: Partial<AgentConfig> = {
    capabilities: [],
    heartbeatInterval: 30000,
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || trimmed === '') continue;

    const [key, ...valueParts] = trimmed.split(':');
    const value = valueParts.join(':').trim();

    switch (key) {
      case 'agentId':
        config.agentId = value;
        break;
      case 'role':
        config.role = value as 'orchestrator' | 'worker';
        break;
      case 'brokerUrl':
        config.brokerUrl = value;
        break;
      case 'heartbeatInterval':
        config.heartbeatInterval = parseInt(value, 10);
        break;
      case 'capabilities':
      case 'databasePath':
        // Skip these keys, handle below
        break;
      default:
        if (value.startsWith('- ')) {
          config.capabilities?.push(value.substring(2));
        } else if (key === 'databasePath') {
          config.databasePath = value;
        }
        break;
    }
  }

  // Auto-assign health check port based on agent ID
  if (config.agentId === 'minerva') {
    config.healthCheckPort = 3001;
  } else if (config.agentId === 'worker-1') {
    config.healthCheckPort = 3002;
  } else if (config.agentId === 'worker-2') {
    config.healthCheckPort = 3003;
  } else if (config.agentId === 'worker-3') {
    config.healthCheckPort = 3004;
  } else {
    // Default to 3001 for unknown agents
    config.healthCheckPort = 3001;
  }

  return config as AgentConfig;
}

/**
 * Agent implementation with Phase 2 features.
 */
class AgentWithHealthCheck {
  private config: AgentConfig;
  private mqttClient: Awaited<ReturnType<typeof connectToBroker>>;
  private discovery: AgentDiscovery;
  private idempotency: IdempotencyTracker;
  private heartbeatPublisher: HeartbeatPublisher;
  private healthCheckServer: HealthCheckServer;
  private gracefulShutdown: GracefulShutdown;
  private logger = getLogger();
  private isProcessingTask = false;

  constructor(config: AgentConfig, mqttClient: Awaited<ReturnType<typeof connectToBroker>>) {
    this.config = config;
    this.mqttClient = mqttClient;
    this.discovery = new AgentDiscovery(mqttClient);
    this.idempotency = new IdempotencyTracker();

    // Update logger with agent ID
    this.logger = getLogger(config.agentId);

    // Create heartbeat publisher
    this.heartbeatPublisher = createHeartbeatPublisher({
      agentId: config.agentId,
      interval: config.heartbeatInterval,
      mqttClient: mqttClient,
    });

    // Create health check server
    this.healthCheckServer = createHealthCheckServer({
      port: config.healthCheckPort,
      agentId: config.agentId,
      mqttClient: mqttClient,
      heartbeatPublisher: this.heartbeatPublisher,
      // Database would be added if databasePath is provided
      // database: db,
    });

    // Create graceful shutdown handler
    // Note: healthCheckServer needs to be stopped separately
    // since GracefulShutdown doesn't support it directly
    this.gracefulShutdown = createGracefulShutdown({
      mqttClient: mqttClient,
      agentDiscovery: this.discovery,
      heartbeatPublisher: this.heartbeatPublisher,
      gracefulShutdownTimeout: 30000, // 30 seconds
    });
  }

  /**
   * Initialize the agent: connect to broker, register, subscribe to topics.
   */
  async start(): Promise<void> {
    this.logger.info('Agent starting', { agentId: this.config.agentId });

    // Subscribe to command channel
    const commandTopic = Topics.agentCommand(this.config.agentId);
    await this.mqttClient.subscribe(commandTopic, 1);
    this.logger.info('Subscribed to command channel', { topic: commandTopic });

    // Subscribe to discovery topics
    await this.mqttClient.subscribe('swarm/agents/#', 1);
    this.logger.info('Subscribed to discovery topics');

    // Register agent with swarm
    await this.register();

    // Set up message handler
    this.mqttClient.on('message', async (envelope, topic) => {
      await this.handleMessage(envelope, topic);
    });

    // Start heartbeat publisher
    this.heartbeatPublisher.start();
    this.logger.info('Heartbeat publisher started', {
      interval: this.config.heartbeatInterval,
    });

    // Start health check server
    this.healthCheckServer.start();
    this.logger.info('Health check server started', {
      port: this.config.healthCheckPort,
      url: `http://localhost:${this.config.healthCheckPort}/health`,
    });

    this.logger.info('Graceful shutdown handlers registered (auto-setup via GracefulShutdown)');

    this.logger.info('Agent started successfully', {
      agentId: this.config.agentId,
      role: this.config.role,
      healthCheckUrl: `http://localhost:${this.config.healthCheckPort}/health`,
    });
  }

  /**
   * Register agent with the swarm (DISC-01).
   */
  async register(): Promise<void> {
    const registration: AgentRegistration = {
      agentId: this.config.agentId,
      role: this.config.role,
      capabilities: this.config.capabilities,
      hostname: process.env.HOSTNAME || 'localhost',
      version: '0.2.0',
      startedAt: Date.now(),
    };

    await this.discovery.registerAgent(registration);
    this.logger.info('Agent registered', { registration });
  }

  /**
   * Handle incoming message with idempotency check (COMM-04).
   */
  async handleMessage(envelope: MessageEnvelope, topic: string): Promise<void> {
    // Check idempotency - skip if already processed
    if (!this.idempotency.shouldProcess(envelope)) {
      this.logger.debug('Duplicate message discarded', {
        idempotencyKey: envelope.idempotencyKey,
        messageId: envelope.messageId,
      });
      return;
    }

    this.logger.info('Received message', {
      type: envelope.type,
      from: envelope.from,
      topic,
    });

    try {
      switch (envelope.type) {
        case 'task':
          await this.handleTask(envelope);
          break;
        case 'heartbeat':
          this.logger.debug('Heartbeat received', { from: envelope.from });
          break;
        case 'status':
          this.logger.info('Status update', {
            from: envelope.from,
            payload: envelope.payload,
          });
          break;
        default:
          this.logger.debug('Unhandled message type', { type: envelope.type });
      }
    } catch (error) {
      const errorContext = createErrorContext(
        error,
        this.config.agentId,
        envelope.messageId,
        (envelope.payload as { taskId?: string })?.taskId
      );
      this.logger.error('Message handling failed', errorContext);
    }
  }

  /**
   * Handle task message (COMM-02: directed messaging).
   * Demonstrates status changes: idle -> busy -> idle.
   */
  async handleTask(envelope: MessageEnvelope): Promise<void> {
    this.logger.info('Processing task', { payload: envelope.payload });

    // Update status to busy
    this.isProcessingTask = true;
    this.heartbeatPublisher.setStatus('busy');

    try {
      // Simulate task processing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send result back to sender
      if (envelope.from) {
        const resultEnvelope: MessageEnvelope = {
          messageId: crypto.randomUUID(),
          idempotencyKey: crypto.randomUUID(),
          correlationId: envelope.messageId,
          from: this.config.agentId,
          to: envelope.from,
          type: 'result',
          timestamp: Date.now(),
          payload: {
            status: 'completed',
            result: 'Task processed successfully',
          },
          qos: 1, // COMM-06: QoS 1 for task results
        };

        const resultTopic = Topics.agentResult(envelope.from);
        await this.mqttClient.publish(resultTopic, resultEnvelope);
        this.logger.info('Result sent', { to: envelope.from });
      }
    } finally {
      // Update status back to idle
      this.isProcessingTask = false;
      this.heartbeatPublisher.setStatus('idle');
    }
  }

  /**
   * Send message to specific agent by ID (COMM-02).
   */
  async sendMessageToAgent(targetAgentId: string, payload: unknown): Promise<void> {
    const envelope: MessageEnvelope = {
      messageId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      from: this.config.agentId,
      to: targetAgentId,
      type: 'task',
      timestamp: Date.now(),
      payload,
      qos: 1, // COMM-06: QoS 1 for tasks
    };

    const topic = Topics.agentCommand(targetAgentId);
    await this.mqttClient.publish(topic, envelope);
    this.logger.info('Message sent to agent', { to: targetAgentId, type: envelope.type });
  }

  /**
   * Broadcast status to all interested parties (COMM-03).
   */
  async broadcastStatus(status: unknown): Promise<void> {
    const envelope: MessageEnvelope = {
      messageId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      from: this.config.agentId,
      type: 'status',
      timestamp: Date.now(),
      payload: status,
      qos: 0, // COMM-07: QoS 0 for non-critical status
      retain: false,
    };

    const topic = Topics.swarmStatus;
    await this.mqttClient.publish(topic, envelope);
    this.logger.info('Status broadcasted', { topic });
  }

  /**
   * Stop the agent gracefully.
   * Note: GracefulShutdown handles SIGTERM/SIGINT automatically.
   * This method is for manual shutdown or testing.
   */
  async stop(): Promise<void> {
    this.logger.info('Agent stopping', { agentId: this.config.agentId });

    // Stop idempotency tracker
    this.idempotency.stop();

    // Stop health check server
    await this.healthCheckServer.stop();

    // Note: GracefulShutdown handles signal-based shutdown automatically
    // For manual stop, we would need to call the private methods directly
    // or send SIGTERM to ourselves: process.kill(process.pid, 'SIGTERM')

    this.logger.info('Agent stopped (manual shutdown)');
  }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const configPath = process.env.CONFIG_PATH || '/home/gr3gg0rk/openclaw-swarm/examples/config.yaml';
  const config = await loadConfig(configPath);

  const brokerConfig: BrokerConfig = {
    brokerUrl: config.brokerUrl,
    clientId: config.agentId,
  };

  const mqttClient = await connectToBroker(brokerConfig);
  const agent = new AgentWithHealthCheck(config, mqttClient);

  await agent.start();

  // Keep process alive
  process.on('uncaughtException', (error) => {
    const errorContext = createErrorContext(error, config.agentId, 'unknown');
    getLogger().error('Uncaught exception', errorContext);
  });

  // Log helpful information
  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║                    Agent with Health Check                       ║
╠═══════════════════════════════════════════════════════════════════╣
║  Agent ID: ${config.agentId.padEnd(52)}║
║  Role: ${config.role.padEnd(56)}║
║  Health Check: http://localhost:${config.healthCheckPort.toString().padEnd(40)}║
╠═══════════════════════════════════════════════════════════════════╣
║  Test health endpoint:                                            ║
║    curl http://localhost:${config.healthCheckPort}/health                       ║
║                                                                   ║
║  Expected response (healthy):                                     ║
║    {                                                              ║
║      "status": "healthy",                                         ║
║      "agentId": "${config.agentId}",                                       ║
║      "timestamp": "2026-02-21T...",                               ║
║      "checks": {                                                  ║
║        "database": "skipped",                                     ║
║        "mqtt": "connected",                                       ║
║        "heartbeat": "publishing"                                  ║
║      }                                                            ║
║    }                                                              ║
╚═══════════════════════════════════════════════════════════════════╝
  `);
}

main().catch((error) => {
  console.error('Failed to start agent:', error);
  process.exit(1);
});
