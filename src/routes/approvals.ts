/**
 * Approval Routes
 * Handles approval workflow endpoints
 *
 * Routes:
 * - POST /approvals - Create submitted approval (target_hash required)
 * - POST /approvals/:approvalId/approve - Approve
 * - POST /approvals/:approvalId/reject - Reject
 * - POST /runs/:runId/submit-review - Submit run for review
 * - GET /runs/:runId/approvals - Get run approvals list
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type { ApprovalTargetType } from '../types/entities.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { ApprovalService, canPerformApprovalAction } from '../services/approval.js';
import { createD1Repositories } from '../repositories/factory.js';

type ApprovalEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create approval request body
 */
interface CreateApprovalRequest {
  targetType: ApprovalTargetType;
  targetId: string;
  targetHash: string;
  comment?: string;
}

/**
 * Approve/Reject request body
 */
interface ApprovalActionRequest {
  comment?: string;
}

/**
 * Reject request body (comment required)
 */
interface RejectRequest {
  comment: string;
}

/**
 * Submit run for review request body
 */
interface SubmitRunReviewRequest {
  comment?: string;
}

/**
 * Validate target type
 */
function isValidTargetType(type: string): type is ApprovalTargetType {
  return ['run', 'lp_variant', 'creative_variant', 'ad_copy', 'deployment', 'meta_config'].includes(
    type
  );
}

/**
 * Create approval routes
 */
export function createApprovalRoutes() {
  const approvals = new Hono<ApprovalEnv>();

  // Apply auth middleware to all routes
  approvals.use('*', authMiddleware());

  /**
   * POST /approvals - Create a new approval request (submitted state)
   *
   * Body:
   * - targetType: string (run, lp_variant, etc.)
   * - targetId: string
   * - targetHash: string (content hash at submission time)
   * - comment?: string
   */
  approvals.post('/', requirePermission('variant', 'create'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Check permission
    if (!canPerformApprovalAction(authContext.role, 'submit')) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: 'You do not have permission to submit for approval',
        },
        403
      );
    }

    // Parse request body
    let body: CreateApprovalRequest;
    try {
      body = await c.req.json<CreateApprovalRequest>();
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
    if (!body.targetType || !isValidTargetType(body.targetType)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message:
            'targetType is required and must be one of: run, lp_variant, creative_variant, ad_copy, deployment, meta_config',
        },
        400
      );
    }

    if (!body.targetId || typeof body.targetId !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'targetId is required',
        },
        400
      );
    }

    if (!body.targetHash || typeof body.targetHash !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'targetHash is required',
        },
        400
      );
    }

    // Create approval service
    const approvalService = new ApprovalService(
      repos.approval,
      repos.run,
      repos.lpVariant,
      repos.creativeVariant,
      repos.adCopy
    );

    // Create approval
    const result = await approvalService.submitForReview(
      authContext.tenantId,
      body.targetType,
      body.targetId,
      body.comment
    );

    if (!result.success) {
      return c.json(
        {
          status: 'error',
          error: 'submission_failed',
          message: result.error,
        },
        400
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'approval',
      targetId: result.approval!.id,
      after: {
        id: result.approval!.id,
        targetType: result.approval!.targetType,
        targetId: result.approval!.targetId,
        status: result.approval!.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json(
      {
        status: 'ok',
        data: result.approval,
      },
      201
    );
  });

  /**
   * POST /approvals/:approvalId/approve - Approve a request
   */
  approvals.post('/:approvalId/approve', requirePermission('variant', 'approve'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const approvalId = c.req.param('approvalId');

    // Check permission
    if (!canPerformApprovalAction(authContext.role, 'approve')) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: 'You do not have permission to approve',
        },
        403
      );
    }

    // Parse request body (optional comment)
    let body: ApprovalActionRequest = {};
    try {
      body = await c.req.json<ApprovalActionRequest>();
    } catch {
      // Body is optional
    }

    // Get approval
    const approval = await repos.approval.findById(approvalId);
    if (!approval) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Approval not found',
        },
        404
      );
    }

    // Verify tenant
    if (approval.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Approval not found',
        },
        404
      );
    }

    // Create approval service
    const approvalService = new ApprovalService(
      repos.approval,
      repos.run,
      repos.lpVariant,
      repos.creativeVariant,
      repos.adCopy
    );

    // Approve
    const result = await approvalService.approve(
      approvalId,
      authContext.userId,
      authContext.role,
      body.comment
    );

    if (!result.success) {
      return c.json(
        {
          status: 'error',
          error: 'approval_failed',
          message: result.error,
        },
        400
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'approve',
      targetType: 'approval',
      targetId: approvalId,
      before: {
        status: approval.status,
      },
      after: {
        status: result.approval!.status,
        reviewerUserId: result.approval!.reviewerUserId,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: result.approval,
    });
  });

  /**
   * POST /approvals/:approvalId/reject - Reject a request
   */
  approvals.post('/:approvalId/reject', requirePermission('variant', 'reject'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const approvalId = c.req.param('approvalId');

    // Check permission
    if (!canPerformApprovalAction(authContext.role, 'reject')) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: 'You do not have permission to reject',
        },
        403
      );
    }

    // Parse request body
    let body: RejectRequest;
    try {
      body = await c.req.json<RejectRequest>();
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

    // Comment is required for rejection
    if (!body.comment || typeof body.comment !== 'string' || body.comment.trim() === '') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Comment is required when rejecting',
        },
        400
      );
    }

    // Get approval
    const approval = await repos.approval.findById(approvalId);
    if (!approval) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Approval not found',
        },
        404
      );
    }

    // Verify tenant
    if (approval.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Approval not found',
        },
        404
      );
    }

    // Create approval service
    const approvalService = new ApprovalService(
      repos.approval,
      repos.run,
      repos.lpVariant,
      repos.creativeVariant,
      repos.adCopy
    );

    // Reject
    const result = await approvalService.reject(
      approvalId,
      authContext.userId,
      authContext.role,
      body.comment
    );

    if (!result.success) {
      return c.json(
        {
          status: 'error',
          error: 'rejection_failed',
          message: result.error,
        },
        400
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'reject',
      targetType: 'approval',
      targetId: approvalId,
      before: {
        status: approval.status,
      },
      after: {
        status: result.approval!.status,
        reviewerUserId: result.approval!.reviewerUserId,
        comment: result.approval!.comment,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: result.approval,
    });
  });

  return approvals;
}

