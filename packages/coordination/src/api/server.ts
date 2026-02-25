/**
 * REST API Server for State Service
 *
 * Express server providing HTTP endpoints for task queue, agent status,
 * and project context access. Wraps SQLite database operations.
 *
 * Per RESEARCH.md "REST API Endpoints" section, CONTEXT.md "Database Access".
 */

import express, { type Application } from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import { createTaskRoutes } from './routes/tasks.js';
import { createStatusRoutes } from './routes/status.js';
import { createContextRoutes } from './routes/context.js';
import { createExtendedHealthRoute } from './routes/health.js';
import { createEventRoutes } from './routes/events.js';
import { createTaskQueue } from '../state/task-queue.js';
import { createContextStore } from '../state/context.js';
import type { MqttClient } from '../communication/mqtt.js';

/**
 * Server configuration options.
 */
export interface ServerConfig {
  /** HTTP port for the state API (default: 3000) */
  port: number;
  /** Path to the SQLite database file */
  dbPath: string;
  /** Enable CORS for local network access (default: true) */
  corsEnabled?: boolean;
  /** Allowed CORS origins (default: all localhost) */
  corsOrigins?: string[];
  /** MQTT client for SSE load metrics subscription (optional) */
  mqttClient?: MqttClient;
}

/**
 * Creates the Express application with all routes registered.
 *
 * @param db - Database instance
 * @param mqttClient - Optional MQTT client for SSE load metrics subscription
 * @returns Configured Express application
 *
 * @example
 * ```ts
 * const db = createDatabase({ dbPath: '/var/lib/openclaw-swarm/state.db' });
 * const app = createStateApi(db);
 * ```
 */
export function createStateApi(db: Database.Database, mqttClient?: MqttClient): Application {
  const app = express();

  // JSON middleware for request body parsing
  app.use(express.json());

  // Create state manager instances
  const taskQueue = createTaskQueue(db);
  const contextStore = createContextStore(db);

  // Register routes
  app.use('/', createExtendedHealthRoute(db, mqttClient));
  app.use('/api', createTaskRoutes(taskQueue));
  app.use('/api', createStatusRoutes(db));
  app.use('/api', createContextRoutes(contextStore));

  // Register SSE event routes if mqttClient provided
  if (mqttClient) {
    const { router: eventRoutes } = createEventRoutes(db, mqttClient);
    app.use('/api', eventRoutes);
  }

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  // Error handler
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('API error:', err);
    res.status(500).json({
      error: 'Internal server error',
      message: err instanceof Error ? err.message : 'Unknown error'
    });
  });

  return app;
}

/**
 * Starts the HTTP server.
 *
 * @param app - Express application
 * @param port - HTTP port to listen on
 * @returns HTTP server instance for graceful shutdown
 *
 * @example
 * ```ts
 * const server = startServer(app, 3000);
 * console.log('Server listening on port 3000');
 * ```
 */
export function startServer(app: Application, port: number): http.Server {
  const server = app.listen(port, () => {
    console.log(`State API server listening on port ${port}`);
  });

  // Handle server errors
  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.syscall !== 'listen') {
      throw error;
    }

    const bind = typeof port === 'string'
      ? `Pipe ${port}`
      : `Port ${port}`;

    switch (error.code) {
      case 'EACCES':
        console.error(`${bind} requires elevated privileges`);
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(`${bind} is already in use`);
        process.exit(1);
        break;
      default:
        throw error;
    }
  });

  return server;
}

/**
 * Stops the HTTP server gracefully.
 *
 * @param server - HTTP server instance
 * @returns Promise that resolves when server is closed
 */
export function stopServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}
