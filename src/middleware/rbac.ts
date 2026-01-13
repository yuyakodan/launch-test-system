/**
 * Role-Based Access Control (RBAC) Middleware
 * Implements role hierarchy and permission checks
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env.js';
import type {
  MembershipRole,
  Permission,
  RoleCapabilities,
} from '../types/auth.js';
import type { AuthVariables } from './auth.js';

/**
 * Role hierarchy for permission checks
 * Higher index = more permissions
 */
export const roleHierarchy: readonly MembershipRole[] = [
  'viewer',
  'reviewer',
  'operator',
  'owner',
] as const;

/**
 * Get role index in hierarchy
 * Returns -1 if role is not found
 */
export function getRoleIndex(role: MembershipRole): number {
  return roleHierarchy.indexOf(role);
}

/**
 * Check if a role has at least the minimum required role
 * @param userRole - The user's current role
 * @param minRole - The minimum role required
 * @returns true if user role meets or exceeds minimum role
 */
export function hasMinimumRole(userRole: MembershipRole, minRole: MembershipRole): boolean {
  const userIndex = getRoleIndex(userRole);
  const minIndex = getRoleIndex(minRole);

  if (userIndex === -1 || minIndex === -1) {
    return false;
  }

  return userIndex >= minIndex;
}

/**
 * Get capabilities for a role
 */
export function getRoleCapabilities(role: MembershipRole): RoleCapabilities {
  switch (role) {
    case 'owner':
      return {
        canView: true,
        canReview: true,
        canOperate: true,
        canAdmin: true,
      };
    case 'operator':
      return {
        canView: true,
        canReview: true,
        canOperate: true,
        canAdmin: false,
      };
    case 'reviewer':
      return {
        canView: true,
        canReview: true,
        canOperate: false,
        canAdmin: false,
      };
    case 'viewer':
    default:
      return {
        canView: true,
        canReview: false,
        canOperate: false,
        canAdmin: false,
      };
  }
}

/**
 * Default permissions by resource and action
 */
const defaultPermissions: Permission[] = [
  // Projects
  { resource: 'project', action: 'read', minRole: 'viewer' },
  { resource: 'project', action: 'create', minRole: 'operator' },
  { resource: 'project', action: 'update', minRole: 'operator' },
  { resource: 'project', action: 'delete', minRole: 'owner' },
  { resource: 'project', action: 'archive', minRole: 'operator' },

  // Runs
  { resource: 'run', action: 'read', minRole: 'viewer' },
  { resource: 'run', action: 'create', minRole: 'operator' },
  { resource: 'run', action: 'update', minRole: 'operator' },
  { resource: 'run', action: 'delete', minRole: 'owner' },
  { resource: 'run', action: 'approve', minRole: 'reviewer' },
  { resource: 'run', action: 'publish', minRole: 'operator' },
  { resource: 'run', action: 'launch', minRole: 'operator' },
  { resource: 'run', action: 'pause', minRole: 'operator' },

  // Variants (LP, Creative, AdCopy)
  { resource: 'variant', action: 'read', minRole: 'viewer' },
  { resource: 'variant', action: 'create', minRole: 'operator' },
  { resource: 'variant', action: 'update', minRole: 'operator' },
  { resource: 'variant', action: 'delete', minRole: 'operator' },
  { resource: 'variant', action: 'approve', minRole: 'reviewer' },
  { resource: 'variant', action: 'reject', minRole: 'reviewer' },

  // Deployments
  { resource: 'deployment', action: 'read', minRole: 'viewer' },
  { resource: 'deployment', action: 'create', minRole: 'operator' },
  { resource: 'deployment', action: 'publish', minRole: 'operator' },
  { resource: 'deployment', action: 'rollback', minRole: 'operator' },

  // Meta Integration
  { resource: 'meta_connection', action: 'read', minRole: 'viewer' },
  { resource: 'meta_connection', action: 'create', minRole: 'owner' },
  { resource: 'meta_connection', action: 'update', minRole: 'owner' },
  { resource: 'meta_connection', action: 'delete', minRole: 'owner' },

  // Analytics & Insights
  { resource: 'analytics', action: 'read', minRole: 'viewer' },
  { resource: 'insight', action: 'read', minRole: 'viewer' },
  { resource: 'decision', action: 'read', minRole: 'viewer' },
  { resource: 'decision', action: 'create', minRole: 'operator' },

  // Audit Logs
  { resource: 'audit_log', action: 'read', minRole: 'owner' },

  // Tenant Management
  { resource: 'tenant', action: 'read', minRole: 'viewer' },
  { resource: 'tenant', action: 'update', minRole: 'owner' },

  // User Management
  { resource: 'membership', action: 'read', minRole: 'viewer' },
  { resource: 'membership', action: 'create', minRole: 'owner' },
  { resource: 'membership', action: 'update', minRole: 'owner' },
  { resource: 'membership', action: 'delete', minRole: 'owner' },
];

