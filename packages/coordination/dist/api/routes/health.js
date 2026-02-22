/**
 * Health Check API Route
 *
 * Health check endpoint that verifies database connectivity.
 * Returns 200 if healthy, 503 if unhealthy.
 *
 * Per LIFE-05 (health check endpoint verifies responsiveness).
 */
import { Router } from 'express';
/**
 * Creates health check route.
 *
 * Endpoint:
 * - GET /health - Database connectivity check
 *
 * @param db - Database instance
 * @returns Express router with health route
 */
export function createHealthRoute(db) {
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
    router.get('/health', (req, res) => {
        try {
            // Simple query to verify database connectivity
            const result = db.prepare('SELECT 1 AS test').get();
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
        }
        catch (error) {
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
//# sourceMappingURL=health.js.map