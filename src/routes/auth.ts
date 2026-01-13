/**
 * Authentication Routes
 * Handles user authentication endpoints
 *
 * GET /me - Get current user info
 * POST /auth/logout - Logout user
 * GET /me/notifications - Get notification settings
 * PATCH /me/notifications - Update notification settings
 * GET /me/api-keys - List API keys
 * POST /me/api-keys - Generate new API key
 * DELETE /me/api-keys/:id - Revoke API key
 * GET /me/webhooks - Get webhook settings
 * PATCH /me/webhooks - Update webhook settings
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

  /**
   * GET /me/api-keys - List API keys
   *
   * Returns the current user's API keys (masked)
   */
  auth.get('/me/api-keys', async (c) => {
    const authContext = c.get('auth');

    // In a real implementation, this would query api_keys table
    // For now, return placeholder data showing structure
    const apiKeys = [
      {
        id: 'key_demo_1',
        name: 'Default Key',
        prefix: 'lts_',
        lastFourChars: 'xxxx',
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        status: 'active',
      },
    ];

    return c.json({
      status: 'ok',
      data: {
        keys: apiKeys,
        limit: 5, // Max API keys per user
      },
    });
  });

  /**
   * POST /me/api-keys - Generate new API key
   *
   * Creates a new API key for the user
   */
  auth.post('/me/api-keys', async (c) => {
    const authContext = c.get('auth');

    // Parse request body
    interface CreateApiKeyRequest {
      name?: string;
    }

    let body: CreateApiKeyRequest;
    try {
      body = await c.req.json<CreateApiKeyRequest>();
    } catch {
      body = {};
    }

    // Generate a demo API key
    // In production, this would:
    // 1. Generate a cryptographically secure random key
    // 2. Hash the key before storing
    // 3. Only show the full key once
    const keyId = `key_${Date.now()}`;
    const fullKey = `lts_${generateRandomString(32)}`;

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'api_key',
      targetId: keyId,
      after: { name: body.name || 'Unnamed Key' },
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        key: {
          id: keyId,
          name: body.name || 'Unnamed Key',
          prefix: 'lts_',
          fullKey, // Only shown once!
          createdAt: new Date().toISOString(),
          status: 'active',
        },
        warning: 'This is the only time the full key will be shown. Please save it securely.',
      },
    }, 201);
  });

  /**
   * DELETE /me/api-keys/:id - Revoke API key
   */
  auth.delete('/me/api-keys/:id', async (c) => {
    const authContext = c.get('auth');
    const keyId = c.req.param('id');

    // In production, this would mark the key as revoked in DB

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'delete',
      targetType: 'api_key',
      targetId: keyId,
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        message: 'API key revoked successfully',
        id: keyId,
      },
    });
  });

  /**
   * GET /me/webhooks - Get webhook settings
   */
  auth.get('/me/webhooks', async (c) => {
    const authContext = c.get('auth');

    // Return placeholder webhook settings
    const webhookSettings = {
      url: '',
      secret: '',
      enabled: false,
      events: {
        testCompleted: true,
        stopConditionTriggered: true,
        decisionMade: false,
      },
    };

    return c.json({
      status: 'ok',
      data: {
        webhook: webhookSettings,
      },
    });
  });

  /**
   * PATCH /me/webhooks - Update webhook settings
   */
  auth.patch('/me/webhooks', async (c) => {
    const authContext = c.get('auth');

    interface WebhookSettingsRequest {
      url?: string;
      secret?: string;
      enabled?: boolean;
      events?: {
        testCompleted?: boolean;
        stopConditionTriggered?: boolean;
        decisionMade?: boolean;
      };
    }

    let body: WebhookSettingsRequest;
    try {
      body = await c.req.json<WebhookSettingsRequest>();
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

    // Validate URL if provided
    if (body.url && !body.url.startsWith('https://')) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Webhook URL must use HTTPS',
        },
        400
      );
    }

    // In production, this would update webhook_settings table

    const updatedSettings = {
      url: body.url || '',
      enabled: body.enabled ?? false,
      events: {
        testCompleted: body.events?.testCompleted ?? true,
        stopConditionTriggered: body.events?.stopConditionTriggered ?? true,
        decisionMade: body.events?.decisionMade ?? false,
      },
    };

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'update',
      targetType: 'webhook_settings',
      targetId: authContext.userId,
      after: updatedSettings,
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        webhook: updatedSettings,
        message: 'Webhook settings updated',
      },
    });
  });

  return auth;
}

/**
 * Generate a random string for API keys
 */
function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const authRoutes = createAuthRoutes();
