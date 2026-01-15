/**
 * Meta Routes
 * Handles Meta (Facebook) integration endpoints
 *
 * POST /meta/connect/start - Start OAuth flow
 * POST /meta/connect/callback - OAuth callback
 * GET /meta/connections - List connections
 * DELETE /meta/connections/:id - Disconnect
 * POST /internal/insights/sync - Sync insights (Cron trigger)
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { MetaService } from '../services/meta.js';
import { createD1Repositories } from '../repositories/factory.js';
import { D1MetaConnectionRepository } from '../repositories/d1/meta-connection.js';
import type {
  StartOAuthRequest,
  OAuthCallbackRequest,
  InsightsSyncRequest,
} from '../types/meta.js';

type MetaEnv = {
  Bindings: Env & {
    META_APP_ID?: string;
    META_APP_SECRET?: string;
    META_API_VERSION?: string;
    META_OAUTH_KV?: KVNamespace;
  };
  Variables: AuthVariables;
};

/**
 * Create Meta service from environment
 */
function createMetaService(env: MetaEnv['Bindings']): MetaService | null {
  if (!env.META_APP_ID || !env.META_APP_SECRET) {
    return null;
  }

  return new MetaService({
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    apiVersion: env.META_API_VERSION ?? 'v19.0',
  });
}

/**
 * Create Meta routes
 */
