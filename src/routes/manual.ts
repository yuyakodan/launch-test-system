/**
 * Manual Mode Routes
 * Handles Manual Mode operations for ad bundle registration and metrics import
 *
 * POST /manual/ad-bundles/register - Register manual ad bundle mapping
 * POST /manual/metrics/import - Import metrics from CSV
 * GET /runs/:runId/metrics - Get combined metrics for a run
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { ManualModeService, type EventCounts } from '../services/manual-mode.js';
import { createD1Repositories } from '../repositories/factory.js';
import { D1ManualImportRepository } from '../repositories/d1/manual-import.js';
import { D1InsightsDailyRepository } from '../repositories/d1/insights.js';
import { D1AdBundleRepository } from '../repositories/d1/ad-bundle.js';
import { ulid } from '../lib/ulid.js';
import type { RegisterAdBundleRequest, UtmConfig } from '../types/manual-mode.js';

type ManualEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Register ad bundle request body
 */
interface RegisterAdBundleBody {
  runId: string;
  intentId: string;
  lpVariantId: string;
  creativeVariantId: string;
  adCopyId: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaAdId?: string;
  utmConfig?: UtmConfig;
}

/**
 * Import metrics request body
 */
interface ImportMetricsBody {
  runId: string;
  csvContent: string;
  overwrite?: boolean;
}

/**
 * Create manual mode routes
 */
export function createManualRoutes() {
  const manual = new Hono<ManualEnv>();

  // Apply auth middleware to all routes
  manual.use('*', authMiddleware());

  /**
   * POST /manual/ad-bundles/register - Register manual ad bundle mapping
   *
   * Registers a new ad bundle for Manual Mode with generated UTM tracking
   */
  manual.post('/ad-bundles/register', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: RegisterAdBundleBody;
    try {
      body = await c.req.json<RegisterAdBundleBody>();
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
    const requiredFields = ['runId', 'intentId', 'lpVariantId', 'creativeVariantId', 'adCopyId'];
    for (const field of requiredFields) {
      if (!body[field as keyof RegisterAdBundleBody]) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: `${field} is required`,
          },
          400
        );
      }
    }

    // Verify run exists and belongs to tenant
    const run = await repos.run.findById(body.runId);
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

    // Verify intent exists
    const intent = await repos.intent.findById(body.intentId);
    if (!intent || intent.runId !== body.runId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found or does not belong to run',
        },
        404
      );
    }

    // Verify variants exist
    const lpVariant = await repos.lpVariant.findById(body.lpVariantId);
    if (!lpVariant || lpVariant.intentId !== body.intentId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'LP variant not found or does not belong to intent',
        },
        404
      );
    }

    const creativeVariant = await repos.creativeVariant.findById(body.creativeVariantId);
    if (!creativeVariant || creativeVariant.intentId !== body.intentId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Creative variant not found or does not belong to intent',
        },
        404
      );
    }

    const adCopy = await repos.adCopy.findById(body.adCopyId);
    if (!adCopy || adCopy.intentId !== body.intentId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Ad copy not found or does not belong to intent',
        },
        404
      );
    }

    // Create Manual Mode service
    const adBundleRepo = new D1AdBundleRepository(c.env.DB);
    const manualImportRepo = new D1ManualImportRepository(c.env.DB);
    const insightsDailyRepo = new D1InsightsDailyRepository(c.env.DB);

    const manualModeService = new ManualModeService({
      adBundleRepo,
      manualImportRepo,
      insightsDailyRepo,
    });

    // Register ad bundle
    const request: RegisterAdBundleRequest = {
      runId: body.runId,
      intentId: body.intentId,
      lpVariantId: body.lpVariantId,
      creativeVariantId: body.creativeVariantId,
      adCopyId: body.adCopyId,
      metaCampaignId: body.metaCampaignId,
      metaAdsetId: body.metaAdsetId,
      metaAdId: body.metaAdId,
    };

    const bundle = await manualModeService.registerAdBundle(request, body.utmConfig);

    // Get LP published URL for full tracking URL
    let fullTrackingUrl = bundle.trackingUrl;
    if (lpVariant.publishedUrl) {
      fullTrackingUrl = `${lpVariant.publishedUrl}${bundle.trackingUrl}`;
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'ad_bundle',
      targetId: bundle.id,
      after: {
        id: bundle.id,
        runId: bundle.runId,
        utmString: bundle.utmString,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json(
      {
        status: 'ok',
        data: {
          ...bundle,
          trackingUrl: fullTrackingUrl,
        },
      },
      201
    );
  });

  /**
   * POST /manual/metrics/import - Import metrics from CSV
   *
   * Imports cost/clicks/impressions data from CSV and stores in insights_daily
   */
  manual.post('/metrics/import', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: ImportMetricsBody;
    try {
      body = await c.req.json<ImportMetricsBody>();
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
    if (!body.runId) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'runId is required',
        },
        400
      );
    }

    if (!body.csvContent || typeof body.csvContent !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'csvContent is required and must be a string',
        },
        400
      );
    }

    // Verify run exists and belongs to tenant
    const run = await repos.run.findById(body.runId);
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

    // Create Manual Mode service
    const adBundleRepo = new D1AdBundleRepository(c.env.DB);
    const manualImportRepo = new D1ManualImportRepository(c.env.DB);
    const insightsDailyRepo = new D1InsightsDailyRepository(c.env.DB);

    const manualModeService = new ManualModeService({
      adBundleRepo,
      manualImportRepo,
      insightsDailyRepo,
    });

    // Store CSV in R2 (generate a key)
    const fileR2Key = `imports/${authContext.tenantId}/${body.runId}/${ulid()}.csv`;

    try {
      await c.env.STORAGE.put(fileR2Key, body.csvContent, {
        customMetadata: {
          tenantId: authContext.tenantId,
          runId: body.runId,
          importType: 'insights_csv',
        },
      });
    } catch (error) {
      console.error('Failed to store CSV in R2:', error);
      // Continue even if R2 storage fails - the import can still proceed
    }

    // Import metrics
    const result = await manualModeService.importMetricsFromCsv(
      authContext.tenantId,
      body.runId,
      body.csvContent,
      fileR2Key,
      authContext.userId,
      body.overwrite ?? false
    );

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'import',
      targetType: 'manual_import',
      targetId: result.importId,
      after: {
        importId: result.importId,
        runId: body.runId,
        recordsImported: result.recordsImported,
        recordsSkipped: result.recordsSkipped,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    const statusCode = result.success ? 200 : 207; // 207 Multi-Status for partial success
    return c.json(
      {
        status: result.success ? 'ok' : 'partial',
        data: result,
      },
      statusCode
    );
  });

  return manual;
}