/**
 * Create run approval routes (mounted under /runs)
 */
export function createRunApprovalRoutes() {
  const runApprovals = new Hono<ApprovalEnv>();

  // Apply auth middleware to all routes
  runApprovals.use('*', authMiddleware());

  /**
   * POST /runs/:runId/submit-review - Submit a run for review
   */
  runApprovals.post('/:runId/submit-review', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Check permission
    if (!canPerformApprovalAction(authContext.role, 'submit')) {
      return c.json(
        {
          status: 'error',
          error: 'insufficient_permissions',
          message: 'You do not have permission to submit for review',
        },
        403
      );
    }

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

    // Parse request body (optional comment)
    let body: SubmitRunReviewRequest = {};
    try {
      body = await c.req.json<SubmitRunReviewRequest>();
    } catch {
      // Body is optional
    }

    // Create approval service
    const approvalService = new ApprovalService(
      repos.approval,
      repos.run,
      repos.lpVariant,
      repos.creativeVariant,
      repos.adCopy
    );

    // Submit for review
    const result = await approvalService.submitRunForReview(
      authContext.tenantId,
      runId,
      body.comment
    );

    if (!result.success) {
      return c.json(
        {
          status: 'error',
          error: 'submission_failed',
          message: result.error,
          guardrails: result.guardrails,
        },
        400
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'approval',
      targetId: result.approval!.id,
      after: {
        id: result.approval!.id,
        targetType: 'run',
        targetId: runId,
        status: result.approval!.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    // Update run status to ReadyForReview if it's currently in Generating status
    if (run.status === 'Generating') {
      await repos.run.updateStatus(runId, 'ReadyForReview');
    }

    return c.json(
      {
        status: 'ok',
        data: {
          approval: result.approval,
          guardrails: result.guardrails,
        },
      },
      201
    );
  });

  /**
   * GET /runs/:runId/approvals - Get approvals for a run
   */
  runApprovals.get('/:runId/approvals', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

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

    // Parse pagination
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Get approvals for run
    const result = await repos.approval.getHistory('run', runId, { limit, offset });

    // Create approval service for readiness check
    const approvalService = new ApprovalService(
      repos.approval,
      repos.run,
      repos.lpVariant,
      repos.creativeVariant,
      repos.adCopy
    );

    // Get approval status and launch readiness
    const [approvalStatus, launchReadiness] = await Promise.all([
      approvalService.getApprovalStatus('run', runId),
      approvalService.checkLaunchReadiness(run),
    ]);

    return c.json({
      status: 'ok',
      data: {
        approvals: result.items,
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
        approvalStatus,
        launchReadiness,
      },
    });
  });

  return runApprovals;
}

export const approvalRoutes = createApprovalRoutes();
export const runApprovalRoutes = createRunApprovalRoutes();
