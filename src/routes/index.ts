/**
 * Routes Module
 * Centralized exports for all route modules
 */

// Event routes
export { createEventRoutes, eventRoutes } from './events.js';

// Auth routes
export { createAuthRoutes, authRoutes } from './auth.js';

// Tenant routes
export { createTenantRoutes, tenantRoutes } from './tenants.js';

// Project routes
export { createProjectRoutes, projectRoutes } from './projects.js';

// Run routes
export { createRunRoutes, runRoutes } from './runs.js';

// Intent routes
export { createIntentRoutes, intentRoutes } from './intents.js';

// Decision routes
export { createDecisionRoutes, decisionRoutes } from './decisions.js';
