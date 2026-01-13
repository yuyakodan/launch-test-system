/**
 * Variant Routes
 * Handles LP Variant, Creative Variant, Ad Copy endpoints
 *
 * GET /intents/:intentId/lp-variants - List LP variants
 * POST /intents/:intentId/lp-variants - Create LP variant
 * GET /intents/:intentId/creative-variants - List creative variants
 * POST /intents/:intentId/creative-variants - Create creative variant
 * GET /intents/:intentId/ad-copies - List ad copies
 * POST /intents/:intentId/ad-copies - Create ad copy
 * PATCH /ad-copies/:id - Update ad copy
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type { ApprovalStatus, VariantStatus, CreativeSize } from '../types/entities.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createD1Repositories } from '../repositories/factory.js';

type VariantEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

// ================================
// LP Variant Routes
// ================================

interface CreateLpVariantRequest {
  blocksJson?: string;
  themeJson?: string;
}

interface UpdateLpVariantRequest {
  status?: VariantStatus;
  blocksJson?: string;
  themeJson?: string;
  approvalStatus?: ApprovalStatus;
}

// ================================
// Creative Variant Routes
// ================================

interface CreateCreativeVariantRequest {
  size: CreativeSize;
  textLayersJson?: string;
  imageR2Key: string;
}

interface UpdateCreativeVariantRequest {
  status?: string;
  textLayersJson?: string;
  imageR2Key?: string;
  approvalStatus?: ApprovalStatus;
}

// ================================
// Ad Copy Routes
// ================================

interface CreateAdCopyRequest {
  primaryText?: string;
  headline?: string;
  description?: string;
}

interface UpdateAdCopyRequest {
  status?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  approvalStatus?: ApprovalStatus;
}

/**
 * Create variant routes
 */
