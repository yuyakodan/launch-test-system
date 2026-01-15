/**
 * Next Run Routes
 * Handles next run generation and fixed granularity management
 *
 * POST /runs/:runId/next-run - Generate next run
 * POST /runs/:runId/fixed-granularity - Set fixed granularity configuration
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { RunStateMachine } from '../services/run-state-machine.js';
import {
  NextRunService,
  validateFixedGranularity,
  createNextRunService,
} from '../services/next-run.js';
import { createD1Repositories } from '../repositories/factory.js';
import type { GenerateNextRunRequest, SetFixedGranularityRequest } from '../types/next-run.js';

type NextRunEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create next run routes
 */
export function createNextRunRoutes() {
  const nextRunRouter = new Hono<NextRunEnv>();

  // Apply auth middleware to all routes
  nextRunRouter.use('*', authMiddleware());

  /**
   * POST /runs/:runId/next-run - Generate next run
   *
   * Generates a new run based on the source run's fixed/explore settings.
   * - Locked elements are copied exactly
   * - Explore elements may be generated or modified
   * - Returns diff log of all changes
   *
   * Request body:
   * - name?: string - Optional name for the new run
   * - fixedGranularityOverrides?: object - Override fixed granularity settings
   * - newIntents?: Array<{title, hypothesis?}> - New intents to add
   * - autoApproveCarryOver?: boolean - Auto-approve carried over elements
   */
  nextRunRouter.post('/:runId/next-run', requirePermission('run', 'create'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Fetch source run
    const sourceRun = await repos.run.findById(runId);
    if (!sourceRun) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Source run not found',
        },
        404
      );
    }

    // Verify run's project belongs to tenant
    const belongsToTenant = await repos.project.belongsToTenant(
      sourceRun.projectId,
      authContext.tenantId
    );
    if (!belongsToTenant) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Source run not found',
        },
        404
      );
    }

    // Validate source run status - should be Completed or Paused to generate next run
    const validSourceStatuses = ['Completed', 'Paused', 'Running'];
    if (!validSourceStatuses.includes(sourceRun.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot generate next run from run in ${sourceRun.status} status. Valid statuses: ${validSourceStatuses.join(', ')}`,
        },
        400
      );
    }

    // Parse request body
    let body: GenerateNextRunRequest;
    try {
      body = await c.req.json<GenerateNextRunRequest>();
    } catch {
      // Empty body is valid - use defaults
      body = {};
    }

    // Validate fixedGranularityOverrides if provided
    if (body.fixedGranularityOverrides) {
      // Convert to full config for validation
      const tempConfig = {
        version: '1.0',
        ...body.fixedGranularityOverrides,
      };
      const validation = validateFixedGranularity(tempConfig);
      if (!validation.valid) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_fixed_granularity',
            message: 'Invalid fixed granularity overrides',
            details: validation.errors,
          },
          400
        );
      }
    }

    // Create NextRunService with repositories
    const nextRunService = createNextRunService({
      runRepository: repos.run,
      intentRepository: repos.intent,
      lpVariantRepository: repos.lpVariant,
      creativeVariantRepository: repos.creativeVariant,
      adCopyRepository: repos.adCopy,
    });

    // Generate next run
    try {
      const result = await nextRunService.generateNextRun(
        runId,
        body,
        authContext.userId
      );

      // Record in audit log
      const auditService = new AuditService(c.env.DB);
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'generate_next_run',
        targetType: 'run',
        targetId: result.runId,
        before: {
          sourceRunId: runId,
          sourceRunName: sourceRun.name,
        },
        after: {
          newRunId: result.runId,
          newRunName: result.name,
          summary: result.summary,
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json(
        {
          status: 'ok',
          data: {
            runId: result.runId,
            name: result.name,
            sourceRunId: runId,
            summary: result.summary,
            diffLog: result.diffLog,
          },
        },
        201
      );
    } catch (error) {
      console.error('Failed to generate next run:', error);
      return c.json(
        {
          status: 'error',
          error: 'generation_failed',
          message: error instanceof Error ? error.message : 'Failed to generate next run',
        },
        500
      );
    }
  });

  /**
   * POST /runs/:runId/fixed-granularity - Set fixed granularity configuration
   *
   * Sets the fixed granularity configuration for a run.
   * This determines what elements are locked vs explored in next run generation.
   *
   * Request body:
   * - fixedGranularityJson: string - JSON configuration
   */
  nextRunRouter.post('/:runId/fixed-granularity', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Fetch run
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

    // Check if run is editable
    if (!RunStateMachine.isEditableStatus(run.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_status',
          message: `Cannot set fixed granularity for run in ${run.status} status`,
        },
        400
      );
    }

    // Parse request body
    let body: SetFixedGranularityRequest;
    try {
      body = await c.req.json<SetFixedGranularityRequest>();
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

    // Validate fixedGranularityJson is provided
    if (!body.fixedGranularityJson || typeof body.fixedGranularityJson !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'fixedGranularityJson is required',
        },
        400
      );
    }

    // Parse and validate the JSON
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(body.fixedGranularityJson);
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'fixedGranularityJson must be valid JSON',
        },
        400
      );
    }

    // Validate against schema
    const validation = validateFixedGranularity(parsedConfig);
    if (!validation.valid) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_fixed_granularity',
          message: 'Invalid fixed granularity configuration',
          details: validation.errors,
        },
        400
      );
    }

    // Update run with fixed granularity
    const updatedRun = await repos.run.update(runId, {
      fixedGranularityJson: JSON.stringify(validation.normalized),
    });

    if (!updatedRun) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update fixed granularity',
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
        fixedGranularityJson: run.fixedGranularityJson,
      },
      after: {
        fixedGranularityJson: updatedRun.fixedGranularityJson,
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
        fixedGranularityJson: updatedRun.fixedGranularityJson,
        updatedAt: updatedRun.updatedAt,
      },
    });
  });

  /**
   * GET /runs/:runId/fixed-granularity - Get current fixed granularity configuration
   */
  nextRunRouter.get('/:runId/fixed-granularity', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const runId = c.req.param('runId');

    // Fetch run
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

    // Parse and normalize the config
    let config: unknown;
    try {
      config = JSON.parse(run.fixedGranularityJson);
    } catch {
      config = {};
    }

    const validation = validateFixedGranularity({
      version: '1.0',
      ...config as Record<string, unknown>,
    });

    return c.json({
      status: 'ok',
      data: {
        runId: run.id,
        config: validation.normalized,
        raw: run.fixedGranularityJson,
      },
    });
  });

  return nextRunRouter;
}

export const nextRunRoutes = createNextRunRoutes();
