/**
 * Decision Routes
 * Handles decision and report endpoints for runs
 *
 * POST /runs/:id/decide - Make a decision for a run with statistical analysis
 * GET /runs/:id/report - Get report for a run including decision data
 * GET /runs/:id/decisions - Get decision history for a run
 * GET /runs/:id/decisions/:decisionId - Get a specific decision
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';
import { RunStateMachine } from '../services/run-state-machine.js';
import {
  analyzeVariants,
  parseDecisionConfig,
  DecisionService,
  DEFAULT_SAMPLE_THRESHOLDS,
  DEFAULT_CONFIDENCE_THRESHOLDS,
} from '../services/decision.js';

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
  /** Whether to finalize the decision and save to database */
  finalize?: boolean;
  /** Whether to persist the decision as draft (even if not finalized) */
  persist?: boolean;
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
   * Analyzes variant performance using statistical methods (Wilson CI and Bayesian)
   * Determines confidence level: insufficient, directional, or confident
   * Can persist decision to database and optionally finalize it
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

    // Parse decision config from run design
    const decisionConfig = parseDecisionConfig(run.runDesignJson);

    // Run statistical analysis using the Decision Service
    const analysisResult = analyzeVariants(body.variants, decisionConfig);

    // Build response data
    const responseData: Record<string, unknown> = {
      runId,
      confidence: analysisResult.confidence,
      winnerId: analysisResult.winnerId,
      winnerInfo: analysisResult.winnerInfo,
      ranking: analysisResult.ranking,
      stats: analysisResult.stats,
      rationale: analysisResult.rationale,
      recommendation: analysisResult.recommendation,
      additionalSamplesNeeded: analysisResult.additionalSamplesNeeded,
      finalized: false,
      persisted: false,
      decisionId: null,
      analyzedAt: new Date().toISOString(),
    };

    // Persist decision if requested or finalize is true
    const shouldPersist = body.persist || body.finalize;
    const shouldFinalize = body.finalize && analysisResult.confidence === 'confident';

    if (shouldPersist) {
      const decisionService = new DecisionService(repos.decision);

      try {
        const decision = await decisionService.createDecision(
          runId,
          analysisResult,
          authContext.userId,
          shouldFinalize
        );

        responseData.persisted = true;
        responseData.decisionId = decision.id;

        if (shouldFinalize) {
          responseData.finalized = true;

          // If finalized and run can transition to Completed, update run status
          if (RunStateMachine.isValidTransition(run.status, 'Completed')) {
            await repos.run.markCompleted(runId);

            // Record in audit log
            const auditService = new AuditService(c.env.DB);
            await auditService.log({
              tenantId: authContext.tenantId,
              actorUserId: authContext.userId,
              action: 'decision.finalize',
              targetType: 'run',
              targetId: runId,
              before: {
                status: run.status,
              },
              after: {
                status: 'Completed',
                decisionId: decision.id,
                winnerId: analysisResult.winnerId,
                confidence: analysisResult.confidence,
              },
              requestId: authContext.requestId,
              ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
              userAgent: c.req.header('User-Agent') ?? undefined,
            });
          }
        }
      } catch (error) {
        // Log error but continue with response (analysis result is still valid)
        console.error('Failed to persist decision:', error);
      }
    }

    return c.json({
      status: 'ok',
      data: responseData,
    });
  });

  /**
   * GET /runs/:id/decisions - Get decision history for a run
   */
  decisions.get('/runs/:id/decisions', requirePermission('run', 'read'), async (c) => {
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

    // Get pagination params
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Get decisions
    const decisionService = new DecisionService(repos.decision);
    const result = await decisionService.getDecisionHistory(runId);

    // Parse JSON fields for response
    const items = result.items.map((d) => ({
      id: d.id,
      runId: d.runId,
      status: d.status,
      confidence: d.confidence,
      winner: safeJsonParse(d.winnerJson),
      ranking: safeJsonParse(d.rankingJson),
      stats: safeJsonParse(d.statsJson),
      rationale: d.rationale,
      decidedAt: d.decidedAt,
      createdByUserId: d.createdByUserId,
      createdAt: d.createdAt,
    }));

    return c.json({
      status: 'ok',
      data: {
        items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * GET /runs/:id/decisions/:decisionId - Get a specific decision
   */
  decisions.get('/runs/:id/decisions/:decisionId', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');
    const decisionId = c.req.param('decisionId');

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

    // Get decision
    const decision = await repos.decision.findById(decisionId);
    if (!decision || decision.runId !== runId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Decision not found',
        },
        404
      );
    }

    return c.json({
      status: 'ok',
      data: {
        id: decision.id,
        runId: decision.runId,
        status: decision.status,
        confidence: decision.confidence,
        winner: safeJsonParse(decision.winnerJson),
        ranking: safeJsonParse(decision.rankingJson),
        stats: safeJsonParse(decision.statsJson),
        rationale: decision.rationale,
        decidedAt: decision.decidedAt,
        createdByUserId: decision.createdByUserId,
        createdAt: decision.createdAt,
      },
    });
  });

  /**
   * GET /runs/:id/report - Get report for a run
   *
   * Returns a summary report of the run's performance including decision data
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

    // Get latest decision
    const decisionService = new DecisionService(repos.decision);
    const latestDecision = await decisionService.getLatestDecision(runId);
    const finalDecision = await decisionService.getFinalDecision(runId);

    // Calculate run duration
    let durationMs: number | null = null;
    if (run.launchedAt) {
      const endTime = run.completedAt ? new Date(run.completedAt) : new Date();
      const startTime = new Date(run.launchedAt);
      durationMs = endTime.getTime() - startTime.getTime();
    }

    // Get status info
    const statusInfo = RunStateMachine.getStatusInfo(run.status);

    // Parse decision config from run design
    const decisionConfig = parseDecisionConfig(run.runDesignJson);

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
        sampleThresholds: decisionConfig.sampleThresholds,
        confidenceThresholds: decisionConfig.confidenceThresholds,
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
      decision: {
        hasFinalDecision: !!finalDecision,
        finalDecision: finalDecision
          ? {
              id: finalDecision.id,
              confidence: finalDecision.confidence,
              winner: safeJsonParse(finalDecision.winnerJson),
              ranking: safeJsonParse(finalDecision.rankingJson),
              rationale: finalDecision.rationale,
              decidedAt: finalDecision.decidedAt,
            }
          : null,
        latestDecision: latestDecision
          ? {
              id: latestDecision.id,
              status: latestDecision.status,
              confidence: latestDecision.confidence,
              winner: safeJsonParse(latestDecision.winnerJson),
              ranking: safeJsonParse(latestDecision.rankingJson),
              rationale: latestDecision.rationale,
              createdAt: latestDecision.createdAt,
            }
          : null,
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
function safeJsonParse(json: string): Record<string, unknown> | unknown[] | null {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed;
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
