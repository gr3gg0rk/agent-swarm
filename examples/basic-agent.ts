/**
 * Basic Agent Example
 *
 * Demonstrates all Phase 1 features:
 * - Discovery (COMM-01, DISC-01)
 * - Directed messaging (COMM-02)
 * - Broadcasting (COMM-03)
 * - Idempotency (COMM-04)
 * - QoS levels (COMM-06, COMM-07)
 * - Error logging (ERRO-03)
 * - MessagePack for large payloads (HARD-05)
 *
 * Run with: tsx examples/basic-agent.ts
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
} from '@openclaw-swarm/coordination';

/**
 * Simple YAML config parser for example purposes.
 */
interface AgentConfig {
  agentId: string;
  role: 'orchestrator' | 'worker';
  brokerUrl: string;
  capabilities: string[];
  heartbeatInterval: number;
}

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
        // Skip the capabilities key itself
        break;
      default:
        if (value.startsWith('- ')) {
          config.capabilities?.push(value.substring(2));
        }
        break;
    }
  }

  return config as AgentConfig;
}

/**
 * Basic agent implementation demonstrating Phase 1 features.
 */
class BasicAgent {
  private config: AgentConfig;
  private mqttClient: Awaited<ReturnType<typeof connectToBroker>>;
  private discovery: AgentDiscovery;
  private idempotency: IdempotencyTracker;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private logger = getLogger();

  constructor(config: AgentConfig, mqttClient: Awaited<ReturnType<typeof connectToBroker>>) {
    this.config = config;
    this.mqttClient = mqttClient;
    this.discovery = new AgentDiscovery(mqttClient);
    this.idempotency = new IdempotencyTracker();

    // Update logger with agent ID
    this.logger = getLogger(config.agentId);
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

    // Start heartbeat (COMM-07: QoS 0 for heartbeats)
    this.startHeartbeat();

    this.logger.info('Agent started successfully', {
      agentId: this.config.agentId,
      role: this.config.role,
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
      version: '0.1.0',
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
   */
  async handleTask(envelope: MessageEnvelope): Promise<void> {
    this.logger.info('Processing task', { payload: envelope.payload });

    // Simulate task processing
    await new Promise(resolve => setTimeout(resolve, 1000));

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
   * Start heartbeat timer (COMM-07: 30 second interval, QoS 0).
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(async () => {
      const envelope: MessageEnvelope = {
        messageId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        from: this.config.agentId,
        type: 'heartbeat',
        timestamp: Date.now(),
        payload: {
          agentId: this.config.agentId,
          role: this.config.role,
          uptime: process.uptime(),
        },
        qos: 0, // COMM-07: QoS 0 for heartbeats
      };

      await this.mqttClient.publish(Topics.swarmStatus, envelope);
    }, this.config.heartbeatInterval);

    // Don't block process exit
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }
  }

  /**
   * Graceful shutdown - unregister and disconnect.
   */
  async stop(): Promise<void> {
    this.logger.info('Agent stopping', { agentId: this.config.agentId });

    // Stop heartbeat
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Unregister from swarm
    await this.discovery.unregisterAgent(this.config.agentId);
    this.logger.info('Agent unregistered');

    // Stop idempotency tracker
    this.idempotency.stop();

    // Disconnect from broker
    await this.mqttClient.end();
    this.logger.info('Agent stopped');
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
  const agent = new BasicAgent(config, mqttClient);

  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await agent.stop();
    process.exit(0);
  });

  await agent.start();

  // Keep process alive
  process.on('uncaughtException', (error) => {
    const errorContext = createErrorContext(error, config.agentId, 'unknown');
    getLogger().error('Uncaught exception', errorContext);
  });
}

main().catch((error) => {
  console.error('Failed to start agent:', error);
  process.exit(1);
});
