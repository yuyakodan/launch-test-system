/**
 * Run Routes
 * Handles run lifecycle management endpoints
 *
 * GET /runs - List runs
 * POST /runs - Create run
 * GET /runs/:id - Get run by ID
 * PATCH /runs/:id - Update run
 * POST /runs/:id/design - Set run design
 * POST /runs/:id/stop-dsl - Set stop rules DSL
 * POST /runs/:id/launch - Launch run
 * POST /runs/:id/pause - Pause run
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type { RunStatus, OperationMode } from '../types/entities.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { RunStateMachine, createValidationContext } from '../services/run-state-machine.js';
import { DslParser } from '../services/stop-rules/dsl-parser.js';
import { createD1Repositories } from '../repositories/factory.js';
import type { CreateRunInput, UpdateRunInput } from '../repositories/interfaces/index.js';

type RunEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create run request body
 */
interface CreateRunRequest {
  projectId: string;
  name: string;
  operationMode?: OperationMode;
  runDesignJson?: string;
  stopDslJson?: string;
}

/**
 * Update run request body
 */
interface UpdateRunRequest {
  name?: string;
  operationMode?: OperationMode;
  startAt?: string;
  endAt?: string;
}

/**
 * Set design request body
 */
interface SetDesignRequest {
  runDesignJson: string;
}

/**
 * Set stop DSL request body
 */
interface SetStopDslRequest {
  stopDslJson: string;
}

/**
 * Create run routes
 */
