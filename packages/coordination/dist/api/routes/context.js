/**
 * Project Context API Routes
 *
 * REST endpoints for project context storage and retrieval.
 * Agents can store and retrieve shared project state.
 *
 * Per STATE-03 (project context stored centrally).
 */
import { Router } from 'express';
/**
 * Creates project context routes.
 *
 * Endpoints:
 * - GET /api/context/:key - Get context value
 * - PUT /api/context/:key - Set context value
 * - DELETE /api/context/:key - Delete context value
 * - GET /api/context - Get all context
 *
 * @param contextStore - ContextStore instance
 * @returns Express router with context routes
 */
export function createContextRoutes(contextStore) {
    const router = Router();
    /**
     * GET /api/context/:key
     *
     * Get a specific context value.
     * Returns 404 if key not found.
     *
     * @example
     * GET /api/context/project-version
     */
    router.get('/context/:key', (req, res) => {
        try {
            const { key } = req.params;
            const value = contextStore.getContext(key);
            if (value === null) {
                return res.status(404).json({ error: 'Key not found' });
            }
            res.json({ key, value });
        }
        catch (error) {
            console.error('Error getting context:', error);
            res.status(500).json({ error: 'Failed to get context' });
        }
    });
    /**
     * PUT /api/context/:key
     *
     * Set a context value.
     * Creates new key or updates existing.
     *
     * @example
     * PUT /api/context/project-version
     * { "value": "1.0.0" }
     */
    router.put('/context/:key', (req, res) => {
        try {
            const { key } = req.params;
            const body = req.body;
            if (body.value === undefined) {
                return res.status(400).json({ error: 'Missing value in request body' });
            }
            contextStore.setContext(key, body.value);
            // Get the entry with metadata
            const entry = contextStore.getContextEntry(key);
            const parsedValue = entry ? JSON.parse(entry.value) : body.value;
            res.json({
                key,
                value: parsedValue,
                updatedAt: entry?.updatedAt || Math.floor(Date.now() / 1000)
            });
        }
        catch (error) {
            console.error('Error setting context:', error);
            res.status(500).json({ error: 'Failed to set context' });
        }
    });
    /**
     * DELETE /api/context/:key
     *
     * Delete a context key.
     * Returns 404 if key not found.
     *
     * @example
     * DELETE /api/context/old-key
     */
    router.delete('/context/:key', (req, res) => {
        try {
            const { key } = req.params;
            const deleted = contextStore.deleteContext(key);
            if (!deleted) {
                return res.status(404).json({ error: 'Key not found' });
            }
            res.json({ message: 'Key deleted', key });
        }
        catch (error) {
            console.error('Error deleting context:', error);
            res.status(500).json({ error: 'Failed to delete context' });
        }
    });
    /**
     * GET /api/context
     *
     * Get all context entries.
     *
     * @example
     * GET /api/context
     */
    router.get('/context', (req, res) => {
        try {
            const allContext = contextStore.getAllContext();
            res.json({ context: allContext, count: Object.keys(allContext).length });
        }
        catch (error) {
            console.error('Error getting all context:', error);
            res.status(500).json({ error: 'Failed to get context' });
        }
    });
    return router;
}
//# sourceMappingURL=context.js.map