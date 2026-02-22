/**
 * Agent Status API Routes
 *
 * REST endpoints for querying agent status.
 * Minerva uses these to maintain real-time view of all agents.
 *
 * Per STAT-04 (Minerva real-time view of all agents).
 */
import { Router } from 'express';
import Database from 'better-sqlite3';
/**
 * Creates agent status routes.
 *
 * Endpoints:
 * - GET /api/status - Get all agent statuses
 * - GET /api/status/:agentId - Get specific agent status
 *
 * @param db - Database instance
 * @returns Express router with status routes
 */
export declare function createStatusRoutes(db: Database.Database): Router;
//# sourceMappingURL=status.d.ts.map