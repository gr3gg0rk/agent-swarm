/**
 * REST API Server for State Service
 *
 * Express server providing HTTP endpoints for task queue, agent status,
 * and project context access. Wraps SQLite database operations.
 *
 * Per RESEARCH.md "REST API Endpoints" section, CONTEXT.md "Database Access".
 */
import { type Application } from 'express';
import http from 'http';
import Database from 'better-sqlite3';
import type { MqttClient } from '../communication/mqtt.js';
interface RawMqttClient {
    connected: boolean;
}
type MqttClientWithStatus = RawMqttClient | undefined;
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
    /** Raw MQTT client for health check connection status (optional) */
    rawMqttClient?: RawMqttClient;
}
/**
 * Creates the Express application with all routes registered.
 *
 * @param db - Database instance
 * @param rawMqttClient - Optional raw MQTT client for health check (from getRawClient())
 * @returns Configured Express application
 *
 * @example
 * ```ts
 * const db = createDatabase({ dbPath: '/var/lib/openclaw-swarm/state.db' });
 * const app = createStateApi(db);
 * ```
 */
export declare function createStateApi(db: Database.Database, rawMqttClient?: MqttClientWithStatus): Application;
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
export declare function startServer(app: Application, port: number): http.Server;
/**
 * Stops the HTTP server gracefully.
 *
 * @param server - HTTP server instance
 * @returns Promise that resolves when server is closed
 */
export declare function stopServer(server: http.Server): Promise<void>;
export {};
//# sourceMappingURL=server.d.ts.map