export function createVariantRoutes() {
  const variants = new Hono<VariantEnv>();

  // Apply auth middleware to all routes
  variants.use('*', authMiddleware());

  // ================================
  // LP Variant Endpoints
  // ================================

  /**
   * GET /intents/:intentId/lp-variants - List LP variants for an intent
   */
  variants.get('/intents/:intentId/lp-variants', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('intentId');

    // Verify intent exists and belongs to tenant
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Run not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await repos.lpVariant.findByIntentId(intentId, { limit, offset });

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((v) => ({
          id: v.id,
          intentId: v.intentId,
          version: v.version,
          status: v.status,
          blocksJson: v.blocksJson,
          themeJson: v.themeJson,
          qaResultJson: v.qaResultJson,
          approvalStatus: v.approvalStatus,
          approvedHash: v.approvedHash,
          publishedUrl: v.publishedUrl,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * POST /intents/:intentId/lp-variants - Create LP variant
   */
  variants.post('/intents/:intentId/lp-variants', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('intentId');

    // Verify intent exists and belongs to tenant
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Run not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    let body: CreateLpVariantRequest;
    try {
      body = await c.req.json<CreateLpVariantRequest>();
    } catch {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'Invalid JSON body' },
        400
      );
    }

    const nextVersion = await repos.lpVariant.getNextVersionForIntent(intentId);

    const lpVariant = await repos.lpVariant.create({
      intentId,
      version: nextVersion,
      blocksJson: body.blocksJson,
      themeJson: body.themeJson,
    });

    // Audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'lp_variant',
      targetId: lpVariant.id,
      after: { id: lpVariant.id, intentId, version: lpVariant.version },
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        id: lpVariant.id,
        intentId: lpVariant.intentId,
        version: lpVariant.version,
        status: lpVariant.status,
        blocksJson: lpVariant.blocksJson,
        themeJson: lpVariant.themeJson,
        approvalStatus: lpVariant.approvalStatus,
        createdAt: lpVariant.createdAt,
        updatedAt: lpVariant.updatedAt,
      },
    }, 201);
  });

  // ================================
  // Creative Variant Endpoints
  // ================================

  /**
   * GET /intents/:intentId/creative-variants - List creative variants
   */
  variants.get('/intents/:intentId/creative-variants', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('intentId');

    // Verify intent exists and belongs to tenant
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Run not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await repos.creativeVariant.findByIntentId(intentId, { limit, offset });

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((v) => ({
          id: v.id,
          intentId: v.intentId,
          size: v.size,
          version: v.version,
          status: v.status,
          textLayersJson: v.textLayersJson,
          imageR2Key: v.imageR2Key,
          qaResultJson: v.qaResultJson,
          approvalStatus: v.approvalStatus,
          approvedHash: v.approvedHash,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * POST /intents/:intentId/creative-variants - Create creative variant
   */
  variants.post('/intents/:intentId/creative-variants', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('intentId');

    // Verify intent exists and belongs to tenant
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Run not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    let body: CreateCreativeVariantRequest;
    try {
      body = await c.req.json<CreateCreativeVariantRequest>();
    } catch {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'Invalid JSON body' },
        400
      );
    }

    // Validate required fields
    if (!body.size || !['1:1', '4:5', '9:16'].includes(body.size)) {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'Size must be one of: 1:1, 4:5, 9:16' },
        400
      );
    }

    if (!body.imageR2Key) {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'imageR2Key is required' },
        400
      );
    }

    const nextVersion = await repos.creativeVariant.getNextVersionForIntentAndSize(intentId, body.size);

    const creativeVariant = await repos.creativeVariant.create({
      intentId,
      size: body.size,
      version: nextVersion,
      textLayersJson: body.textLayersJson,
      imageR2Key: body.imageR2Key,
    });

    // Audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'creative_variant',
      targetId: creativeVariant.id,
      after: { id: creativeVariant.id, intentId, size: creativeVariant.size, version: creativeVariant.version },
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        id: creativeVariant.id,
        intentId: creativeVariant.intentId,
        size: creativeVariant.size,
        version: creativeVariant.version,
        status: creativeVariant.status,
        textLayersJson: creativeVariant.textLayersJson,
        imageR2Key: creativeVariant.imageR2Key,
        approvalStatus: creativeVariant.approvalStatus,
        createdAt: creativeVariant.createdAt,
        updatedAt: creativeVariant.updatedAt,
      },
    }, 201);
  });

  // ================================
  // Ad Copy Endpoints
  // ================================

  /**
   * GET /intents/:intentId/ad-copies - List ad copies
   */
  variants.get('/intents/:intentId/ad-copies', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('intentId');

    // Verify intent exists and belongs to tenant
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Run not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await repos.adCopy.findByIntentId(intentId, { limit, offset });

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((v) => ({
          id: v.id,
          intentId: v.intentId,
          version: v.version,
          status: v.status,
          primaryText: v.primaryText,
          headline: v.headline,
          description: v.description,
          qaResultJson: v.qaResultJson,
          approvalStatus: v.approvalStatus,
          approvedHash: v.approvedHash,
          createdAt: v.createdAt,
          updatedAt: v.updatedAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * POST /intents/:intentId/ad-copies - Create ad copy
   */
  variants.post('/intents/:intentId/ad-copies', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const intentId = c.req.param('intentId');

    // Verify intent exists and belongs to tenant
    const intent = await repos.intent.findById(intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Run not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Intent not found' },
        404
      );
    }

    let body: CreateAdCopyRequest;
    try {
      body = await c.req.json<CreateAdCopyRequest>();
    } catch {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'Invalid JSON body' },
        400
      );
    }

    const nextVersion = await repos.adCopy.getNextVersionForIntent(intentId);

    const adCopy = await repos.adCopy.create({
      intentId,
      version: nextVersion,
      primaryText: body.primaryText,
      headline: body.headline,
      description: body.description,
    });

    // Audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'create',
      targetType: 'ad_copy',
      targetId: adCopy.id,
      after: { id: adCopy.id, intentId, version: adCopy.version },
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        id: adCopy.id,
        intentId: adCopy.intentId,
        version: adCopy.version,
        status: adCopy.status,
        primaryText: adCopy.primaryText,
        headline: adCopy.headline,
        description: adCopy.description,
        approvalStatus: adCopy.approvalStatus,
        createdAt: adCopy.createdAt,
        updatedAt: adCopy.updatedAt,
      },
    }, 201);
  });

  /**
   * PATCH /ad-copies/:id - Update ad copy
   */
  variants.patch('/ad-copies/:id', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);
    const adCopyId = c.req.param('id');

    // Get ad copy
    const adCopy = await repos.adCopy.findById(adCopyId);
    if (!adCopy) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Ad copy not found' },
        404
      );
    }

    // Verify intent's run's project belongs to tenant
    const intent = await repos.intent.findById(adCopy.intentId);
    if (!intent) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Ad copy not found' },
        404
      );
    }

    const run = await repos.run.findById(intent.runId);
    if (!run) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Ad copy not found' },
        404
      );
    }

    const belongsToTenant = await repos.project.belongsToTenant(run.projectId, authContext.tenantId);
    if (!belongsToTenant) {
      return c.json(
        { status: 'error', error: 'not_found', message: 'Ad copy not found' },
        404
      );
    }

    let body: UpdateAdCopyRequest;
    try {
      body = await c.req.json<UpdateAdCopyRequest>();
    } catch {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'Invalid JSON body' },
        400
      );
    }

    if (Object.keys(body).length === 0) {
      return c.json(
        { status: 'error', error: 'invalid_request', message: 'At least one field is required' },
        400
      );
    }

    const updatedAdCopy = await repos.adCopy.update(adCopyId, {
      status: body.status,
      primaryText: body.primaryText,
      headline: body.headline,
      description: body.description,
      approvalStatus: body.approvalStatus,
    });

    if (!updatedAdCopy) {
      return c.json(
        { status: 'error', error: 'update_failed', message: 'Failed to update ad copy' },
        500
      );
    }

    // Audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'update',
      targetType: 'ad_copy',
      targetId: adCopyId,
      before: { primaryText: adCopy.primaryText, headline: adCopy.headline },
      after: { primaryText: updatedAdCopy.primaryText, headline: updatedAdCopy.headline },
      requestId: authContext.requestId,
    });

    return c.json({
      status: 'ok',
      data: {
        id: updatedAdCopy.id,
        intentId: updatedAdCopy.intentId,
        version: updatedAdCopy.version,
        status: updatedAdCopy.status,
        primaryText: updatedAdCopy.primaryText,
        headline: updatedAdCopy.headline,
        description: updatedAdCopy.description,
        approvalStatus: updatedAdCopy.approvalStatus,
        createdAt: updatedAdCopy.createdAt,
        updatedAt: updatedAdCopy.updatedAt,
      },
    });
  });

  return variants;
}

export const variantRoutes = createVariantRoutes();