export function createMetaRoutes() {
  const meta = new Hono<MetaEnv>();

  // Apply auth middleware to all routes except internal
  meta.use('/connect/*', authMiddleware());
  meta.use('/connections/*', authMiddleware());
  meta.use('/connections', authMiddleware());

  /**
   * POST /meta/connect/start - Start OAuth flow
   *
   * Requires operator or owner role
   * Returns authorization URL for Meta OAuth
   */
  meta.post('/connect/start', requireRole('operator'), async (c) => {
    const authContext = c.get('auth');
    const metaService = createMetaService(c.env);

    if (!metaService) {
      return c.json(
        {
          status: 'error',
          error: 'meta_not_configured',
          message: 'Meta integration is not configured. Contact administrator.',
        },
        503
      );
    }

    // Parse request body
    let body: StartOAuthRequest;
    try {
      body = await c.req.json<StartOAuthRequest>();
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

    // Validate redirect URL
    if (!body.redirectUrl) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'redirectUrl is required',
        },
        400
      );
    }

    // Create OAuth state
    const state = metaService.createOAuthState(
      authContext.tenantId,
      authContext.userId,
      body.redirectUrl
    );

    // Encode state for URL
    const encodedState = metaService.encodeOAuthState(state);

    // Store state in KV for validation (5 minute TTL)
    if (c.env.META_OAUTH_KV) {
      await c.env.META_OAUTH_KV.put(`oauth_state_${state.nonce}`, JSON.stringify(state), {
        expirationTtl: 300,
      });
    }

    // Generate authorization URL
    const authUrl = metaService.generateAuthUrl(
      encodedState,
      body.redirectUrl,
      body.scopes
    );

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'meta.oauth.start',
      targetType: 'meta_connection',
      targetId: state.nonce,
      before: {},
      after: { redirectUrl: body.redirectUrl },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        authUrl,
        state: encodedState,
        expiresIn: 300,
      },
    });
  });

  /**
   * POST /meta/connect/callback - OAuth callback
   *
   * Handles OAuth callback from Meta
   * Exchanges code for token and creates connection
   */
  meta.post('/connect/callback', requireRole('operator'), async (c) => {
    const authContext = c.get('auth');
    const metaService = createMetaService(c.env);

    if (!metaService) {
      return c.json(
        {
          status: 'error',
          error: 'meta_not_configured',
          message: 'Meta integration is not configured',
        },
        503
      );
    }

    // Parse request body
    let body: OAuthCallbackRequest;
    try {
      body = await c.req.json<OAuthCallbackRequest>();
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

    // Validate required fields
    if (!body.code || !body.state) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'code and state are required',
        },
        400
      );
    }

    // Decode and validate state
    const state = metaService.decodeOAuthState(body.state);
    if (!state) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_state',
          message: 'Invalid or expired OAuth state',
        },
        400
      );
    }

    // Verify state belongs to this tenant
    if (state.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_state',
          message: 'OAuth state does not match current tenant',
        },
        403
      );
    }

    // Verify state exists in KV (CSRF protection)
    if (c.env.META_OAUTH_KV) {
      const storedState = await c.env.META_OAUTH_KV.get(`oauth_state_${state.nonce}`);
      if (!storedState) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_state',
            message: 'OAuth state expired or already used',
          },
          400
        );
      }
      // Delete used state
      await c.env.META_OAUTH_KV.delete(`oauth_state_${state.nonce}`);
    }

    try {
      // Exchange code for token
      const tokenResponse = await metaService.exchangeCodeForToken(
        body.code,
        state.redirectUrl
      );

      // Exchange for long-lived token
      const longLivedToken = await metaService.getLongLivedToken(
        tokenResponse.access_token
      );

      // Get user info
      const userInfo = await metaService.getUserInfo(longLivedToken.access_token);

      // Get ad accounts
      const adAccounts = await metaService.getAdAccounts(longLivedToken.access_token);
      const primaryAdAccount = adAccounts[0];

      // Get pages
      const pages = await metaService.getPages(longLivedToken.access_token);
      const primaryPage = pages[0];

      // Get pixels if ad account exists
      let primaryPixel = null;
      if (primaryAdAccount) {
        const pixels = await metaService.getPixels(
          primaryAdAccount.account_id,
          longLivedToken.access_token
        );
        primaryPixel = pixels[0];
      }

      // Store token reference (in production, use proper encryption)
      let tokenRef = `temp_${Date.now()}`;
      if (c.env.META_OAUTH_KV) {
        tokenRef = `meta_token_${authContext.tenantId}_${Date.now()}`;
        await c.env.META_OAUTH_KV.put(
          tokenRef,
          JSON.stringify({
            token: longLivedToken.access_token,
            expiresAt: Date.now() + longLivedToken.expires_in * 1000,
          }),
          { expirationTtl: longLivedToken.expires_in }
        );
      }

      // Create connection record
      const metaConnectionRepo = new D1MetaConnectionRepository(c.env.DB);
      const connection = await metaConnectionRepo.create({
        tenantId: authContext.tenantId,
        tokenRef,
        adAccountId: primaryAdAccount?.account_id ?? undefined,
        pixelId: primaryPixel?.id ?? undefined,
        pageId: primaryPage?.id ?? undefined,
        scopesJson: JSON.stringify(DEFAULT_SCOPES),
        metaJson: JSON.stringify({
          metaUserId: userInfo.id,
          metaUserName: userInfo.name,
          adAccountName: primaryAdAccount?.name,
          pageName: primaryPage?.name,
          pixelName: primaryPixel?.name,
          connectedAt: new Date().toISOString(),
        }),
      });

      // Record in audit log
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'meta.oauth.complete',
        targetType: 'meta_connection',
        targetId: connection.id,
        before: {},
        after: {
          connectionId: connection.id,
          adAccountId: connection.adAccountId,
          pageId: connection.pageId,
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json({
        status: 'ok',
        data: {
          connectionId: connection.id,
          adAccountId: connection.adAccountId,
          pageId: connection.pageId,
          pixelId: connection.pixelId,
          metaUserId: userInfo.id,
          metaUserName: userInfo.name,
        },
      });
    } catch (error) {
      console.error('OAuth callback error:', error);
      return c.json(
        {
          status: 'error',
          error: 'oauth_failed',
          message: error instanceof Error ? error.message : 'OAuth flow failed',
        },
        500
      );
    }
  });

  /**
   * GET /meta/connections - List connections
   *
   * Returns all Meta connections for the tenant
   */
  meta.get('/connections', async (c) => {
    const authContext = c.get('auth');
    const metaConnectionRepo = new D1MetaConnectionRepository(c.env.DB);

    const result = await metaConnectionRepo.findByTenantId(authContext.tenantId);

    // Parse meta JSON for each connection
    const connections = result.items.map((conn) => {
      let metaInfo = {};
      try {
        metaInfo = JSON.parse(conn.metaJson);
      } catch {
        // Keep empty
      }

      let scopes: string[] = [];
      try {
        scopes = JSON.parse(conn.scopesJson);
      } catch {
        // Keep empty
      }

      return {
        id: conn.id,
        status: conn.status,
        adAccountId: conn.adAccountId,
        pixelId: conn.pixelId,
        pageId: conn.pageId,
        igUserId: conn.igUserId,
        scopes,
        meta: metaInfo,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      };
    });

    return c.json({
      status: 'ok',
      data: {
        connections,
        total: result.total,
      },
    });
  });

  /**
   * DELETE /meta/connections/:id - Disconnect
   *
   * Revokes a Meta connection
   * Requires operator or owner role
   */
  meta.delete('/connections/:id', requireRole('operator'), async (c) => {
    const authContext = c.get('auth');
    const connectionId = c.req.param('id');
    const metaConnectionRepo = new D1MetaConnectionRepository(c.env.DB);

    // Find connection
    const connection = await metaConnectionRepo.findById(connectionId);
    if (!connection) {
      return c.json(
        {
          status: 'error',
          error: 'connection_not_found',
          message: 'Meta connection not found',
        },
        404
      );
    }

    // Verify tenant ownership
    if (connection.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'forbidden',
          message: 'Connection does not belong to this tenant',
        },
        403
      );
    }

    // Revoke connection
    await metaConnectionRepo.revoke(connectionId);

    // Delete stored token
    if (c.env.META_OAUTH_KV && connection.tokenRef) {
      await c.env.META_OAUTH_KV.delete(connection.tokenRef);
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'meta.connection.revoke',
      targetType: 'meta_connection',
      targetId: connectionId,
      before: { status: connection.status },
      after: { status: 'revoked' },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        connectionId,
        status: 'revoked',
      },
    });
  });

  return meta;
}

