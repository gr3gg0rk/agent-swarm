/**
 * Agent Status API Routes
 *
 * REST endpoints for querying agent status.
 * Minerva uses these to maintain real-time view of all agents.
 *
 * Per STAT-04 (Minerva real-time view of all agents).
 */

import { Router, type Request, type Response } from 'express';
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
export function createStatusRoutes(db: Database.Database): Router {
  const router = Router();

  // Prepared statement for getting all statuses
  const getAllStmt = db.prepare(`
    SELECT agent_id as agentId, status, last_heartbeat as lastHeartbeat,
           current_task as currentTask, capabilities, updated_at as updatedAt
    FROM agent_status
    ORDER BY status, last_heartbeat DESC
  `);

  // Prepared statement for getting specific agent
  const getAgentStmt = db.prepare(`
    SELECT agent_id as agentId, status, last_heartbeat as lastHeartbeat,
           current_task as currentTask, capabilities, updated_at as updatedAt
    FROM agent_status
    WHERE agent_id = ?
  `);

  /**
   * GET /api/status
   *
   * Get all agent statuses.
   * Used by Minerva to maintain real-time view of the swarm.
   *
   * @example
   * GET /api/status
   */
  router.get('/status', (req: Request, res: Response) => {
    try {
      const statuses = getAllStmt.all() as AgentStatusResponse[];
      res.json({ agents: statuses, count: statuses.length });
    } catch (error) {
      console.error('Error getting agent statuses:', error);
      res.status(500).json({ error: 'Failed to get agent statuses' });
    }
  });

  /**
   * GET /api/status/:agentId
   *
   * Get specific agent status.
   * Returns 404 if agent not found.
   *
   * @example
   * GET /api/status/worker-1
   */
  router.get('/status/:agentId', (req: Request, res: Response) => {
    try {
      const { agentId } = req.params;
      const status = getAgentStmt.get(agentId) as AgentStatusResponse | undefined;

      if (!status) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Parse capabilities if it exists
      const response = {
        ...status,
        capabilities: status.capabilities ? JSON.parse(status.capabilities) : [],
      };

      res.json({ agent: response });
    } catch (error) {
      console.error('Error getting agent status:', error);
      res.status(500).json({ error: 'Failed to get agent status' });
    }
  });

  return router;
}

/**
 * Agent status response format.
 */
interface AgentStatusResponse {
  agentId: string;
  status: 'online' | 'offline' | 'busy' | 'error';
  lastHeartbeat: number;
  currentTask?: string;
  capabilities?: string;
  updatedAt: number;
}
