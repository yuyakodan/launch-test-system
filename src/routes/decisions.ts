/**
 * Decision Routes
 * Handles decision and report endpoints for runs
 *
 * POST /runs/:id/decide - Make a decision for a run
 * GET /runs/:id/report - Get report for a run
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';
import { evaluateConfidence, createVariantMetrics } from '../services/statistics/confidence-evaluator.js';
import { RunStateMachine } from '../services/run-state-machine.js';
import type { DecisionResult, VariantMetrics } from '../types/statistics.js';

type DecisionEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Decision request body with variant metrics
 */
interface DecideRequest {
  /** Variant metrics for analysis */
  variants: Array<{
    variantId: string;
    clicks: number;
    conversions: number;
  }>;
  /** Whether to finalize the decision */
  finalize?: boolean;
}

/**
 * Create decision routes
 */
export function createDecisionRoutes() {
  const decisions = new Hono<DecisionEnv>();

  // Apply auth middleware to all routes
  decisions.use('*', authMiddleware());

  /**
   * POST /runs/:id/decide - Make a decision for a run
   *
   * Analyzes variant performance and determines the winner
   * Can optionally finalize the decision
   */
  decisions.post('/runs/:id/decide', requirePermission('decision', 'create'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

    // Get run
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

    // Run must be in Running, Paused, or Completed state
    if (!['Running', 'Paused', 'Completed'].includes(run.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot make decision for run in ${run.status} status. Run must be Running, Paused, or Completed.`,
        },
        400
      );
    }

    // Parse request body
    let body: DecideRequest;
    try {
      body = await c.req.json<DecideRequest>();
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

    // Validate variants
    if (!body.variants || !Array.isArray(body.variants) || body.variants.length === 0) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'At least one variant is required',
        },
        400
      );
    }

    // Validate each variant
    for (const v of body.variants) {
      if (!v.variantId || typeof v.variantId !== 'string') {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: 'Each variant must have a variantId',
          },
          400
        );
      }
      if (typeof v.clicks !== 'number' || v.clicks < 0) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: 'clicks must be a non-negative number',
          },
          400
        );
      }
      if (typeof v.conversions !== 'number' || v.conversions < 0) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: 'conversions must be a non-negative number',
          },
          400
        );
      }
    }

    // Convert to VariantMetrics
    const variantMetrics: VariantMetrics[] = body.variants.map((v) =>
      createVariantMetrics(v.variantId, v.clicks, v.conversions)
    );

    // Evaluate confidence
    const decisionResult: DecisionResult = evaluateConfidence(variantMetrics);

    // Build response data
    const responseData = {
      runId,
      confidence: decisionResult.confidence,
      winnerId: decisionResult.winnerId,
      ranking: decisionResult.ranking.map((entry) => ({
        rank: entry.rank,
        variantId: entry.variantId,
        clicks: entry.metrics.clicks,
        conversions: entry.metrics.conversions,
        cvr: entry.metrics.cvr,
        score: entry.score,
        bayesianWinProbability: entry.bayesianWinProbability,
        wilsonCi: {
          lower: entry.wilsonCi.lower,
          upper: entry.wilsonCi.upper,
          point: entry.wilsonCi.point,
        },
      })),
      rationale: decisionResult.rationale,
      recommendation: decisionResult.recommendation,
      additionalSamplesNeeded: decisionResult.additionalSamplesNeeded,
      finalized: false,
      analyzedAt: new Date().toISOString(),
    };

    // If finalize is true and we have a confident result, mark run as completed
    if (body.finalize && decisionResult.confidence === 'confident') {
      if (RunStateMachine.isValidTransition(run.status, 'Completed')) {
        await repos.run.markCompleted(runId);
        responseData.finalized = true;

        // Record in audit log
        const auditService = new AuditService(c.env.DB);
        await auditService.log({
          tenantId: authContext.tenantId,
          actorUserId: authContext.userId,
          action: 'complete',
          targetType: 'run',
          targetId: runId,
          before: {
            status: run.status,
          },
          after: {
            status: 'Completed',
            winnerId: decisionResult.winnerId,
            confidence: decisionResult.confidence,
          },
          requestId: authContext.requestId,
          ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
          userAgent: c.req.header('User-Agent') ?? undefined,
        });
      }
    }

    return c.json({
      status: 'ok',
      data: responseData,
    });
  });

  /**
   * GET /runs/:id/report - Get report for a run
   *
   * Returns a summary report of the run's performance
   */
  decisions.get('/runs/:id/report', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

    // Get run
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

    // Get project for additional context
    const project = await repos.project.findById(run.projectId);

    // Get intents for the run
    const intentsResult = await repos.intent.findByRunId(runId, { limit: 100 });

    // Calculate run duration
    let durationMs: number | null = null;
    if (run.launchedAt) {
      const endTime = run.completedAt ? new Date(run.completedAt) : new Date();
      const startTime = new Date(run.launchedAt);
      durationMs = endTime.getTime() - startTime.getTime();
    }

    // Get status info
    const statusInfo = RunStateMachine.getStatusInfo(run.status);

    // Build report
    const report = {
      run: {
        id: run.id,
        name: run.name,
        status: run.status,
        statusInfo,
        operationMode: run.operationMode,
        projectId: run.projectId,
        projectName: project?.name ?? null,
        createdAt: run.createdAt,
        launchedAt: run.launchedAt,
        completedAt: run.completedAt,
        durationMs,
        durationFormatted: durationMs ? formatDuration(durationMs) : null,
      },
      configuration: {
        runDesign: safeJsonParse(run.runDesignJson),
        stopRules: safeJsonParse(run.stopDslJson),
        decisionRules: safeJsonParse(run.decisionRulesJson),
      },
      intents: {
        total: intentsResult.total,
        byStatus: {
          active: intentsResult.items.filter((i) => i.status === 'active').length,
          paused: intentsResult.items.filter((i) => i.status === 'paused').length,
          archived: intentsResult.items.filter((i) => i.status === 'archived').length,
        },
        items: intentsResult.items.map((intent) => ({
          id: intent.id,
          title: intent.title,
          hypothesis: intent.hypothesis,
          priority: intent.priority,
          status: intent.status,
        })),
      },
      generatedAt: new Date().toISOString(),
    };

    return c.json({
      status: 'ok',
      data: report,
    });
  });

  return decisions;
}

/**
 * Safely parse JSON, returning null on error
 */
function safeJsonParse(json: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

export const decisionRoutes = createDecisionRoutes();