/**
 * Permission lookup map for fast access
 */
const permissionMap = new Map<string, MembershipRole>();
for (const perm of defaultPermissions) {
  permissionMap.set(`${perm.resource}:${perm.action}`, perm.minRole);
}

/**
 * Check if a role has permission for a specific action on a resource
 */
export function hasPermission(
  userRole: MembershipRole,
  resource: string,
  action: string
): boolean {
  const key = `${resource}:${action}`;
  const minRole = permissionMap.get(key);

  if (!minRole) {
    // Default to owner-only for unknown permissions
    return userRole === 'owner';
  }

  return hasMinimumRole(userRole, minRole);
}

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: MembershipRole): Permission[] {
  return defaultPermissions.filter((perm) => hasMinimumRole(role, perm.minRole));
}

/**
 * Require role middleware factory
 * Returns 403 if user doesn't have minimum required role
 */
export function requireRole(
  minRole: MembershipRole
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        {
          status: 'error',
          error: 'authentication_required',
          message: 'Authentication is required to access this resource',
        },
        401
      );
    }

    if (!hasMinimumRole(auth.role, minRole)) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: `This action requires at least ${minRole} role. Your role: ${auth.role}`,
          required: minRole,
          current: auth.role,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Require permission middleware factory
 * Returns 403 if user doesn't have permission for specific resource/action
 */
export function requirePermission(
  resource: string,
  action: string
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        {
          status: 'error',
          error: 'authentication_required',
          message: 'Authentication is required to access this resource',
        },
        401
      );
    }

    if (!hasPermission(auth.role, resource, action)) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: `You do not have permission to ${action} ${resource}`,
          resource,
          action,
          role: auth.role,
        },
        403
      );
    }

    await next();
  };
}

/**
 * Check if user can view own tenant resources
 */
export function canAccessTenant(
  userTenantId: string,
  resourceTenantId: string
): boolean {
  return userTenantId === resourceTenantId;
}

/**
 * Require tenant match middleware
 * Ensures user can only access resources in their own tenant
 */
export function requireTenantMatch(
  getTenantId: (c: Parameters<MiddlewareHandler>[0]) => string | null
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        {
          status: 'error',
          error: 'authentication_required',
          message: 'Authentication is required to access this resource',
        },
        401
      );
    }

    const resourceTenantId = getTenantId(c);
    if (resourceTenantId && !canAccessTenant(auth.tenantId, resourceTenantId)) {
      return c.json(
        {
          status: 'error',
          error: 'tenant_mismatch',
          message: 'You cannot access resources from other tenants',
        },
        403
      );
    }

    await next();
  };
}

/**
 * Combined auth check: role + tenant
 */
export function requireRoleAndTenant(
  minRole: MembershipRole,
  getTenantId: (c: Parameters<MiddlewareHandler>[0]) => string | null
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        {
          status: 'error',
          error: 'authentication_required',
          message: 'Authentication is required to access this resource',
        },
        401
      );
    }

    // Check role first
    if (!hasMinimumRole(auth.role, minRole)) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: `This action requires at least ${minRole} role`,
          required: minRole,
          current: auth.role,
        },
        403
      );
    }

    // Then check tenant
    const resourceTenantId = getTenantId(c);
    if (resourceTenantId && !canAccessTenant(auth.tenantId, resourceTenantId)) {
      return c.json(
        {
          status: 'error',
          error: 'tenant_mismatch',
          message: 'You cannot access resources from other tenants',
        },
        403
      );
    }

    await next();
  };
}
