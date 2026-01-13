/**
 * Middleware exports
 * Centralized exports for all middleware modules
 */

// Authentication middleware
export {
  authMiddleware,
  optionalAuthMiddleware,
  extractBearerToken,
  decodeJWT,
  verifyJWTSignature,
  validateJWTPayload,
  generateRequestId,
  getAuthContext,
  isAuthenticated,
  type AuthVariables,
} from './auth.js';

// RBAC middleware
export {
  roleHierarchy,
  getRoleIndex,
  hasMinimumRole,
  getRoleCapabilities,
  hasPermission,
  getPermissionsForRole,
  requireRole,
  requirePermission,
  canAccessTenant,
  requireTenantMatch,
  requireRoleAndTenant,
} from './rbac.js';

// Guardrails middleware
export {
  checkBudgetCap,
  checkStopRules,
  checkApprovalStatus,
  checkOperationMode,
  runGuardrailChecks,
  requireLaunchGuardrails,
  requireCustomGuardrails,
  requireBudgetCap,
  requireApproval,
  requireStopRulesForAutoMode,
} from './guardrails.js';
