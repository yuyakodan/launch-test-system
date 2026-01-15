/**
 * Feature Flags Routes
 * Handles feature flag management endpoints
 *
 * GET /tenant/flags - Get all flags for tenant
 * PATCH /tenant/flags/:key - Update a specific flag
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { D1FeatureFlagRepository } from '../repositories/d1/feature-flags.js';
import { FeatureFlagsService } from '../services/feature-flags.js';
import {
  FeatureFlagKeys,
  DEFAULT_FEATURE_FLAGS,
  type FeatureFlagKey,
  type DbBackend,
  type OperationModeDefault,
} from '../types/feature-flags.js';

type FeatureFlagsEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Update flag request body
 */
interface UpdateFlagRequest {
  value: unknown;
}

/**
 * Validate flag value based on key
 */
function validateFlagValue(
  key: string,
  value: unknown
): { valid: true; value: unknown } | { valid: false; error: string } {
  switch (key) {
    case FeatureFlagKeys.DB_BACKEND:
      if (value !== 'd1' && value !== 'neon') {
        return { valid: false, error: 'Value must be "d1" or "neon"' };
      }
      return { valid: true, value: value as DbBackend };

    case FeatureFlagKeys.OPERATION_MODE_DEFAULT:
      if (value !== 'manual' && value !== 'hybrid' && value !== 'auto') {
        return { valid: false, error: 'Value must be "manual", "hybrid", or "auto"' };
      }
      return { valid: true, value: value as OperationModeDefault };

    case FeatureFlagKeys.META_API_ENABLED:
    case FeatureFlagKeys.FEATURES_GENERATION:
    case FeatureFlagKeys.FEATURES_QA:
      if (typeof value !== 'boolean') {
        return { valid: false, error: 'Value must be a boolean' };
      }
      return { valid: true, value };

    default:
      return { valid: false, error: `Unknown flag key: ${key}` };
  }
}

/**
 * Check if key is a valid feature flag key
 */
function isValidFlagKey(key: string): key is FeatureFlagKey {
  return Object.values(FeatureFlagKeys).includes(key as FeatureFlagKey);
}

/**
 * Create feature flags routes
 */
