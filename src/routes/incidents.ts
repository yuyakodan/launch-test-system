/**
 * Incident Routes
 * Handles incident management endpoints
 *
 * GET /incidents - List incidents
 * POST /incidents - Create incident
 * PATCH /incidents/:id - Update incident
 * POST /incidents/:id/resolve - Resolve incident
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { IncidentService, createIncidentService } from '../services/incident.js';
import { D1IncidentRepository } from '../repositories/d1/incident.js';
import { D1RunRepository } from '../repositories/d1/run.js';
import type {
  CreateIncidentRequest,
  UpdateIncidentRequest,
  ResolveIncidentRequest,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '../types/incident.js';

type IncidentEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Valid incident types
 */
const VALID_INCIDENT_TYPES: IncidentType[] = [
  'meta_rejected',
  'meta_account_issue',
  'api_outage',
  'measurement_issue',
  'other',
];

/**
 * Valid severity levels
 */
const VALID_SEVERITIES: IncidentSeverity[] = ['low', 'medium', 'high', 'critical'];

/**
 * Valid status values
 */
const VALID_STATUSES: IncidentStatus[] = ['open', 'mitigating', 'resolved'];

/**
 * Create incident service with dependencies
 */
function createService(db: D1Database): IncidentService {
  return createIncidentService({
    incidentRepo: new D1IncidentRepository(db),
    runRepo: new D1RunRepository(db),
  });
}

/**
 * Create incident routes
 */
