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

// Stop condition routes
export {
  createStopConditionRoutes,
  createInternalStopConditionRoutes,
  stopConditionRoutes,
  internalStopConditionRoutes,
} from './stop-condition.js';

// QA routes
export { createQaRoutes, qaRoutes } from './qa.js';

// Variant routes
export { createVariantRoutes, variantRoutes } from './variants.js';

// Generation routes
export { createGenerationRoutes, generationRoutes } from './generation.js';

// Next run routes
export { createNextRunRoutes, nextRunRoutes } from './next-run.js';

// Incident routes
export { createIncidentRoutes, incidentRoutes } from './incidents.js';

// Manual Mode routes
export { createManualRoutes, createRunMetricsRoutes, manualRoutes, runMetricsRoutes } from './manual.js';

// Job routes
export { createJobRoutes, jobRoutes } from './jobs.js';

// Notification routes
export { createNotificationRoutes, notificationRoutes } from './notifications.js';