export function createFeatureFlagsRoutes() {
  const flags = new Hono<FeatureFlagsEnv>();

  // Apply auth middleware to all routes
  flags.use('*', authMiddleware());

  /**
   * GET /tenant/flags - Get all feature flags for current tenant
   *
   * Returns all flags with their current values (defaults applied)
   */
  flags.get('/', async (c) => {
    const authContext = c.get('auth');
    const repository = new D1FeatureFlagRepository(c.env.DB);
    const service = new FeatureFlagsService(repository);

    const tenantFlags = await service.getAllFlags(authContext.tenantId);

    return c.json({
      status: 'ok',
      data: {
        tenantId: tenantFlags.tenantId,
        flags: tenantFlags.flags,
        defaults: DEFAULT_FEATURE_FLAGS,
        updatedAt: tenantFlags.updatedAt,
      },
    });
  });

  /**
   * GET /tenant/flags/:key - Get a specific flag value
   */
  flags.get('/:key', async (c) => {
    const authContext = c.get('auth');
    const key = c.req.param('key');

    // Validate flag key
    if (!isValidFlagKey(key)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_flag_key',
          message: `Unknown flag key: ${key}`,
          validKeys: Object.values(FeatureFlagKeys),
        },
        400
      );
    }

    const repository = new D1FeatureFlagRepository(c.env.DB);
    const service = new FeatureFlagsService(repository);

    const value = await service.getFlag(authContext.tenantId, key);
    const defaultValue = DEFAULT_FEATURE_FLAGS[key];

    return c.json({
      status: 'ok',
      data: {
        key,
        value,
        default: defaultValue,
        isDefault: JSON.stringify(value) === JSON.stringify(defaultValue),
      },
    });
  });

  /**
   * PATCH /tenant/flags/:key - Update a specific flag
   *
   * Requires owner role for db_backend and meta_api_enabled
   * Requires operator role for other flags
   */
  flags.patch('/:key', async (c) => {
    const authContext = c.get('auth');
    const key = c.req.param('key');

    // Validate flag key
    if (!isValidFlagKey(key)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_flag_key',
          message: `Unknown flag key: ${key}`,
          validKeys: Object.values(FeatureFlagKeys),
        },
        400
      );
    }

    // Check role requirements
    const ownerOnlyKeys: string[] = [
      FeatureFlagKeys.DB_BACKEND,
      FeatureFlagKeys.META_API_ENABLED,
    ];
    const requiresOwner = ownerOnlyKeys.includes(key);

    if (requiresOwner && authContext.role !== 'owner') {
      return c.json(
        {
          status: 'error',
          error: 'forbidden',
          message: `Only owners can update ${key}`,
        },
        403
      );
    }

    if (!requiresOwner && !['owner', 'operator'].includes(authContext.role)) {
      return c.json(
        {
          status: 'error',
          error: 'forbidden',
          message: 'Operator or owner role required',
        },
        403
      );
    }

    // Parse request body
    let body: UpdateFlagRequest;
    try {
      body = await c.req.json<UpdateFlagRequest>();
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Invalid JSON body',
        },
        400
      );
    }

    // Validate value is present
    if (body.value === undefined) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Value is required',
        },
        400
      );
    }

    // Validate value type
    const validation = validateFlagValue(key, body.value);
    if (!validation.valid) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_value',
          message: validation.error,
        },
        400
      );
    }

    const repository = new D1FeatureFlagRepository(c.env.DB);
    const service = new FeatureFlagsService(repository);

    // Get old value for audit log
    const oldValue = await service.getFlag(authContext.tenantId, key);

    // Update flag - cast to appropriate type
    await service.updateFlag(authContext.tenantId, {
      flagKey: key,
      value: validation.value,
    } as Parameters<typeof service.updateFlag>[1]);

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'feature_flag.update',
      targetType: 'feature_flag',
      targetId: key,
      before: { key, value: oldValue },
      after: { key, value: validation.value },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        key,
        value: validation.value,
        previousValue: oldValue,
      },
    });
  });

  /**
   * DELETE /tenant/flags/:key - Reset a flag to default
   *
   * Requires owner role
   */
  flags.delete('/:key', requireRole('owner'), async (c) => {
    const authContext = c.get('auth');
    const key = c.req.param('key');

    // Validate flag key
    if (!isValidFlagKey(key)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_flag_key',
          message: `Unknown flag key: ${key}`,
          validKeys: Object.values(FeatureFlagKeys),
        },
        400
      );
    }

    const repository = new D1FeatureFlagRepository(c.env.DB);
    const service = new FeatureFlagsService(repository);

    // Get old value for audit log
    const oldValue = await service.getFlag(authContext.tenantId, key);

    // Delete flag
    const deleted = await service.deleteFlag(authContext.tenantId, key);

    if (deleted) {
      // Record in audit log
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'feature_flag.reset',
        targetType: 'feature_flag',
        targetId: key,
        before: { key, value: oldValue },
        after: { key, value: DEFAULT_FEATURE_FLAGS[key] },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });
    }

    return c.json({
      status: 'ok',
      data: {
        key,
        deleted,
        value: DEFAULT_FEATURE_FLAGS[key],
        message: deleted ? 'Flag reset to default' : 'Flag was already at default',
      },
    });
  });

  /**
   * GET /tenant/flags/migration/status - Get migration status
   *
   * Returns current DB migration status for the tenant
   */
  flags.get('/migration/status', async (c) => {
    const authContext = c.get('auth');
    const repository = new D1FeatureFlagRepository(c.env.DB);
    const service = new FeatureFlagsService(repository);

    const status = await service.getMigrationStatus(authContext.tenantId);

    return c.json({
      status: 'ok',
      data: status,
    });
  });

  return flags;
}

export const featureFlagsRoutes = createFeatureFlagsRoutes();
