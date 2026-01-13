/**
 * Authentication Routes
 * Handles user authentication endpoints
 *
 * GET /me - Get current user info
 * POST /auth/logout - Logout user
 * GET /me/notifications - Get notification settings
 * PATCH /me/notifications - Update notification settings
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

  /**
   * GET /me/notifications - Get notification settings
   *
   * Returns the current user's notification preferences
   */
  auth.get('/me/notifications', async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Get user
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

    // Parse notification settings from user metadata or use defaults
    // In a real implementation, this would be stored in a separate table
    const defaultSettings = {
      testCompleted: true,
      stopConditionTriggered: true,
      dailySummary: false,
      weeklyReport: true,
      emailEnabled: true,
    };

    // For now, return default settings
    // In production, this would read from user_notification_settings table
    return c.json({
      status: 'ok',
      data: {
        settings: defaultSettings,
        email: user.email,
      },
    });
  });

  /**
   * PATCH /me/notifications - Update notification settings
   *
   * Updates the current user's notification preferences
   */
  auth.patch('/me/notifications', async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Get user
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

    // Parse request body
    interface NotificationSettingsRequest {
      testCompleted?: boolean;
      stopConditionTriggered?: boolean;
      dailySummary?: boolean;
      weeklyReport?: boolean;
      emailEnabled?: boolean;
    }

    let body: NotificationSettingsRequest;
    try {
      body = await c.req.json<NotificationSettingsRequest>();
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

    // Validate at least one field provided
    if (Object.keys(body).length === 0) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'At least one setting is required',
        },
        400
      );
    }

    // In a real implementation, this would update user_notification_settings table
    // For now, return the updated settings
    const updatedSettings = {
      testCompleted: body.testCompleted ?? true,
      stopConditionTriggered: body.stopConditionTriggered ?? true,
      dailySummary: body.dailySummary ?? false,
      weeklyReport: body.weeklyReport ?? true,
      emailEnabled: body.emailEnabled ?? true,
    };

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'update',
      targetType: 'notification_settings',
      targetId: authContext.userId,
      after: updatedSettings,
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        settings: updatedSettings,
        message: 'Notification settings updated',
      },
    });
  });

  return auth;
}

export const authRoutes = createAuthRoutes();
