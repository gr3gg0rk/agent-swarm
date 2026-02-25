/**
 * Health Check API Route
 *
 * Health check endpoint that verifies database connectivity.
 * Returns 200 if healthy, 503 if unhealthy.
 *
 * Per LIFE-05 (health check endpoint verifies responsiveness).
 */
import { Router } from 'express';
import Database from 'better-sqlite3';
/**
 * Creates health check route.
 *
 * Endpoint:
 * - GET /health - Database connectivity check
 *
 * @param db - Database instance
 * @returns Express router with health route
 */
export declare function createHealthRoute(db: Database.Database): Router;
/**
 * Creates extended health check route with multi-component verification.
 *
 * Endpoint:
 * - GET /health - Multi-component health check (imports, database, mqtt)
 *
 * Per SETUP-03: Health check verifies imports work, database accessible, MQTT connected.
 *
 * @param db - Database instance
 * @param mqttClient - Optional MQTT client with connection status
 * @returns Express router with extended health route
 */
export declare function createExtendedHealthRoute(db: Database.Database, mqttClient?: {
    connected: boolean;
}): Router;
//# sourceMappingURL=health.d.ts.map