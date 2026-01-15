/**
 * Generation Routes
 * Handles LP, Banner, and Ad Copy generation endpoints
 *
 * POST /runs/:runId/generate - Submit generation job
 * GET /runs/:runId/jobs - List generation jobs for a run
 * POST /jobs/:jobId/retry - Retry a failed job
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createGenerationService, type GenerationServiceDeps } from '../services/generation.js';
import { createD1Repositories } from '../repositories/factory.js';
import { ulid } from '../lib/ulid.js';
import type {
  GenerationJobType,
  GenerationOptions,
  BannerSize,
  GenerateRequest,
  GenerateResponse,
  GenerationJobInfo,
  ListJobsResponse,
} from '../types/generation.js';
import type { JobStatus } from '../types/entities.js';

type GenerationEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Validate generation job type
 */
function isValidJobType(type: unknown): type is GenerationJobType {
  return typeof type === 'string' && ['lp', 'banner', 'ad_copy', 'all'].includes(type);
}

/**
 * Validate banner size
 */
function isValidBannerSize(size: unknown): size is BannerSize {
  return typeof size === 'string' && ['1:1', '4:5', '9:16'].includes(size);
}

/**
 * Create generation routes
 */
export function createGenerationRoutes() {
  const generation = new Hono<GenerationEnv>();

  // Apply auth middleware to all routes
  generation.use('*', authMiddleware());

  /**
   * POST /runs/:runId/generate - Submit generation job
   *
   * Request body:
   * - jobType: 'lp' | 'banner' | 'ad_copy' | 'all'
   * - intentIds?: string[] (optional, all active intents if not specified)
   * - options?: GenerationOptions
   *
   * Response:
   * - jobId: string
   * - runId: string
   * - jobType: string
   * - status: string
   * - createdAt: string
   */
  generation.post('/runs/:runId/generate', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Verify run exists
    const run = await repos.run.findById(runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        } satisfies GenerateResponse,
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
        } satisfies GenerateResponse,
        404
      );
    }

    // Verify run is in valid status for generation
    const validStatuses = ['Draft', 'Designing', 'Generating'];
    if (!validStatuses.includes(run.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot generate for run in ${run.status} status. Valid statuses: ${validStatuses.join(', ')}`,
        } satisfies GenerateResponse,
        400
      );
    }

    // Parse request body
    let body: GenerateRequest;
    try {
      body = await c.req.json<GenerateRequest>();
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Invalid JSON body',
        } satisfies GenerateResponse,
        400
      );
    }

    // Validate jobType
    if (!body.jobType || !isValidJobType(body.jobType)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'jobType is required and must be one of: lp, banner, ad_copy, all',
        } satisfies GenerateResponse,
        400
      );
    }

    // Validate intentIds if provided
    if (body.intentIds !== undefined) {
      if (!Array.isArray(body.intentIds)) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: 'intentIds must be an array of strings',
          } satisfies GenerateResponse,
          400
        );
      }

      // Verify all intents exist and belong to this run
      for (const intentId of body.intentIds) {
        const belongsToRun = await repos.intent.belongsToRun(intentId, runId);
        if (!belongsToRun) {
          return c.json(
            {
              status: 'error',
              error: 'invalid_request',
              message: `Intent ${intentId} does not belong to run ${runId}`,
            } satisfies GenerateResponse,
            400
          );
        }
      }
    }

    // Validate options if provided
    if (body.options) {
      const options = body.options;

      // Validate lpVariantsPerIntent
      if (
        options.lpVariantsPerIntent !== undefined &&
        (typeof options.lpVariantsPerIntent !== 'number' ||
          options.lpVariantsPerIntent < 1 ||
          options.lpVariantsPerIntent > 10)
      ) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: 'lpVariantsPerIntent must be a number between 1 and 10',
          } satisfies GenerateResponse,
          400
        );
      }

      // Validate bannerSizes
      if (options.bannerSizes !== undefined) {
        if (!Array.isArray(options.bannerSizes)) {
          return c.json(
            {
              status: 'error',
              error: 'invalid_request',
              message: 'bannerSizes must be an array',
            } satisfies GenerateResponse,
            400
          );
        }

        for (const size of options.bannerSizes) {
          if (!isValidBannerSize(size)) {
            return c.json(
              {
                status: 'error',
                error: 'invalid_request',
                message: `Invalid banner size: ${size}. Valid sizes: 1:1, 4:5, 9:16`,
              } satisfies GenerateResponse,
              400
            );
          }
        }
      }

      // Validate adCopyVariantsPerIntent
      if (
        options.adCopyVariantsPerIntent !== undefined &&
        (typeof options.adCopyVariantsPerIntent !== 'number' ||
          options.adCopyVariantsPerIntent < 1 ||
          options.adCopyVariantsPerIntent > 10)
      ) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_request',
            message: 'adCopyVariantsPerIntent must be a number between 1 and 10',
          } satisfies GenerateResponse,
          400
        );
      }
    }

    // Create generation service
    const generationDeps: GenerationServiceDeps = {
      intentRepo: repos.intent,
      lpVariantRepo: repos.lpVariant,
      creativeVariantRepo: repos.creativeVariant,
      adCopyRepo: repos.adCopy,
      runRepo: repos.run,
      projectRepo: repos.project,
      storage: c.env.STORAGE,
      queue: c.env.TASK_QUEUE,
    };
    const generationService = createGenerationService(generationDeps);

    try {
      // Submit generation job
      const job = await generationService.submitGenerationJob(
        runId,
        authContext.tenantId,
        body.jobType,
        body.intentIds,
        body.options
      );

      if (!job) {
        return c.json(
          {
            status: 'error',
            error: 'job_creation_failed',
            message: 'Failed to create generation job',
          } satisfies GenerateResponse,
          500
        );
      }

      // Record in audit log
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'generate',
        targetType: 'run',
        targetId: runId,
        after: {
          jobId: job.id,
          jobType: body.jobType,
          intentIds: body.intentIds,
          options: body.options,
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json(
        {
          status: 'ok',
          data: {
            jobId: job.id,
            runId: runId,
            jobType: body.jobType,
            status: job.status,
            createdAt: job.createdAt,
          },
        } satisfies GenerateResponse,
        201
      );
    } catch (error) {
      return c.json(
        {
          status: 'error',
          error: 'generation_failed',
          message: error instanceof Error ? error.message : 'Generation failed',
        } satisfies GenerateResponse,
        500
      );
    }
  });

  /**
   * GET /runs/:runId/jobs - List generation jobs for a run
   *
   * Query parameters:
   * - status?: string (filter by job status)
   * - jobType?: string (filter by job type)
   * - limit?: number (default: 100)
   * - offset?: number (default: 0)
   *
   * Response:
   * - items: GenerationJobInfo[]
   * - total: number
   * - limit: number
   * - offset: number
   * - hasMore: boolean
   */
  generation.get('/runs/:runId/jobs', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Verify run exists
    const run = await repos.run.findById(runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        } satisfies ListJobsResponse,
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
        } satisfies ListJobsResponse,
        404
      );
    }

    // Parse query parameters
    const statusFilter = c.req.query('status') as JobStatus | undefined;
    const jobTypeFilter = c.req.query('jobType');
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Query jobs from database
    // Note: In a full implementation, this would query the jobs table
    // For now, we return a placeholder response
    const jobItems: GenerationJobInfo[] = [];

    // Build SQL query
    let sql = `
      SELECT id, tenant_id, job_type, status, payload_json, result_json,
             attempts, max_attempts, last_error, created_at, updated_at
      FROM jobs
      WHERE tenant_id = ? AND job_type = 'generate'
    `;
    const params: unknown[] = [authContext.tenantId];

    // Add filter for runId (check payload_json)
    sql += ` AND json_extract(payload_json, '$.runId') = ?`;
    params.push(runId);

    // Add status filter
    if (statusFilter) {
      sql += ` AND status = ?`;
      params.push(statusFilter);
    }

    // Add order and pagination
    sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    try {
      const stmt = c.env.DB.prepare(sql);
      const result = await stmt.bind(...params).all<{
        id: string;
        tenant_id: string;
        job_type: string;
        status: JobStatus;
        payload_json: string;
        result_json: string;
        attempts: number;
        max_attempts: number;
        last_error: string;
        created_at: string;
        updated_at: string;
      }>();

      for (const row of result.results) {
        const payload = JSON.parse(row.payload_json) as { jobType?: string };
        const resultData = JSON.parse(row.result_json);

        // Filter by jobType if specified
        if (jobTypeFilter && payload.jobType !== jobTypeFilter) {
          continue;
        }

        jobItems.push({
          id: row.id,
          runId: runId,
          jobType: payload.jobType || 'generate',
          status: row.status,
          attempts: row.attempts,
          maxAttempts: row.max_attempts,
          lastError: row.last_error || undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          result: Object.keys(resultData).length > 0 ? resultData : undefined,
        });
      }

      // Get total count
      let countSql = `
        SELECT COUNT(*) as count
        FROM jobs
        WHERE tenant_id = ? AND job_type = 'generate'
        AND json_extract(payload_json, '$.runId') = ?
      `;
      const countParams: unknown[] = [authContext.tenantId, runId];

      if (statusFilter) {
        countSql += ` AND status = ?`;
        countParams.push(statusFilter);
      }

      const countStmt = c.env.DB.prepare(countSql);
      const countResult = await countStmt.bind(...countParams).first<{ count: number }>();
      const total = countResult?.count ?? 0;

      return c.json({
        status: 'ok',
        data: {
          items: jobItems,
          total,
          limit,
          offset,
          hasMore: offset + jobItems.length < total,
        },
      } satisfies ListJobsResponse);
    } catch (error) {
      // If jobs table doesn't exist yet, return empty list
      console.error('Error querying jobs:', error);
      return c.json({
        status: 'ok',
        data: {
          items: [],
          total: 0,
          limit,
          offset,
          hasMore: false,
        },
      } satisfies ListJobsResponse);
    }
  });

  /**
   * POST /jobs/:jobId/retry - Retry a failed job
   *
   * Response:
   * - jobId: string
   * - status: string
   * - updatedAt: string
   */
  generation.post('/jobs/:jobId/retry', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const jobId = c.req.param('jobId');

    // Query job from database
    const sql = `
      SELECT id, tenant_id, job_type, status, payload_json, result_json,
             attempts, max_attempts, last_error, created_at, updated_at
      FROM jobs
      WHERE id = ? AND tenant_id = ?
    `;

    try {
      const stmt = c.env.DB.prepare(sql);
      const job = await stmt.bind(jobId, authContext.tenantId).first<{
        id: string;
        tenant_id: string;
        job_type: string;
        status: JobStatus;
        payload_json: string;
        result_json: string;
        attempts: number;
        max_attempts: number;
        last_error: string;
        created_at: string;
        updated_at: string;
      }>();

      if (!job) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Job not found',
          },
          404
        );
      }

      // Verify job is in failed status
      if (job.status !== 'failed') {
        return c.json(
          {
            status: 'error',
            error: 'invalid_status',
            message: `Cannot retry job in ${job.status} status. Only failed jobs can be retried.`,
          },
          400
        );
      }

      // Check if max attempts reached
      if (job.attempts >= job.max_attempts) {
        return c.json(
          {
            status: 'error',
            error: 'max_attempts_reached',
            message: `Job has reached maximum attempts (${job.max_attempts})`,
          },
          400
        );
      }

      // Update job status to queued
      const updateSql = `
        UPDATE jobs
        SET status = 'queued', updated_at = ?
        WHERE id = ?
      `;
      const now = new Date().toISOString();
      await c.env.DB.prepare(updateSql).bind(now, jobId).run();

      // Re-queue the job
      const payload = JSON.parse(job.payload_json);
      await c.env.TASK_QUEUE.send({
        type: 'generate',
        payload: {
          ...payload,
          retry: true,
          jobId,
        },
        timestamp: now,
      });

      // Record in audit log
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'retry',
        targetType: 'job',
        targetId: jobId,
        before: { status: job.status },
        after: { status: 'queued' },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json({
        status: 'ok',
        data: {
          jobId,
          status: 'queued',
          updatedAt: now,
        },
      });
    } catch (error) {
      console.error('Error retrying job:', error);
      return c.json(
        {
          status: 'error',
          error: 'retry_failed',
          message: error instanceof Error ? error.message : 'Failed to retry job',
        },
        500
      );
    }
  });

  return generation;
}

export const generationRoutes = createGenerationRoutes();
