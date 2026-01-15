/**
 * Report Routes
 * Handles report generation and retrieval endpoints
 *
 * GET /runs/:runId/report - Get report for a run
 * POST /internal/report/generate - Generate report job (internal endpoint)
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';
import { ReportService, createReportService } from '../services/report.js';
import { ulid } from '../lib/ulid.js';
import type { GenerateReportRequest, ReportJobPayload } from '../types/report.js';

type ReportEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create report routes
 */
export function createReportRoutes() {
  const report = new Hono<ReportEnv>();

  // Apply auth middleware to all routes
  report.use('*', authMiddleware());

  /**
   * GET /runs/:runId/report - Get report for a run
   *
   * Generates and returns a comprehensive report including:
   * - Run summary (period, budget, mode)
   * - Intent/Variant performance (impressions, clicks, cost, conversions, CVR, CPA, CTR)
   * - Statistical decision results (Insufficient/Directional/Confident)
   * - Winner information with rationale
   * - Additional budget proposals for Insufficient cases
   * - Next Run generation proposals
   */
  report.get('/runs/:runId/report', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const runId = c.req.param('runId');

    // Parse query params for options
    const includeDetailedMetrics = c.req.query('detailed') === 'true';
    const generateNextRunProposal = c.req.query('nextRun') !== 'false';

    // Create report service and generate report
    const reportService = createReportService(c.env.DB);

    const result = await reportService.generateReport({
      runId,
      tenantId: authContext.tenantId,
      includeDetailedMetrics,
      generateNextRunProposal,
    });

    if (!result.success) {
      if (result.error === 'Run not found' || result.error === 'Run not found or access denied') {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Run not found',
          },
          404
        );
      }

      return c.json(
        {
          status: 'error',
          error: 'generation_failed',
          message: result.error || 'Failed to generate report',
        },
        500
      );
    }

    return c.json({
      status: 'ok',
      data: result.report,
      meta: {
        generationDurationMs: result.durationMs,
      },
    });
  });

  /**
   * POST /internal/report/generate - Generate report job (internal endpoint)
   *
   * This endpoint is used by Cron Triggers or Queue workers to generate reports
   * asynchronously. It creates a job record and queues the report generation.
   */
  report.post('/internal/report/generate', requirePermission('job', 'create'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: {
      runId: string;
      options?: {
        includeDetailedMetrics?: boolean;
        generateNextRunProposal?: boolean;
      };
    };

    try {
      body = await c.req.json();
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

    // Validate runId
    if (!body.runId || typeof body.runId !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'runId is required',
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

    // Create job record
    const jobId = ulid();
    const jobPayload: ReportJobPayload = {
      runId: body.runId,
      tenantId: authContext.tenantId,
      requestedAt: new Date().toISOString(),
      requestedByUserId: authContext.userId,
      options: body.options,
    };

    // Insert job into database
    const insertJobQuery = `
      INSERT INTO jobs (id, tenant_id, job_type, status, payload_json, result_json, attempts, max_attempts, last_error, created_at, updated_at)
      VALUES (?, ?, 'report', 'queued', ?, '{}', 0, 3, '', ?, ?)
    `;

    const now = new Date().toISOString();
    await c.env.DB.prepare(insertJobQuery)
      .bind(jobId, authContext.tenantId, JSON.stringify(jobPayload), now, now)
      .run();

    // Queue the job for async processing
    try {
      await c.env.TASK_QUEUE.send({
        type: 'report_generate',
        payload: { jobId, ...jobPayload },
        timestamp: now,
      });
    } catch (queueError) {
      // If queue fails, update job status
      await c.env.DB.prepare('UPDATE jobs SET status = ?, last_error = ?, updated_at = ? WHERE id = ?')
        .bind('failed', 'Failed to queue job', now, jobId)
        .run();

      return c.json(
        {
          status: 'error',
          error: 'queue_failed',
          message: 'Failed to queue report generation job',
          jobId,
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'job',
      targetId: jobId,
      before: {},
      after: {
        jobType: 'report',
        status: 'queued',
        runId: body.runId,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        jobId,
        status: 'queued',
        runId: body.runId,
        message: 'Report generation job queued successfully',
      },
    });
  });

  /**
   * GET /internal/report/job/:jobId - Get report job status
   *
   * Check the status of an async report generation job
   */
  report.get('/internal/report/job/:jobId', requirePermission('job', 'read'), async (c) => {
    const authContext = c.get('auth');
    const jobId = c.req.param('jobId');

    // Fetch job from database
    const jobQuery = `
      SELECT id, tenant_id, job_type, status, payload_json, result_json, attempts, max_attempts, last_error, created_at, updated_at
      FROM jobs
      WHERE id = ? AND tenant_id = ?
    `;

    const result = await c.env.DB.prepare(jobQuery).bind(jobId, authContext.tenantId).first();

    if (!result) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Job not found',
        },
        404
      );
    }

    // Parse JSON fields
    let payload: ReportJobPayload | null = null;
    let jobResult: Record<string, unknown> | null = null;

    try {
      payload = JSON.parse((result.payload_json as string) || '{}');
    } catch {
      payload = null;
    }

    try {
      jobResult = JSON.parse((result.result_json as string) || '{}');
    } catch {
      jobResult = null;
    }

    return c.json({
      status: 'ok',
      data: {
        jobId: result.id,
        jobType: result.job_type,
        status: result.status,
        payload,
        result: jobResult,
        attempts: result.attempts,
        maxAttempts: result.max_attempts,
        lastError: result.last_error || null,
        createdAt: result.created_at,
        updatedAt: result.updated_at,
      },
    });
  });

  return report;
}

export const reportRoutes = createReportRoutes();