export function createIncidentRoutes() {
  const incidents = new Hono<IncidentEnv>();

  // Apply auth middleware to all routes
  incidents.use('*', authMiddleware());

  /**
   * GET /incidents - List incidents
   *
   * Query parameters:
   * - runId: Filter by run ID
   * - status: Filter by status (open, mitigating, resolved)
   * - incidentType: Filter by type
   * - limit: Number of results (default 100)
   * - offset: Offset for pagination
   */
  incidents.get('/', requirePermission('incident', 'read'), async (c) => {
    const authContext = c.get('auth');
    const service = createService(c.env.DB);

    // Parse query parameters
    const runId = c.req.query('runId');
    const status = c.req.query('status') as IncidentStatus | undefined;
    const incidentType = c.req.query('incidentType') as IncidentType | undefined;
    const limit = parseInt(c.req.query('limit') ?? '100', 10);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        },
        400
      );
    }

    // Validate incidentType if provided
    if (incidentType && !VALID_INCIDENT_TYPES.includes(incidentType)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: `Invalid incidentType. Must be one of: ${VALID_INCIDENT_TYPES.join(', ')}`,
        },
        400
      );
    }

    try {
      const result = await service.listIncidents(
        {
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          requestId: authContext.requestId,
        },
        {
          runId,
          status,
          incidentType,
          limit,
          offset,
        }
      );

      return c.json({
        status: 'ok',
        data: result,
      });
    } catch (error) {
      console.error('Error listing incidents:', error);
      return c.json(
        {
          status: 'error',
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  });

  /**
   * POST /incidents - Create a new incident
   *
   * Request body:
   * - runId?: string - Optional run ID
   * - incidentType: IncidentType - Type of incident
   * - severity?: IncidentSeverity - Severity level
   * - reason: string - Description of the incident
   * - meta?: IncidentMeta - Additional metadata
   */
  incidents.post('/', requirePermission('incident', 'create'), async (c) => {
    const authContext = c.get('auth');
    const service = createService(c.env.DB);
    const auditService = new AuditService(c.env.DB);

    // Parse request body
    let body: CreateIncidentRequest;
    try {
      body = await c.req.json<CreateIncidentRequest>();
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
    if (!body.incidentType) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'incidentType is required',
        },
        400
      );
    }

    if (!VALID_INCIDENT_TYPES.includes(body.incidentType)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: `Invalid incidentType. Must be one of: ${VALID_INCIDENT_TYPES.join(', ')}`,
        },
        400
      );
    }

    if (!body.reason || typeof body.reason !== 'string' || body.reason.trim() === '') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'reason is required and must be a non-empty string',
        },
        400
      );
    }

    // Validate severity if provided
    if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`,
        },
        400
      );
    }

    try {
      const result = await service.createIncident(
        {
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          requestId: authContext.requestId,
        },
        body
      );

      // Log audit
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'create',
        targetType: 'incident',
        targetId: result.incident.id,
        before: {},
        after: {
          incidentType: result.incident.incidentType,
          severity: result.incident.severity,
          status: result.incident.status,
          runId: result.incident.runId,
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json(
        {
          status: 'ok',
          data: result,
        },
        201
      );
    } catch (error) {
      console.error('Error creating incident:', error);
      return c.json(
        {
          status: 'error',
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  });

  /**
   * GET /incidents/:id - Get a specific incident
   */
  incidents.get('/:id', requirePermission('incident', 'read'), async (c) => {
    const authContext = c.get('auth');
    const service = createService(c.env.DB);
    const id = c.req.param('id');

    try {
      const incident = await service.getIncident(
        {
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          requestId: authContext.requestId,
        },
        id
      );

      if (!incident) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Incident not found',
          },
          404
        );
      }

      return c.json({
        status: 'ok',
        data: incident,
      });
    } catch (error) {
      console.error('Error getting incident:', error);
      return c.json(
        {
          status: 'error',
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  });

  /**
   * PATCH /incidents/:id - Update an incident
   *
   * Request body:
   * - severity?: IncidentSeverity - Update severity
   * - status?: IncidentStatus - Update status
   * - reason?: string - Update reason
   * - meta?: IncidentMeta - Update metadata
   */
  incidents.patch('/:id', requirePermission('incident', 'update'), async (c) => {
    const authContext = c.get('auth');
    const service = createService(c.env.DB);
    const auditService = new AuditService(c.env.DB);
    const id = c.req.param('id');

    // Get existing incident for audit
    const existingIncident = await service.getIncident(
      { tenantId: authContext.tenantId },
      id
    );

    if (!existingIncident) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Incident not found',
        },
        404
      );
    }

    // Parse request body
    let body: UpdateIncidentRequest;
    try {
      body = await c.req.json<UpdateIncidentRequest>();
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

    // Validate severity if provided
    if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}`,
        },
        400
      );
    }

    // Validate status if provided
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
        },
        400
      );
    }

    try {
      const updated = await service.updateIncident(
        {
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          requestId: authContext.requestId,
        },
        id,
        body
      );

      if (!updated) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Incident not found',
          },
          404
        );
      }

      // Log audit
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'update',
        targetType: 'incident',
        targetId: id,
        before: {
          severity: existingIncident.severity,
          status: existingIncident.status,
        },
        after: {
          severity: updated.severity,
          status: updated.status,
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json({
        status: 'ok',
        data: updated,
      });
    } catch (error) {
      console.error('Error updating incident:', error);
      return c.json(
        {
          status: 'error',
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  });

  /**
   * POST /incidents/:id/resolve - Resolve an incident
   *
   * Request body:
   * - resolutionNotes?: string - Notes about the resolution
   * - preventionMemo?: string - Prevention memo to add to NG rules
   * - addToNgRules?: boolean - Whether to add prevention memo to NG rules
   */
  incidents.post('/:id/resolve', requirePermission('incident', 'update'), async (c) => {
    const authContext = c.get('auth');
    const service = createService(c.env.DB);
    const auditService = new AuditService(c.env.DB);
    const id = c.req.param('id');

    // Get existing incident for audit
    const existingIncident = await service.getIncident(
      { tenantId: authContext.tenantId },
      id
    );

    if (!existingIncident) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Incident not found',
        },
        404
      );
    }

    // Check if already resolved
    if (existingIncident.status === 'resolved') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Incident is already resolved',
        },
        400
      );
    }

    // Parse request body
    let body: ResolveIncidentRequest = {};
    try {
      const rawBody = await c.req.text();
      if (rawBody) {
        body = JSON.parse(rawBody) as ResolveIncidentRequest;
      }
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

    try {
      const result = await service.resolveIncident(
        {
          tenantId: authContext.tenantId,
          userId: authContext.userId,
          requestId: authContext.requestId,
        },
        id,
        body
      );

      if (!result) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Incident not found',
          },
          404
        );
      }

      // Log audit
      await auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action: 'resolve',
        targetType: 'incident',
        targetId: id,
        before: {
          status: existingIncident.status,
        },
        after: {
          status: 'resolved',
          resolutionNotes: body.resolutionNotes,
          preventionMemo: body.preventionMemo,
        },
        requestId: authContext.requestId,
        ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
        userAgent: c.req.header('User-Agent') ?? undefined,
      });

      return c.json({
        status: 'ok',
        data: result,
      });
    } catch (error) {
      console.error('Error resolving incident:', error);
      return c.json(
        {
          status: 'error',
          error: 'internal_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        500
      );
    }
  });

  return incidents;
}

export const incidentRoutes = createIncidentRoutes();
