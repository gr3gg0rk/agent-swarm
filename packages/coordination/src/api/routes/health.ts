/**
 * Health Check API Route
 *
 * Health check endpoint that verifies database connectivity.
 * Returns 200 if healthy, 503 if unhealthy.
 *
 * Per LIFE-05 (health check endpoint verifies responsiveness).
 */

import { Router, type Request, type Response } from 'express';
import Database from 'better-sqlite3';

/**
 * Component health check result.
 */
interface ComponentHealth {
  status: 'pass' | 'fail' | 'skip';
  message?: string;
}

/**
 * Overall health status response.
 */
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    imports: ComponentHealth;
    database: ComponentHealth;
    mqtt: ComponentHealth;
  };
  timestamp: string;
}

/**
 * Creates health check route.
 *
 * Endpoint:
 * - GET /health - Database connectivity check
 *
 * @param db - Database instance
 * @returns Express router with health route
 */
export function createHealthRoute(db: Database.Database): Router {
  const router = Router();

  /**
   * GET /health
   *
   * Health check endpoint.
   * Verifies database is connected and responsive.
   *
   * Returns:
   * - 200 OK: Database connected and responsive
   * - 503 Service Unavailable: Database disconnected or error
   *
   * @example
   * GET /health
   *
   * Response (healthy):
   * {
   *   "status": "healthy",
   *   "database": "connected",
   *   "timestamp": "2026-02-21T20:00:00.000Z"
   * }
   *
   * Response (unhealthy):
   * {
   *   "status": "unhealthy",
   *   "database": "disconnected"
   * }
   */
  router.get('/health', (req: Request, res: Response) => {
    try {
      // Simple query to verify database connectivity
      const result = db.prepare('SELECT 1 AS test').get() as { test: number } | undefined;

      if (!result || result.test !== 1) {
        return res.status(503).json({
          status: 'unhealthy',
          database: 'disconnected',
          timestamp: new Date().toISOString()
        });
      }

      res.status(200).json({
        status: 'healthy',
        database: 'connected',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}

/**
 * Check imports - verify coordination module can be dynamically imported.
 */
async function checkImports(): Promise<ComponentHealth> {
  try {
    // Dynamic import test - verify built dist/index.js exists and loads
    // Import from root index.ts (../../index.js), not api/index.ts
    const coordination = await import('../../index.js');
    // Verify key exports exist by checking if they are functions
    if (typeof coordination.initializeSchema === 'function' && typeof coordination.validateSchema === 'function') {
      return { status: 'pass' };
    }
    return { status: 'fail', message: 'Missing expected exports' };
  } catch (error) {
    return { status: 'fail', message: error instanceof Error ? error.message : 'Import failed' };
  }
}

/**
 * Check database - verify SQLite connectivity.
 */
function checkDatabase(db: Database.Database): ComponentHealth {
  try {
    const result = db.prepare('SELECT 1 AS test').get() as { test: number } | undefined;
    if (!result || result.test !== 1) {
      return { status: 'fail', message: 'Database query returned unexpected result' };
    }
    return { status: 'pass', message: 'Connected' };
  } catch (error) {
    return { status: 'fail', message: error instanceof Error ? error.message : 'Database error' };
  }
}

/**
 * Check MQTT - verify connection status.
 */
function checkMqtt(mqttClient?: { connected: boolean }): ComponentHealth {
  if (!mqttClient) {
    return { status: 'skip', message: 'No MQTT client provided' };
  }
  return mqttClient.connected
    ? { status: 'pass', message: 'Connected' }
    : { status: 'fail', message: 'Not connected' };
}

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
export function createExtendedHealthRoute(
  db: Database.Database,
  mqttClient?: { connected: boolean }
): Router {
  const router = Router();

  /**
   * GET /health
   *
   * Extended health check endpoint.
   * Verifies imports, database connectivity, and MQTT connection status.
   *
   * Returns:
   * - 200 OK: All checks pass (healthy) or degraded (skips but no failures)
   * - 503 Service Unavailable: One or more checks failed
   *
   * Response structure:
   * {
   *   "status": "healthy" | "degraded" | "unhealthy",
   *   "checks": {
   *     "imports": { "status": "pass" | "fail" | "skip", "message"?: string },
   *     "database": { "status": "pass" | "fail" | "skip", "message"?: string },
   *     "mqtt": { "status": "pass" | "fail" | "skip", "message"?: string }
   *   },
   *   "timestamp": "2026-02-21T20:00:00.000Z"
   * }
   */
  router.get('/health', async (req: Request, res: Response) => {
    const checks: HealthStatus['checks'] = {
      imports: await checkImports(),
      database: checkDatabase(db),
      mqtt: checkMqtt(mqttClient)
    };

    const allPass = Object.values(checks).every(c => c.status === 'pass');
    const hasFailures = Object.values(checks).some(c => c.status === 'fail');

    let status: HealthStatus['status'];
    if (allPass) {
      status = 'healthy';
    } else if (hasFailures) {
      status = 'unhealthy';
    } else {
      status = 'degraded'; // Has skips but no failures
    }

    const statusCode = status === 'healthy' ? 200 : 503;
    res.status(statusCode).json({
      status,
      checks,
      timestamp: new Date().toISOString()
    });
  });

  return router;
}
