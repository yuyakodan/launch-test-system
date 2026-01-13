/**
 * Project Routes
 * Handles project management endpoints
 *
 * GET /projects - List projects
 * POST /projects - Create project
 * GET /projects/:id - Get project by ID
 * PATCH /projects/:id - Update project
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';
import type { CreateProjectInput, UpdateProjectInput } from '../repositories/interfaces/index.js';

type ProjectEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create project request body
 */
interface CreateProjectRequest {
  name: string;
  offerJson?: string;
  cvDefinitionJson?: string;
  ngRulesJson?: string;
  brandJson?: string;
  formConfigJson?: string;
  defaultDisclaimer?: string;
}

/**
 * Update project request body
 */
interface UpdateProjectRequest {
  name?: string;
  offerJson?: string;
  cvDefinitionJson?: string;
  ngRulesJson?: string;
  brandJson?: string;
  formConfigJson?: string;
  defaultDisclaimer?: string;
}

/**
 * Create project routes
 */
export function createProjectRoutes() {
  const projects = new Hono<ProjectEnv>();

  // Apply auth middleware to all routes
  projects.use('*', authMiddleware());

  /**
   * GET /projects - List all projects for the current tenant
   *
   * Query parameters:
   * - limit: number (default: 100)
   * - offset: number (default: 0)
   * - includeArchived: boolean (default: false)
   * - nameContains: string (optional filter)
   */
  projects.get('/', requirePermission('project', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse query parameters
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);
    const includeArchived = c.req.query('includeArchived') === 'true';
    const nameContains = c.req.query('nameContains');

    const result = await repos.project.findByFilter(
      {
        tenantId: authContext.tenantId,
        includeArchived,
        nameContains: nameContains ?? undefined,
      },
      { limit, offset }
    );

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((project) => ({
          id: project.id,
          name: project.name,
          archivedAt: project.archivedAt,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * POST /projects - Create a new project
   */
  projects.post('/', requirePermission('project', 'create'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: CreateProjectRequest;
    try {
      body = await c.req.json<CreateProjectRequest>();
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

    // Build create input
    const createInput: CreateProjectInput = {
      tenantId: authContext.tenantId,
      name: body.name.trim(),
      offerJson: body.offerJson,
      cvDefinitionJson: body.cvDefinitionJson,
      ngRulesJson: body.ngRulesJson,
      brandJson: body.brandJson,
      formConfigJson: body.formConfigJson,
      defaultDisclaimer: body.defaultDisclaimer,
    };

    // Create project
    const project = await repos.project.create(createInput);

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'project',
      targetId: project.id,
      after: {
        id: project.id,
        name: project.name,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json(
      {
        status: 'ok',
        data: {
          id: project.id,
          tenantId: project.tenantId,
          name: project.name,
          offerJson: project.offerJson,
          cvDefinitionJson: project.cvDefinitionJson,
          ngRulesJson: project.ngRulesJson,
          brandJson: project.brandJson,
          formConfigJson: project.formConfigJson,
          defaultDisclaimer: project.defaultDisclaimer,
          archivedAt: project.archivedAt,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        },
      },
      201
    );
  });

  /**
   * GET /projects/:id - Get a project by ID
   */
  projects.get('/:id', requirePermission('project', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const projectId = c.req.param('id');

    // Check project belongs to tenant
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

    const project = await repos.project.findById(projectId);
    if (!project) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Project not found',
        },
        404
      );
    }

    return c.json({
      status: 'ok',
      data: {
        id: project.id,
        tenantId: project.tenantId,
        name: project.name,
        offerJson: project.offerJson,
        cvDefinitionJson: project.cvDefinitionJson,
        ngRulesJson: project.ngRulesJson,
        brandJson: project.brandJson,
        formConfigJson: project.formConfigJson,
        defaultDisclaimer: project.defaultDisclaimer,
        archivedAt: project.archivedAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      },
    });
  });

  /**
   * PATCH /projects/:id - Update a project
   */
  projects.patch('/:id', requirePermission('project', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const projectId = c.req.param('id');

    // Check project belongs to tenant
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

    // Get current project for audit log
    const currentProject = await repos.project.findById(projectId);
    if (!currentProject) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Project not found',
        },
        404
      );
    }

    // Parse request body
    let body: UpdateProjectRequest;
    try {
      body = await c.req.json<UpdateProjectRequest>();
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

    // Validate name if provided
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Name must be a non-empty string',
        },
        400
      );
    }

    // Build update input
    const updateInput: UpdateProjectInput = {};
    if (body.name) updateInput.name = body.name.trim();
    if (body.offerJson !== undefined) updateInput.offerJson = body.offerJson;
    if (body.cvDefinitionJson !== undefined) updateInput.cvDefinitionJson = body.cvDefinitionJson;
    if (body.ngRulesJson !== undefined) updateInput.ngRulesJson = body.ngRulesJson;
    if (body.brandJson !== undefined) updateInput.brandJson = body.brandJson;
    if (body.formConfigJson !== undefined) updateInput.formConfigJson = body.formConfigJson;
    if (body.defaultDisclaimer !== undefined) updateInput.defaultDisclaimer = body.defaultDisclaimer;

    // Update project
    const updatedProject = await repos.project.update(projectId, updateInput);
    if (!updatedProject) {
      return c.json(
        {
          status: 'error',
          error: 'update_failed',
          message: 'Failed to update project',
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
      targetType: 'project',
      targetId: projectId,
      before: {
        name: currentProject.name,
      },
      after: {
        name: updatedProject.name,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedProject.id,
        tenantId: updatedProject.tenantId,
        name: updatedProject.name,
        offerJson: updatedProject.offerJson,
        cvDefinitionJson: updatedProject.cvDefinitionJson,
        ngRulesJson: updatedProject.ngRulesJson,
        brandJson: updatedProject.brandJson,
        formConfigJson: updatedProject.formConfigJson,
        defaultDisclaimer: updatedProject.defaultDisclaimer,
        archivedAt: updatedProject.archivedAt,
        createdAt: updatedProject.createdAt,
        updatedAt: updatedProject.updatedAt,
      },
    });
  });

  return projects;
}

export const projectRoutes = createProjectRoutes();
