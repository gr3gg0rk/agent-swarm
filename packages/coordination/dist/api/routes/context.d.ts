/**
 * Project Context API Routes
 *
 * REST endpoints for project context storage and retrieval.
 * Agents can store and retrieve shared project state.
 *
 * Per STATE-03 (project context stored centrally).
 */
import { Router } from 'express';
import { ContextStore } from '../../state/context.js';
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
export declare function createContextRoutes(contextStore: ContextStore): Router;
//# sourceMappingURL=context.d.ts.map