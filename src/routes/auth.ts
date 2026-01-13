/**
 * Authentication Routes
 * Handles user authentication endpoints
 *
 * GET /me - Get current user info
 * POST /auth/logout - Logout user
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';

type AuthEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create authentication routes
 */
export function createAuthRoutes() {
  const auth = new Hono<AuthEnv>();

  // Apply auth middleware to all routes
  auth.use('*', authMiddleware());

  /**
   * GET /me - Get current authenticated user information
   *
   * Returns the current user's profile, role, and tenant info
   */
  auth.get('/me', async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Get user details
    const user = await repos.user.findById(authContext.userId);
    if (!user) {
      return c.json(
        {
          status: 'error',
          error: 'user_not_found',
          message: 'User not found',
        },
        404
      );
    }

    // Get tenant details
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

    // Get membership details
    const membership = await repos.membership.findByTenantAndUser(
      authContext.tenantId,
      authContext.userId
    );

    return c.json({
      status: 'ok',
      data: {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          planKey: tenant.planKey,
        },
        membership: membership
          ? {
              role: membership.role,
              status: membership.status,
            }
          : null,
        role: authContext.role,
      },
    });
  });

  /**
   * POST /logout - Logout current user
   *
   * Records the logout event in audit log
   * Client should clear the token after this call
   */
  auth.post('/logout', async (c) => {
    const authContext = c.get('auth');

    // Record logout in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'logout',
      targetType: 'user',
      targetId: authContext.userId,
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      message: 'Logged out successfully',
    });
  });

  return auth;
}

export const authRoutes = createAuthRoutes();