export function createRunRoutes() {
  const runs = new Hono<RunEnv>();

  // Apply auth middleware to all routes
  runs.use('*', authMiddleware());

  /**
   * GET /runs - List runs
   *
   * Query parameters:
   * - projectId: string (optional filter)
   * - status: string (optional filter)
   * - limit: number (default: 100)
   * - offset: number (default: 0)
   */
  runs.get('/', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse query parameters
    const projectId = c.req.query('projectId');
    const status = c.req.query('status') as RunStatus | undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // If projectId is provided, verify it belongs to tenant
    if (projectId) {
      const belongsToTenant = await repos.project.belongsToTenant(projectId, authContext.tenantId);
      if (!belongsToTenant) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Project not found',
          },
          404
        );
      }
    }

    const result = await repos.run.findByFilter(
      {
        projectId: projectId ?? undefined,
        status: status ?? undefined,
      },
      { limit, offset }
    );

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((run) => ({
          id: run.id,
          projectId: run.projectId,
          name: run.name,
          status: run.status,
          operationMode: run.operationMode,
          startAt: run.startAt,
          endAt: run.endAt,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          approvedAt: run.approvedAt,
          launchedAt: run.launchedAt,
          completedAt: run.completedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * POST /runs - Create a new run
   */
  runs.post('/', requirePermission('run', 'create'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: CreateRunRequest;
    try {
      body = await c.req.json<CreateRunRequest>();
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
    if (!body.projectId || typeof body.projectId !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'projectId is required',
        },
        400
      );
    }

    if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Name is required and must be a non-empty string',
        },
        400
      );
    }

    // Verify project belongs to tenant
    const belongsToTenant = await repos.project.belongsToTenant(body.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Project not found',
        },
        404
      );
    }

    // Validate operation mode if provided
    if (body.operationMode && !['manual', 'hybrid', 'auto'].includes(body.operationMode)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'operationMode must be one of: manual, hybrid, auto',
        },
        400
      );
    }

    // Build create input
    const createInput: CreateRunInput = {
      projectId: body.projectId,
      name: body.name.trim(),
      operationMode: body.operationMode ?? 'manual',
      runDesignJson: body.runDesignJson,
      stopDslJson: body.stopDslJson,
      createdByUserId: authContext.userId,
    };

    // Create run
    const run = await repos.run.create(createInput);

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'run',
      targetId: run.id,
      after: {
        id: run.id,
        name: run.name,
        status: run.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json(
      {
        status: 'ok',
        data: {
          id: run.id,
          projectId: run.projectId,
          name: run.name,
          status: run.status,
          operationMode: run.operationMode,
          startAt: run.startAt,
          endAt: run.endAt,
          runDesignJson: run.runDesignJson,
          stopDslJson: run.stopDslJson,
          createdByUserId: run.createdByUserId,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
        },
      },
      201
    );
  });

  /**
   * GET /runs/:id - Get a run by ID
   */
  runs.get('/:id', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

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

    // Get valid next statuses
    const validNextStatuses = RunStateMachine.getValidNextStatuses(run.status);
    const statusInfo = RunStateMachine.getStatusInfo(run.status);

    return c.json({
      status: 'ok',
      data: {
        id: run.id,
        projectId: run.projectId,
        name: run.name,
        status: run.status,
        statusInfo,
        validNextStatuses,
        operationMode: run.operationMode,
        startAt: run.startAt,
        endAt: run.endAt,
        runDesignJson: run.runDesignJson,
        stopDslJson: run.stopDslJson,
        fixedGranularityJson: run.fixedGranularityJson,
        decisionRulesJson: run.decisionRulesJson,
        createdByUserId: run.createdByUserId,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        approvedAt: run.approvedAt,
        publishedAt: run.publishedAt,
        launchedAt: run.launchedAt,
        completedAt: run.completedAt,
      },
    });
  });

  /**
   * PATCH /runs/:id - Update a run
   */
  runs.patch('/:id', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

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

    // Check if run is editable
    if (!RunStateMachine.isEditableStatus(run.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot update run in ${run.status} status`,
        },
        400
      );
    }

    // Parse request body
    let body: UpdateRunRequest;
    try {
      body = await c.req.json<UpdateRunRequest>();
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

    // Validate operation mode if provided
    if (body.operationMode && !['manual', 'hybrid', 'auto'].includes(body.operationMode)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'operationMode must be one of: manual, hybrid, auto',
        },
        400
      );
    }

    // Build update input
    const updateInput: UpdateRunInput = {};
    if (body.name) updateInput.name = body.name.trim();
    if (body.operationMode) updateInput.operationMode = body.operationMode;
    if (body.startAt !== undefined) updateInput.startAt = body.startAt;
    if (body.endAt !== undefined) updateInput.endAt = body.endAt;

    // Update run
    const updatedRun = await repos.run.update(runId, updateInput);
    if (!updatedRun) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update run',
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
      targetType: 'run',
      targetId: runId,
      before: {
        name: run.name,
        operationMode: run.operationMode,
      },
      after: {
        name: updatedRun.name,
        operationMode: updatedRun.operationMode,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedRun.id,
        projectId: updatedRun.projectId,
        name: updatedRun.name,
        status: updatedRun.status,
        operationMode: updatedRun.operationMode,
        startAt: updatedRun.startAt,
        endAt: updatedRun.endAt,
        createdAt: updatedRun.createdAt,
        updatedAt: updatedRun.updatedAt,
      },
    });
  });

  /**
   * POST /runs/:id/design - Set run design
   */
  runs.post('/:id/design', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

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

    // Check if run is editable
    if (!RunStateMachine.isEditableStatus(run.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot set design for run in ${run.status} status`,
        },
        400
      );
    }

    // Parse request body
    let body: SetDesignRequest;
    try {
      body = await c.req.json<SetDesignRequest>();
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

    // Validate runDesignJson
    if (!body.runDesignJson || typeof body.runDesignJson !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'runDesignJson is required',
        },
        400
      );
    }

    // Validate JSON format
    try {
      JSON.parse(body.runDesignJson);
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'runDesignJson must be valid JSON',
        },
        400
      );
    }

    // Update run with design and transition to Designing status if Draft
    const updateInput: UpdateRunInput = {
      runDesignJson: body.runDesignJson,
    };
    if (run.status === 'Draft') {
      updateInput.status = 'Designing';
    }

    const updatedRun = await repos.run.update(runId, updateInput);
    if (!updatedRun) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update run design',
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
      targetType: 'run',
      targetId: runId,
      before: {
        status: run.status,
        runDesignJson: run.runDesignJson,
      },
      after: {
        status: updatedRun.status,
        runDesignJson: updatedRun.runDesignJson,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedRun.id,
        status: updatedRun.status,
        runDesignJson: updatedRun.runDesignJson,
        updatedAt: updatedRun.updatedAt,
      },
    });
  });

  /**
   * POST /runs/:id/stop-dsl - Set stop rules DSL
   */
  runs.post('/:id/stop-dsl', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

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

    // Check if run is editable
    if (!RunStateMachine.isEditableStatus(run.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot set stop DSL for run in ${run.status} status`,
        },
        400
      );
    }

    // Parse request body
    let body: SetStopDslRequest;
    try {
      body = await c.req.json<SetStopDslRequest>();
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

    // Validate stopDslJson
    if (!body.stopDslJson || typeof body.stopDslJson !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'stopDslJson is required',
        },
        400
      );
    }

    // Parse and validate DSL
    const parser = new DslParser();
    const validationResult = parser.validate(JSON.parse(body.stopDslJson));
    if (!validationResult.valid) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_dsl',
          message: 'Invalid stop DSL',
          details: validationResult.errors,
        },
        400
      );
    }

    // Update run with stop DSL
    const updatedRun = await repos.run.update(runId, {
      stopDslJson: body.stopDslJson,
    });
    if (!updatedRun) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update stop DSL',
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
      targetType: 'run',
      targetId: runId,
      before: {
        stopDslJson: run.stopDslJson,
      },
      after: {
        stopDslJson: updatedRun.stopDslJson,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedRun.id,
        status: updatedRun.status,
        stopDslJson: updatedRun.stopDslJson,
        updatedAt: updatedRun.updatedAt,
      },
    });
  });

  /**
   * POST /runs/:id/launch - Launch a run
   */
  runs.post('/:id/launch', requirePermission('run', 'launch'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

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

    // Validate transition to Running
    const validationContext = createValidationContext(run);
    const transitionResult = RunStateMachine.validateTransition(validationContext, 'Running');

    if (!transitionResult.success) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_transition',
          message: 'Cannot launch run',
          details: transitionResult.errors,
        },
        400
      );
    }

    // Mark run as launched
    const updatedRun = await repos.run.markLaunched(runId);
    if (!updatedRun) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to launch run',
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'launch',
      targetType: 'run',
      targetId: runId,
      before: {
        status: run.status,
      },
      after: {
        status: updatedRun.status,
        launchedAt: updatedRun.launchedAt,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedRun.id,
        status: updatedRun.status,
        launchedAt: updatedRun.launchedAt,
        updatedAt: updatedRun.updatedAt,
      },
    });
  });

  /**
   * POST /runs/:id/pause - Pause a run
   */
  runs.post('/:id/pause', requirePermission('run', 'pause'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('id');

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

    // Validate transition to Paused
    if (!RunStateMachine.isValidTransition(run.status, 'Paused')) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_transition',
          message: `Cannot pause run from ${run.status} status`,
          validFromStatuses: RunStateMachine.getValidPreviousStatuses('Paused'),
        },
        400
      );
    }

    // Update run status to Paused
    const updatedRun = await repos.run.updateStatus(runId, 'Paused');
    if (!updatedRun) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to pause run',
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'pause',
      targetType: 'run',
      targetId: runId,
      before: {
        status: run.status,
      },
      after: {
        status: updatedRun.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedRun.id,
        status: updatedRun.status,
        updatedAt: updatedRun.updatedAt,
      },
    });
  });

  return runs;
}

export const runRoutes = createRunRoutes();
