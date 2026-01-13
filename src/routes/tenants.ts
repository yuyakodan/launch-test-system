/**
 * Tenant Routes
 * Handles tenant management endpoints
 *
 * GET /tenant - Get current tenant info
 * PATCH /tenant - Update current tenant
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';

type TenantEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Update tenant request body
 */
interface UpdateTenantRequest {
  name?: string;
  settings?: Record<string, unknown>;
}

/**
 * Create tenant routes
 */
export function createTenantRoutes() {
  const tenants = new Hono<TenantEnv>();

  // Apply auth middleware to all routes
  tenants.use('*', authMiddleware());

  /**
   * GET /tenant - Get current tenant information
   *
   * Returns the tenant details for the authenticated user
   */
  tenants.get('/', async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    const tenant = await repos.tenant.findById(authContext.tenantId);
    if (!tenant) {
      return c.json(
        {
          status: 'error',
          error: 'tenant_not_found',
          message: 'Tenant not found',
        },
        404
      );
    }

    // Parse settings JSON
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(tenant.settingsJson);
    } catch {
      // Keep empty object on parse error
    }

    return c.json({
      status: 'ok',
      data: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        planKey: tenant.planKey,
        settings,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
      },
    });
  });

  /**
   * PATCH /tenant - Update current tenant
   *
   * Requires owner role
   * Updates tenant name and/or settings
   */
  tenants.patch('/', requireRole('owner'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Get current tenant for audit log
    const currentTenant = await repos.tenant.findById(authContext.tenantId);
    if (!currentTenant) {
      return c.json(
        {
          status: 'error',
          error: 'tenant_not_found',
          message: 'Tenant not found',
        },
        404
      );
    }

    // Parse request body
    let body: UpdateTenantRequest;
    try {
      body = await c.req.json<UpdateTenantRequest>();
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

    // Validate request
    if (!body.name && !body.settings) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'At least one of name or settings is required',
        },
        400
      );
    }

    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Name must be a non-empty string',
        },
        400
      );
    }

    // Build update input
    const updateInput: { name?: string; settingsJson?: string } = {};
    if (body.name) {
      updateInput.name = body.name.trim();
    }
    if (body.settings) {
      updateInput.settingsJson = JSON.stringify(body.settings);
    }

    // Update tenant
    const updatedTenant = await repos.tenant.update(authContext.tenantId, updateInput);
    if (!updatedTenant) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update tenant',
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'update',
      targetType: 'tenant',
      targetId: authContext.tenantId,
      before: {
        name: currentTenant.name,
        settingsJson: currentTenant.settingsJson,
      },
      after: {
        name: updatedTenant.name,
        settingsJson: updatedTenant.settingsJson,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    // Parse updated settings
    let settings: Record<string, unknown> = {};
    try {
      settings = JSON.parse(updatedTenant.settingsJson);
    } catch {
      // Keep empty object on parse error
    }

    return c.json({
      status: 'ok',
      data: {
        id: updatedTenant.id,
        name: updatedTenant.name,
        slug: updatedTenant.slug,
        planKey: updatedTenant.planKey,
        settings,
        createdAt: updatedTenant.createdAt,
        updatedAt: updatedTenant.updatedAt,
      },
    });
  });

  return tenants;
}

export const tenantRoutes = createTenantRoutes();