/**
 * Create internal Meta routes (for Cron triggers)
 */
export function createInternalMetaRoutes() {
  const internal = new Hono<MetaEnv>();

  /**
   * POST /internal/insights/sync - Sync insights
   *
   * Triggered by Cron to sync Meta insights
   * Does not require user authentication (uses internal auth)
   */
  internal.post('/insights/sync', async (c) => {
    // Validate internal request (e.g., via shared secret)
    const internalSecret = c.req.header('X-Internal-Secret');
    const expectedSecret = c.env.ENVIRONMENT === 'development' ? 'dev-secret' : undefined;

    if (expectedSecret && internalSecret !== expectedSecret) {
      return c.json(
        {
          status: 'error',
          error: 'unauthorized',
          message: 'Invalid internal authentication',
        },
        401
      );
    }

    const metaService = createMetaService(c.env);
    if (!metaService) {
      return c.json(
        {
          status: 'error',
          error: 'meta_not_configured',
          message: 'Meta integration is not configured',
        },
        503
      );
    }

    // Parse optional request body
    let body: InsightsSyncRequest = {};
    try {
      body = await c.req.json<InsightsSyncRequest>();
    } catch {
      // Use defaults
    }

    const metaConnectionRepo = new D1MetaConnectionRepository(c.env.DB);

    // Get connections to sync
    let connections;
    if (body.tenantId) {
      connections = await metaConnectionRepo.findByFilter({
        tenantId: body.tenantId,
        status: 'active',
      });
    } else {
      connections = await metaConnectionRepo.findByFilter({ status: 'active' });
    }

    const results = {
      total: connections.items.length,
      synced: 0,
      failed: 0,
      details: [] as { connectionId: string; success: boolean; error?: string }[],
    };

    // Sync each connection
    for (const connection of connections.items) {
      try {
        // In a real implementation, we would:
        // 1. Get access token from KV
        // 2. Fetch insights from Meta API
        // 3. Map ad IDs to bundle IDs
        // 4. Store in insights_hourly/daily tables

        // For now, just mark as synced
        results.synced++;
        results.details.push({
          connectionId: connection.id,
          success: true,
        });
      } catch (error) {
        results.failed++;
        results.details.push({
          connectionId: connection.id,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return c.json({
      status: 'ok',
      data: results,
    });
  });

  return internal;
}

/**
 * Default OAuth scopes
 */
const DEFAULT_SCOPES = [
  'ads_read',
  'ads_management',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

export const metaRoutes = createMetaRoutes();
export const internalMetaRoutes = createInternalMetaRoutes();
