/**
 * Jobs Routes
 * Handles job queue management endpoints
 *
 * GET /jobs - List jobs
 * GET /jobs/:id - Get job by ID
 * POST /jobs/:id/retry - Retry a failed job
 * POST /jobs/:id/cancel - Cancel a queued/running job
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type { JobType, JobStatus } from '../types/entities.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createJobsService } from '../services/jobs.js';

type JobEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create job routes
 */
export function createJobRoutes() {
  const jobs = new Hono<JobEnv>();

  // Apply auth middleware to all routes
  jobs.use('*', authMiddleware());

  /**
   * GET /jobs - List jobs
   *
   * Query parameters:
   * - jobType: string (optional filter)
   * - status: string (optional filter)
   * - limit: number (default: 100)
   * - offset: number (default: 0)
   */
  jobs.get('/', requirePermission('job', 'read'), async (c) => {
    const authContext = c.get('auth');
    const jobsService = createJobsService(c.env.DB);

    // Parse query parameters
    const jobType = c.req.query('jobType') as JobType | undefined;
    const status = c.req.query('status') as JobStatus | undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await jobsService.listJobsWithFilter(
      {
        tenantId: authContext.tenantId,
        jobType: jobType ?? undefined,
        status: status ?? undefined,
      },
      { limit, offset }
    );

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((job) => ({
          id: job.id,
          tenantId: job.tenantId,
          jobType: job.jobType,
          status: job.status,
          attempts: job.attempts,
          maxAttempts: job.maxAttempts,
          lastError: job.lastError,
          scheduledAt: job.scheduledAt,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * GET /jobs/stats - Get job statistics
   */
  jobs.get('/stats', requirePermission('job', 'read'), async (c) => {
    const authContext = c.get('auth');
    const jobsService = createJobsService(c.env.DB);

    const stats = await jobsService.getStats(authContext.tenantId);

    return c.json({
      status: 'ok',
      data: stats,
    });
  });

  /**
   * GET /jobs/:id - Get a job by ID
   */
  jobs.get('/:id', requirePermission('job', 'read'), async (c) => {
    const jobsService = createJobsService(c.env.DB);
    const jobId = c.req.param('id');

    const job = await jobsService.getJob(jobId);
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

    // Get payload and result as parsed objects
    const payload = jobsService.getJobPayload(job);
    const result = jobsService.getJobResult(job);

    return c.json({
      status: 'ok',
      data: {
        id: job.id,
        tenantId: job.tenantId,
        jobType: job.jobType,
        status: job.status,
        payload,
        result,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError,
        scheduledAt: job.scheduledAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        canRetry: job.attempts < job.maxAttempts && job.status === 'failed',
      },
    });
  });

  /**
   * POST /jobs/:id/retry - Retry a failed job
   */
  jobs.post('/:id/retry', requirePermission('job', 'update'), async (c) => {
    const authContext = c.get('auth');
    const jobsService = createJobsService(c.env.DB);
    const jobId = c.req.param('id');

    const job = await jobsService.getJob(jobId);
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

    // Verify job belongs to tenant
    if (job.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Job not found',
        },
        404
      );
    }

    // Check if job can be retried
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

    const canRetry = await jobsService.canRetry(jobId);
    if (!canRetry) {
      return c.json(
        {
          status: 'error',
          error: 'max_attempts_reached',
          message: `Job has reached maximum retry attempts (${job.maxAttempts})`,
        },
        400
      );
    }

    const retriedJob = await jobsService.retryJob(jobId);
    if (!retriedJob) {
      return c.json(
        {
          status: 'error',
          error: 'retry_failed',
          message: 'Failed to retry job',
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'retry',
      targetType: 'job',
      targetId: jobId,
      before: {
        status: job.status,
        attempts: job.attempts,
      },
      after: {
        status: retriedJob.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: retriedJob.id,
        status: retriedJob.status,
        attempts: retriedJob.attempts,
        maxAttempts: retriedJob.maxAttempts,
        updatedAt: retriedJob.updatedAt,
      },
    });
  });

  /**
   * POST /jobs/:id/cancel - Cancel a queued or running job
   */
  jobs.post('/:id/cancel', requirePermission('job', 'update'), async (c) => {
    const authContext = c.get('auth');
    const jobsService = createJobsService(c.env.DB);
    const jobId = c.req.param('id');

    const job = await jobsService.getJob(jobId);
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

    // Verify job belongs to tenant
    if (job.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Job not found',
        },
        404
      );
    }

    // Check if job can be cancelled
    if (job.status !== 'queued' && job.status !== 'running') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot cancel job in ${job.status} status. Only queued or running jobs can be cancelled.`,
        },
        400
      );
    }

    const cancelledJob = await jobsService.cancelJob(jobId);
    if (!cancelledJob) {
      return c.json(
        {
          status: 'error',
          error: 'cancel_failed',
          message: 'Failed to cancel job',
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'cancel',
      targetType: 'job',
      targetId: jobId,
      before: {
        status: job.status,
      },
      after: {
        status: cancelledJob.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: cancelledJob.id,
        status: cancelledJob.status,
        updatedAt: cancelledJob.updatedAt,
      },
    });
  });

  return jobs;
}

export const jobRoutes = createJobRoutes();
