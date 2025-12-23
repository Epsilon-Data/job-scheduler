/**
 * Routes entry point
 *
 * This file re-exports from the modular routes structure.
 * The actual route implementations are in the ./routes/ directory:
 *
 * - routes/auth.ts      - Authentication & OAuth routes
 * - routes/staff.ts     - Staff admin routes
 * - routes/workspaces.ts - Workspace CRUD routes
 * - routes/jobs.ts      - Job request routes
 * - routes/github.ts    - GitHub API proxy routes
 *
 * Middleware is in the ./middleware/ directory:
 * - middleware/auth.ts       - Authentication middleware
 * - middleware/errorHandler.ts - Centralized error handling
 */
export { registerRoutes } from "./routes/index";