/**
 * Create run metrics routes (mounted under /runs)
 */
export function createRunMetricsRoutes() {
  const metrics = new Hono<ManualEnv>();

  // Apply auth middleware
  metrics.use('*', authMiddleware());

  /**
   * GET /runs/:runId/metrics - Get combined metrics for a run
   *
   * Returns combined metrics from self-hosted events and imported insights
   */
  metrics.get('/:runId/metrics', requirePermission('run', 'read'), async (c) => {
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

    // Create repositories and service
    const adBundleRepo = new D1AdBundleRepository(c.env.DB);
    const manualImportRepo = new D1ManualImportRepository(c.env.DB);
    const insightsDailyRepo = new D1InsightsDailyRepository(c.env.DB);

    const manualModeService = new ManualModeService({
      adBundleRepo,
      manualImportRepo,
      insightsDailyRepo,
    });

    // Get all bundles for the run
    const bundlesResult = await adBundleRepo.findByRunId(runId, { limit: 1000 });
    const bundleIds = bundlesResult.items.map((b) => b.id);

    // Get insights metrics
    const insightsMetrics = await manualModeService.getInsightsMetrics(bundleIds);

    // Get events from database
    // Note: This is a simplified version - in production you'd use an events repository
    const eventCounts = await getEventCountsForRun(c.env.DB, runId);
    const eventMetrics = manualModeService.calculateEventMetrics(eventCounts);

    // Get date range from insights
    const dateRange = await insightsDailyRepo.getDateRange(bundleIds);

    // Get latest import to determine source and last updated
    const latestImport = await manualImportRepo.getLatestByRunIdAndType(runId, 'insights_csv');
    const insightsSource = latestImport ? 'manual' : (insightsMetrics.impressions > 0 ? 'meta' : 'none');
    const lastUpdated = latestImport?.createdAt ?? null;

    // Combine metrics
    const totals = manualModeService.combinedMetrics(
      insightsMetrics,
      eventMetrics,
      insightsSource as 'manual' | 'meta' | 'none',
      lastUpdated
    );

    // Build response
    const response = manualModeService.buildRunMetricsResponse(
      runId,
      totals,
      [], // Breakdown can be added in future enhancement
      dateRange
    );

    return c.json({
      status: 'ok',
      data: response,
    });
  });

  return metrics;
}

/**
 * Helper function to get event counts for a run
 * This queries the events table directly
 */
async function getEventCountsForRun(db: D1Database, runId: string): Promise<EventCounts> {
  const sql = `
    SELECT
      event_type,
      COUNT(*) as count
    FROM events
    WHERE run_id = ?
    GROUP BY event_type
  `;

  try {
    const result = await db.prepare(sql).bind(runId).all<{ event_type: string; count: number }>();

    const counts: EventCounts = {
      pageviews: 0,
      ctaClicks: 0,
      formSubmits: 0,
      formSuccesses: 0,
    };

    for (const row of result.results || []) {
      switch (row.event_type) {
        case 'pageview':
          counts.pageviews = row.count;
          break;
        case 'cta_click':
          counts.ctaClicks = row.count;
          break;
        case 'form_submit':
          counts.formSubmits = row.count;
          break;
        case 'form_success':
          counts.formSuccesses = row.count;
          break;
      }
    }

    return counts;
  } catch {
    // Return empty counts if query fails
    return {
      pageviews: 0,
      ctaClicks: 0,
      formSubmits: 0,
      formSuccesses: 0,
    };
  }
}

export const manualRoutes = createManualRoutes();
export const runMetricsRoutes = createRunMetricsRoutes();
