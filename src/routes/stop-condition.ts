/**
 * Stop Condition Routes
 * Handles stop rules evaluation and retrieval endpoints
 *
 * POST /internal/stop-rules/evaluate - Evaluate stop rules (Cron/Queue trigger)
 * GET /runs/:runId/stop-rules - Get stop rules for a run
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import type { AuditAction } from '../types/auth.js';
import {
  createStopConditionService,
  type EvaluateStopRulesRequest,
} from '../services/stop-condition.js';
import { createD1Repositories } from '../repositories/factory.js';

type StopConditionEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Evaluate request body
 */
interface EvaluateRequestBody {
  /** Specific run ID to evaluate (optional) */
  runId?: string;
  /** Force evaluation ignoring gating conditions */
  forceEvaluate?: boolean;
}

/**
 * Create stop condition routes
 */
export function createStopConditionRoutes() {
  const routes = new Hono<StopConditionEnv>();

  // Apply auth middleware to all routes
  routes.use('*', authMiddleware());

  /**
   * POST /internal/stop-rules/evaluate
   * Evaluate stop rules for active runs
   *
   * This endpoint is designed to be called by:
   * - Cron Triggers (scheduled evaluation every N minutes)
   * - Queue consumers (on-demand evaluation)
   *
   * Request body:
   * - runId?: string - Specific run to evaluate (optional, evaluates all active runs if not provided)
   * - forceEvaluate?: boolean - Force evaluation ignoring gating conditions
   *
   * Response:
   * - evaluatedAt: string - Evaluation timestamp
   * - runsEvaluated: number - Number of runs evaluated
   * - results: array - Per-run evaluation results
   * - hasErrors: boolean - Whether any errors occurred
   */
  routes.post('/internal/stop-rules/evaluate', requirePermission('run', 'launch'), async (c) => {
    const authContext = c.get('auth');
    const service = createStopConditionService(c.env.DB, authContext.tenantId);

    // Parse request body
    let body: EvaluateRequestBody = {};
    try {
      const rawBody = await c.req.text();
      if (rawBody && rawBody.trim()) {
        body = JSON.parse(rawBody);
      }
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

    // Validate runId if provided
    if (body.runId && typeof body.runId !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'runId must be a string',
        },
        400
      );
    }

    // If runId is provided, verify it belongs to tenant
    if (body.runId) {
      const repos = createD1Repositories(c.env.DB);
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

      const belongsToTenant = await repos.project.belongsToTenant(
        run.projectId,
        authContext.tenantId
      );
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
    }

    // Build evaluation request
    const request: EvaluateStopRulesRequest = {
      runId: body.runId,
      forceEvaluate: body.forceEvaluate,
    };

    // Execute evaluation
    const result = await service.evaluate(request);

    // Record in audit log if any rules were triggered
    const triggeredResults = result.results.filter(
      (r) => r.evaluation && r.evaluation.rulesTriggered > 0
    );
    if (triggeredResults.length > 0) {
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'stop_rules_evaluate',
        targetType: 'run',
        targetId: body.runId ?? 'all_active_runs',
        before: {},
        after: {
          runsEvaluated: result.runsEvaluated,
          triggeredRuns: triggeredResults.map((r) => ({
            runId: r.runId,
            rulesTriggered: r.evaluation?.rulesTriggered,
            actions: r.evaluation?.actions.map((a) => a.type),
          })),
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });
    }

    return c.json({
      status: 'ok',
      data: result,
    });
  });

  /**
   * GET /runs/:runId/stop-rules
   * Get stop rules configuration for a specific run
   *
   * Response:
   * - runId: string - Run ID
   * - hasStopRules: boolean - Whether stop rules are configured
   * - dsl?: object - Parsed DSL (if valid)
   * - validation?: object - Validation results
   * - lastEvaluatedAt?: string - Last evaluation timestamp
   */
  routes.get('/runs/:runId/stop-rules', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const runId = c.req.param('runId');
    const repos = createD1Repositories(c.env.DB);

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

    const belongsToTenant = await repos.project.belongsToTenant(
      run.projectId,
      authContext.tenantId
    );
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

    // Get stop rules
    const service = createStopConditionService(c.env.DB, authContext.tenantId);
    const result = await service.getStopRules(runId);

    return c.json({
      status: 'ok',
      data: result,
    });
  });

  return routes;
}

/**
 * Create internal stop condition routes (for Cron/Queue)
 * These routes are mounted separately and may have different auth requirements
 */
export function createInternalStopConditionRoutes() {
  const routes = new Hono<StopConditionEnv>();

  // Apply auth middleware
  routes.use('*', authMiddleware());

  /**
   * POST /evaluate
   * Internal endpoint for Cron/Queue triggered evaluation
   */
  routes.post('/evaluate', requirePermission('run', 'launch'), async (c) => {
    const authContext = c.get('auth');
    const service = createStopConditionService(c.env.DB, authContext.tenantId);

    // Parse request body
    let body: EvaluateRequestBody = {};
    try {
      const rawBody = await c.req.text();
      if (rawBody && rawBody.trim()) {
        body = JSON.parse(rawBody);
      }
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

    // If runId is provided, verify it belongs to tenant
    if (body.runId) {
      const repos = createD1Repositories(c.env.DB);
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

      const belongsToTenant = await repos.project.belongsToTenant(
        run.projectId,
        authContext.tenantId
      );
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
    }

    // Execute evaluation
    const request: EvaluateStopRulesRequest = {
      runId: body.runId,
      forceEvaluate: body.forceEvaluate,
    };

    const result = await service.evaluate(request);

    // Record in audit log if any rules were triggered
    const triggeredResults = result.results.filter(
      (r) => r.evaluation && r.evaluation.rulesTriggered > 0
    );
    if (triggeredResults.length > 0) {
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'stop_rules_evaluate_internal',
        targetType: 'run',
        targetId: body.runId ?? 'all_active_runs',
        before: {},
        after: {
          runsEvaluated: result.runsEvaluated,
          triggeredRuns: triggeredResults.map((r) => ({
            runId: r.runId,
            rulesTriggered: r.evaluation?.rulesTriggered,
            actions: r.evaluation?.actions.map((a) => a.type),
          })),
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });
    }

    return c.json({
      status: 'ok',
      data: result,
    });
  });

  return routes;
}

export const stopConditionRoutes = createStopConditionRoutes();
export const internalStopConditionRoutes = createInternalStopConditionRoutes();
