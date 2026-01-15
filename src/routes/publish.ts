/**
 * Publish Routes
 * Handles deployment/publishing endpoints for runs
 *
 * POST /runs/:runId/publish - Publish run (generate URLs, UTMs, snapshots, ad bundles)
 * POST /runs/:runId/rollback - Rollback a published deployment
 * GET /runs/:runId/deployment - Get deployment information
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createPublishService } from '../services/publish.js';
import { createD1Repositories } from '../repositories/factory.js';

type PublishEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create publish routes
 */
export function createPublishRoutes() {
  const publish = new Hono<PublishEnv>();

  // Apply auth middleware to all routes
  publish.use('*', authMiddleware());

  /**
   * POST /runs/:runId/publish - Publish a run
   *
   * Creates deployment record, generates ad bundles with UTM strings,
   * saves snapshot manifest to R2
   */
  publish.post('/runs/:runId/publish', requirePermission('run', 'launch'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Verify run exists and belongs to tenant
    const run = await repos.run.findById(runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Verify run's project belongs to tenant
    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Create publish service and execute publish
    const baseUrl = c.env.LP_BASE_URL ?? 'https://lp.example.com';
    const publishService = createPublishService(repos, c.env.STORAGE, baseUrl);

    const result = await publishService.publish(runId);

    if (!result.success) {
      return c.json(
        {
          status: 'error',
          error: 'publish_failed',
          message: result.errors?.[0] ?? 'Failed to publish run',
          details: result.errors,
        },
        400
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'publish',
      targetType: 'run',
      targetId: runId,
      before: {
        status: run.status,
      },
      after: {
        status: 'Live',
        deploymentId: result.deployment.id,
        adBundleCount: result.adBundles.length,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        deployment: {
          id: result.deployment.id,
          runId: result.deployment.runId,
          status: result.deployment.status,
          urlsJson: result.deployment.urlsJson,
          snapshotManifestR2Key: result.deployment.snapshotManifestR2Key,
          createdAt: result.deployment.createdAt,
          updatedAt: result.deployment.updatedAt,
        },
        adBundles: result.adBundles.map((b) => ({
          id: b.id,
          intentId: b.intentId,
          lpVariantId: b.lpVariantId,
          creativeVariantId: b.creativeVariantId,
          adCopyId: b.adCopyId,
          utmString: b.utmString,
          status: b.status,
        })),
        warnings: result.errors,
      },
    });
  });

  /**
   * POST /runs/:runId/rollback - Rollback a published deployment
   *
   * Marks deployment as rolled back and archives ad bundles
   */
  publish.post('/runs/:runId/rollback', requirePermission('run', 'launch'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Verify run exists and belongs to tenant
    const run = await repos.run.findById(runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Verify run's project belongs to tenant
    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Create publish service and execute rollback
    const baseUrl = c.env.LP_BASE_URL ?? 'https://lp.example.com';
    const publishService = createPublishService(repos, c.env.STORAGE, baseUrl);

    const result = await publishService.rollback(runId);

    if (!result.success) {
      return c.json(
        {
          status: 'error',
          error: 'rollback_failed',
          message: result.errors?.[0] ?? 'Failed to rollback deployment',
          details: result.errors,
        },
        400
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'rollback',
      targetType: 'deployment',
      targetId: result.deployment.id,
      before: {
        status: 'published',
      },
      after: {
        status: 'rolled_back',
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        deployment: {
          id: result.deployment.id,
          runId: result.deployment.runId,
          status: result.deployment.status,
          updatedAt: result.deployment.updatedAt,
        },
      },
    });
  });

  /**
   * GET /runs/:runId/deployment - Get deployment information
   *
   * Returns deployment, ad bundles, and manifest for a run
   */
  publish.get('/runs/:runId/deployment', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Verify run exists and belongs to tenant
    const run = await repos.run.findById(runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Verify run's project belongs to tenant
    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Create publish service and get deployment info
    const baseUrl = c.env.LP_BASE_URL ?? 'https://lp.example.com';
    const publishService = createPublishService(repos, c.env.STORAGE, baseUrl);

    const result = await publishService.getDeployment(runId);

    if (!result.deployment) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'No deployment found for this run',
        },
        404
      );
    }

    // Parse URLs for response
    let urls: { baseUrl: string; lpUrls: Record<string, string> } | null = null;
    try {
      urls = JSON.parse(result.deployment.urlsJson || '{}');
    } catch {
      urls = null;
    }

    return c.json({
      status: 'ok',
      data: {
        deployment: {
          id: result.deployment.id,
          runId: result.deployment.runId,
          status: result.deployment.status,
          urls,
          snapshotManifestR2Key: result.deployment.snapshotManifestR2Key,
          createdAt: result.deployment.createdAt,
          updatedAt: result.deployment.updatedAt,
        },
        adBundles: result.adBundles.map((b) => ({
          id: b.id,
          intentId: b.intentId,
          lpVariantId: b.lpVariantId,
          creativeVariantId: b.creativeVariantId,
          adCopyId: b.adCopyId,
          utmString: b.utmString,
          status: b.status,
          metaCampaignId: b.metaCampaignId,
          metaAdsetId: b.metaAdsetId,
          metaAdId: b.metaAdId,
        })),
        manifest: result.manifest
          ? {
              version: result.manifest.version,
              timestamp: result.manifest.timestamp,
              intentCount: result.manifest.intents.length,
              adBundleCount: result.manifest.adBundles.length,
            }
          : null,
      },
    });
  });

  return publish;
}

export const publishRoutes = createPublishRoutes();
