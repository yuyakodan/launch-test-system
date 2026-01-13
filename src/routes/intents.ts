/**
 * Intent Routes
 * Handles intent management endpoints
 *
 * GET /runs/:runId/intents - List intents for a run
 * POST /runs/:runId/intents - Create intent for a run
 * PATCH /intents/:id - Update an intent
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type { IntentStatus } from '../types/entities.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';
import type { CreateIntentInput, UpdateIntentInput } from '../repositories/interfaces/index.js';

type IntentEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create intent request body
 */
interface CreateIntentRequest {
  title: string;
  hypothesis?: string;
  evidenceJson?: string;
  faqJson?: string;
  priority?: number;
}

/**
 * Update intent request body
 */
interface UpdateIntentRequest {
  title?: string;
  hypothesis?: string;
  evidenceJson?: string;
  faqJson?: string;
  priority?: number;
  status?: IntentStatus;
}

/**
 * Create intent routes
 */
export function createIntentRoutes() {
  const intents = new Hono<IntentEnv>();

  // Apply auth middleware to all routes
  intents.use('*', authMiddleware());

  /**
   * GET /runs/:runId/intents - List intents for a run
   *
   * Query parameters:
   * - status: string (optional filter)
   * - orderByPriority: boolean (default: false)
   * - limit: number (default: 100)
   * - offset: number (default: 0)
   */
  intents.get('/runs/:runId/intents', requirePermission('run', 'read'), async (c) => {
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

    // Parse query parameters
    const status = c.req.query('status') as IntentStatus | undefined;
    const orderByPriority = c.req.query('orderByPriority') === 'true';
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    let result;
    if (status) {
      result = await repos.intent.findByFilter({ runId, status }, { limit, offset });
    } else if (orderByPriority) {
      result = await repos.intent.findByRunIdOrderedByPriority(runId, { limit, offset });
    } else {
      result = await repos.intent.findByRunId(runId, { limit, offset });
    }

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((intent) => ({
          id: intent.id,
          runId: intent.runId,
          title: intent.title,
          hypothesis: intent.hypothesis,
          evidenceJson: intent.evidenceJson,
          faqJson: intent.faqJson,
          priority: intent.priority,
          status: intent.status,
          createdAt: intent.createdAt,
          updatedAt: intent.updatedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * POST /runs/:runId/intents - Create an intent for a run
   */
  intents.post('/runs/:runId/intents', requirePermission('run', 'update'), async (c) => {
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

    // Parse request body
    let body: CreateIntentRequest;
    try {
      body = await c.req.json<CreateIntentRequest>();
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
    if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Title is required and must be a non-empty string',
        },
        400
      );
    }

    // If no priority provided, get max priority and add 1
    let priority = body.priority;
    if (priority === undefined) {
      const maxPriority = await repos.intent.getMaxPriorityForRun(runId);
      priority = maxPriority + 1;
    }

    // Build create input
    const createInput: CreateIntentInput = {
      runId,
      title: body.title.trim(),
      hypothesis: body.hypothesis,
      evidenceJson: body.evidenceJson,
      faqJson: body.faqJson,
      priority,
    };

    // Create intent
    const intent = await repos.intent.create(createInput);

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'intent',
      targetId: intent.id,
      after: {
        id: intent.id,
        runId: intent.runId,
        title: intent.title,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json(
      {
        status: 'ok',
        data: {
          id: intent.id,
          runId: intent.runId,
          title: intent.title,
          hypothesis: intent.hypothesis,
          evidenceJson: intent.evidenceJson,
          faqJson: intent.faqJson,
          priority: intent.priority,
          status: intent.status,
          createdAt: intent.createdAt,
          updatedAt: intent.updatedAt,
        },
      },
      201
    );
  });

  /**
   * PATCH /intents/:id - Update an intent
   */
  intents.patch('/intents/:id', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('id');

    // Get intent
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found',
        },
        404
      );
    }

    // Verify intent's run's project belongs to tenant
    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found',
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
          message: 'Intent not found',
        },
        404
      );
    }

    // Parse request body
    let body: UpdateIntentRequest;
    try {
      body = await c.req.json<UpdateIntentRequest>();
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

    // Validate request has at least one field
    if (Object.keys(body).length === 0) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'At least one field is required for update',
        },
        400
      );
    }

    // Validate status if provided
    if (body.status && !['active', 'paused', 'archived'].includes(body.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Status must be one of: active, paused, archived',
        },
        400
      );
    }

    // Build update input
    const updateInput: UpdateIntentInput = {};
    if (body.title) updateInput.title = body.title.trim();
    if (body.hypothesis !== undefined) updateInput.hypothesis = body.hypothesis;
    if (body.evidenceJson !== undefined) updateInput.evidenceJson = body.evidenceJson;
    if (body.faqJson !== undefined) updateInput.faqJson = body.faqJson;
    if (body.priority !== undefined) updateInput.priority = body.priority;
    if (body.status) updateInput.status = body.status;

    // Update intent
    const updatedIntent = await repos.intent.update(intentId, updateInput);
    if (!updatedIntent) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update intent',
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
      targetType: 'intent',
      targetId: intentId,
      before: {
        title: intent.title,
        status: intent.status,
        priority: intent.priority,
      },
      after: {
        title: updatedIntent.title,
        status: updatedIntent.status,
        priority: updatedIntent.priority,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedIntent.id,
        runId: updatedIntent.runId,
        title: updatedIntent.title,
        hypothesis: updatedIntent.hypothesis,
        evidenceJson: updatedIntent.evidenceJson,
        faqJson: updatedIntent.faqJson,
        priority: updatedIntent.priority,
        status: updatedIntent.status,
        createdAt: updatedIntent.createdAt,
        updatedAt: updatedIntent.updatedAt,
      },
    });
  });

  /**
   * GET /intents/:id/metrics - Get metrics for an intent
   *
   * Returns aggregated metrics for the intent including:
   * - Total impressions, clicks, conversions
   * - CTR, CVR, CPA calculations
   * - Per-variant breakdown
   */
  intents.get('/intents/:id/metrics', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('id');

    // Get intent
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found',
        },
        404
      );
    }

    // Verify intent's run's project belongs to tenant
    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found',
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
          message: 'Intent not found',
        },
        404
      );
    }

    // Get LP variants for the intent
    const lpVariants = await repos.lpVariant.findByIntentId(intentId, { limit: 100 });

    // Get Creative variants for the intent
    const creativeVariants = await repos.creativeVariant.findByIntentId(intentId, { limit: 100 });

    // Get Ad copies for the intent
    const adCopies = await repos.adCopy.findByIntentId(intentId, { limit: 100 });

    // Build metrics response
    // In a real implementation, these would be calculated from event data
    // For now, return placeholder metrics based on variant counts
    const metrics = {
      intentId: intent.id,
      intentTitle: intent.title,
      summary: {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        spend: 0,
        ctr: 0,
        cvr: 0,
        cpa: null as number | null,
      },
      variants: {
        lp: {
          total: lpVariants.total,
          byStatus: {
            draft: lpVariants.items.filter((v) => v.approvalStatus === 'draft').length,
            submitted: lpVariants.items.filter((v) => v.approvalStatus === 'submitted').length,
            approved: lpVariants.items.filter((v) => v.approvalStatus === 'approved').length,
            rejected: lpVariants.items.filter((v) => v.approvalStatus === 'rejected').length,
          },
          items: lpVariants.items.map((v) => ({
            id: v.id,
            version: v.version,
            status: v.status,
            approvalStatus: v.approvalStatus,
            publishedUrl: v.publishedUrl,
            // Placeholder metrics - would be calculated from events
            impressions: 0,
            clicks: 0,
            conversions: 0,
          })),
        },
        creative: {
          total: creativeVariants.total,
          bySize: {
            '1:1': creativeVariants.items.filter((v) => v.size === '1:1').length,
            '4:5': creativeVariants.items.filter((v) => v.size === '4:5').length,
            '9:16': creativeVariants.items.filter((v) => v.size === '9:16').length,
          },
          items: creativeVariants.items.map((v) => ({
            id: v.id,
            size: v.size,
            version: v.version,
            status: v.status,
            approvalStatus: v.approvalStatus,
            // Placeholder metrics
            impressions: 0,
            clicks: 0,
          })),
        },
        adCopy: {
          total: adCopies.total,
          byStatus: {
            draft: adCopies.items.filter((v) => v.approvalStatus === 'draft').length,
            submitted: adCopies.items.filter((v) => v.approvalStatus === 'submitted').length,
            approved: adCopies.items.filter((v) => v.approvalStatus === 'approved').length,
            rejected: adCopies.items.filter((v) => v.approvalStatus === 'rejected').length,
          },
          items: adCopies.items.map((v) => ({
            id: v.id,
            version: v.version,
            status: v.status,
            approvalStatus: v.approvalStatus,
            headline: v.headline,
            // Placeholder metrics
            impressions: 0,
            clicks: 0,
          })),
        },
      },
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
        operationMode: run.operationMode,
      },
      generatedAt: new Date().toISOString(),
    };

    return c.json({
      status: 'ok',
      data: metrics,
    });
  });

  /**
   * POST /intents/:id/metrics - Update metrics for an intent (record event data)
   *
   * Accepts event data to update intent metrics
   */
  intents.post('/intents/:id/metrics', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('id');

    // Get intent
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found',
        },
        404
      );
    }

    // Verify intent's run's project belongs to tenant
    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Intent not found',
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
          message: 'Intent not found',
        },
        404
      );
    }

    // Parse request body
    interface MetricsUpdateRequest {
      variantId?: string;
      variantType?: 'lp' | 'creative' | 'adCopy';
      impressions?: number;
      clicks?: number;
      conversions?: number;
      spend?: number;
    }

    let body: MetricsUpdateRequest;
    try {
      body = await c.req.json<MetricsUpdateRequest>();
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

    // In a real implementation, this would:
    // 1. Validate the variant belongs to this intent
    // 2. Store the metrics update in a metrics table
    // 3. Trigger any necessary recalculations

    // For now, return a success acknowledgment
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'update',
      targetType: 'intent_metrics',
      targetId: intentId,
      after: {
        intentId,
        variantId: body.variantId,
        variantType: body.variantType,
        metricsUpdate: {
          impressions: body.impressions,
          clicks: body.clicks,
          conversions: body.conversions,
          spend: body.spend,
        },
      },
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        intentId,
        message: 'Metrics update recorded',
        recordedAt: new Date().toISOString(),
      },
    });
  });

  return intents;
}

export const intentRoutes = createIntentRoutes();
