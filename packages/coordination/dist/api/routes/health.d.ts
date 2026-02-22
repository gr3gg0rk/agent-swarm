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
//# sourceMappingURL=health.d.ts.map