/**
 * Incident Service
 * Handles incident management logic according to requirements.md section 6
 *
 * Key responsibilities:
 * - Create incidents for Meta rejected, account issues, API outages, measurement issues
 * - Handle rejected flow (pause run, notify, track resolution)
 * - Handle account freeze / API outage flow
 * - Fallback to Manual Mode
 */

import type { Incident, IncidentType, IncidentSeverity, IncidentStatus, Run } from '../types/entities.js';
import type {
  IncidentMeta,
  IncidentWithMeta,
  IncidentActionResult,
  CreateIncidentRequest,
  UpdateIncidentRequest,
  ResolveIncidentRequest,
} from '../types/incident.js';
import type { IIncidentRepository } from '../repositories/interfaces/incident.js';
import type { IRunRepository } from '../repositories/interfaces/run.js';

/**
 * Dependencies for IncidentService
 */
export interface IncidentServiceDependencies {
  incidentRepo: IIncidentRepository;
  runRepo: IRunRepository;
  /** Optional notification sender */
  sendNotification?: (tenantId: string, type: string, payload: Record<string, unknown>) => Promise<void>;
  /** Optional audit logger */
  logAudit?: (entry: Record<string, unknown>) => Promise<void>;
}

/**
 * Incident service context
 */
export interface IncidentServiceContext {
  tenantId: string;
  userId?: string;
  requestId?: string;
}

/**
 * Incident Service class
 */
export class IncidentService {
  private deps: IncidentServiceDependencies;

  constructor(deps: IncidentServiceDependencies) {
    this.deps = deps;
  }

  /**
   * Create a new incident
   * Implements section 6.2 and 6.3 flows
   */
  async createIncident(
    ctx: IncidentServiceContext,
    input: CreateIncidentRequest
  ): Promise<IncidentActionResult> {
    const { incidentRepo, runRepo, sendNotification, logAudit } = this.deps;

    // Validate run if provided
    let run: Run | null = null;
    if (input.runId) {
      run = await runRepo.findById(input.runId);
      if (!run) {
        throw new Error(`Run not found: ${input.runId}`);
      }
    }

    // Create the incident
    const incident = await incidentRepo.create({
      tenantId: ctx.tenantId,
      runId: input.runId ?? null,
      incidentType: input.incidentType,
      severity: input.severity ?? this.getDefaultSeverity(input.incidentType),
      reason: input.reason,
      metaJson: input.meta ? JSON.stringify(input.meta) : '{}',
    });

    const result: IncidentActionResult = {
      success: true,
      incident: this.toIncidentWithMeta(incident),
      actions: {},
    };

    // Handle automatic actions based on incident type
    // Section 6.2: Rejected flow - pause running runs
    if (
      input.incidentType === 'meta_rejected' &&
      run &&
      run.status === 'Running'
    ) {
      await runRepo.updateStatus(run.id, 'Paused');
      result.actions!.runPaused = true;
    }

    // Section 6.3: Account freeze or API outage - pause all running runs if critical
    if (
      (input.incidentType === 'meta_account_issue' || input.incidentType === 'api_outage') &&
      (input.severity === 'critical' || input.severity === 'high') &&
      run &&
      run.status === 'Running'
    ) {
      await runRepo.updateStatus(run.id, 'Paused');
      result.actions!.runPaused = true;
    }

    // Send notification for all incidents
    if (sendNotification) {
      try {
        await sendNotification(ctx.tenantId, 'incident.created', {
          incidentId: incident.id,
          incidentType: incident.incidentType,
          severity: incident.severity,
          reason: incident.reason,
          runId: incident.runId,
        });
        result.actions!.notificationSent = true;
      } catch (error) {
        console.error('Failed to send incident notification:', error);
      }
    }

    // Log audit
    if (logAudit) {
      await logAudit({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'incident.create',
        targetType: 'incident',
        targetId: incident.id,
        after: {
          incidentType: incident.incidentType,
          severity: incident.severity,
          runId: incident.runId,
        },
        requestId: ctx.requestId,
      });
    }

    return result;
  }

  /**
   * Update an incident
   */
  async updateIncident(
    ctx: IncidentServiceContext,
    id: string,
    input: UpdateIncidentRequest
  ): Promise<IncidentWithMeta | null> {
    const { incidentRepo, logAudit } = this.deps;

    // Verify incident belongs to tenant
    const belongsToTenant = await incidentRepo.belongsToTenant(id, ctx.tenantId);
    if (!belongsToTenant) {
      return null;
    }

    const before = await incidentRepo.findById(id);
    if (!before) {
      return null;
    }

    // Build update input
    const updateInput: { severity?: IncidentSeverity; status?: IncidentStatus; reason?: string; metaJson?: string } = {};

    if (input.severity !== undefined) {
      updateInput.severity = input.severity;
    }
    if (input.status !== undefined) {
      updateInput.status = input.status;
    }
    if (input.reason !== undefined) {
      updateInput.reason = input.reason;
    }
    if (input.meta !== undefined) {
      // Merge with existing meta
      const existingMeta = this.parseMeta(before.metaJson);
      updateInput.metaJson = JSON.stringify({ ...existingMeta, ...input.meta });
    }

    const updated = await incidentRepo.update(id, updateInput);
    if (!updated) {
      return null;
    }

    // Log audit
    if (logAudit) {
      await logAudit({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'incident.update',
        targetType: 'incident',
        targetId: id,
        before: {
          severity: before.severity,
          status: before.status,
        },
        after: {
          severity: updated.severity,
          status: updated.status,
        },
        requestId: ctx.requestId,
      });
    }

    return this.toIncidentWithMeta(updated);
  }

  /**
   * Resolve an incident
   * Section 6.2: Final step - record resolution and optionally update NG rules
   */
  async resolveIncident(
    ctx: IncidentServiceContext,
    id: string,
    input: ResolveIncidentRequest
  ): Promise<IncidentActionResult | null> {
    const { incidentRepo, sendNotification, logAudit } = this.deps;

    // Verify incident belongs to tenant
    const belongsToTenant = await incidentRepo.belongsToTenant(id, ctx.tenantId);
    if (!belongsToTenant) {
      return null;
    }

    const before = await incidentRepo.findById(id);
    if (!before) {
      return null;
    }

    // Update metadata with resolution notes
    let meta = this.parseMeta(before.metaJson);
    if (input.resolutionNotes) {
      meta.resolutionNotes = input.resolutionNotes;
    }
    if (input.preventionMemo) {
      meta.preventionMemo = input.preventionMemo;
    }

    // Update with new metadata before resolving
    await incidentRepo.update(id, {
      metaJson: JSON.stringify(meta),
    });

    // Resolve the incident
    const resolved = await incidentRepo.resolve(id);
    if (!resolved) {
      return null;
    }

    const result: IncidentActionResult = {
      success: true,
      incident: this.toIncidentWithMeta(resolved),
      actions: {},
    };

    // TODO: If addToNgRules is true, update project NG rules
    // This would require project repository and would add prevention memo
    // to project.ng_rules_json (blocked_terms or blocked_patterns)
    if (input.addToNgRules && input.preventionMemo) {
      // Placeholder for NG rules update logic
      result.actions!.ngRulesUpdated = false; // Not implemented yet
    }

    // Send resolution notification
    if (sendNotification) {
      try {
        await sendNotification(ctx.tenantId, 'incident.resolved', {
          incidentId: resolved.id,
          incidentType: resolved.incidentType,
          severity: resolved.severity,
          runId: resolved.runId,
          resolutionNotes: input.resolutionNotes,
        });
        result.actions!.notificationSent = true;
      } catch (error) {
        console.error('Failed to send resolution notification:', error);
      }
    }

    // Log audit
    if (logAudit) {
      await logAudit({
        tenantId: ctx.tenantId,
        actorUserId: ctx.userId,
        action: 'incident.resolve',
        targetType: 'incident',
        targetId: id,
        before: {
          status: before.status,
        },
        after: {
          status: 'resolved',
          resolutionNotes: input.resolutionNotes,
        },
        requestId: ctx.requestId,
      });
    }

    return result;
  }

  /**
   * Get incident by ID
   */
  async getIncident(
    ctx: IncidentServiceContext,
    id: string
  ): Promise<IncidentWithMeta | null> {
    const { incidentRepo } = this.deps;

    const incident = await incidentRepo.findById(id);
    if (!incident) {
      return null;
    }

    // Verify tenant ownership
    if (incident.tenantId !== ctx.tenantId) {
      return null;
    }

    return this.toIncidentWithMeta(incident);
  }

  /**
   * List incidents for tenant
   */
  async listIncidents(
    ctx: IncidentServiceContext,
    options?: {
      runId?: string;
      status?: IncidentStatus;
      incidentType?: IncidentType;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: IncidentWithMeta[]; total: number; hasMore: boolean }> {
    const { incidentRepo } = this.deps;

    const result = await incidentRepo.findByFilter(
      {
        tenantId: ctx.tenantId,
        runId: options?.runId,
        status: options?.status,
        incidentType: options?.incidentType,
      },
      {
        limit: options?.limit ?? 100,
        offset: options?.offset ?? 0,
      }
    );

    return {
      items: result.items.map((i) => this.toIncidentWithMeta(i)),
      total: result.total,
      hasMore: result.hasMore,
    };
  }

  /**
   * Check if run has open incidents
   */
  async hasOpenIncidents(runId: string): Promise<boolean> {
    return this.deps.incidentRepo.hasOpenIncidents(runId);
  }

  /**
   * Get default severity based on incident type
   */
  private getDefaultSeverity(incidentType: IncidentType): IncidentSeverity {
    switch (incidentType) {
      case 'meta_rejected':
        return 'medium';
      case 'meta_account_issue':
        return 'critical';
      case 'api_outage':
        return 'high';
      case 'measurement_issue':
        return 'medium';
      case 'other':
      default:
        return 'low';
    }
  }

  /**
   * Parse metadata JSON
   */
  private parseMeta(metaJson: string): IncidentMeta {
    try {
      return JSON.parse(metaJson) as IncidentMeta;
    } catch {
      return {};
    }
  }

  /**
   * Convert Incident to IncidentWithMeta
   */
  private toIncidentWithMeta(incident: Incident): IncidentWithMeta {
    return {
      id: incident.id,
      tenantId: incident.tenantId,
      runId: incident.runId,
      incidentType: incident.incidentType,
      severity: incident.severity,
      status: incident.status,
      reason: incident.reason,
      meta: this.parseMeta(incident.metaJson),
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
      resolvedAt: incident.resolvedAt,
    };
  }
}

/**
 * Create IncidentService with repository dependencies
 */
export function createIncidentService(deps: IncidentServiceDependencies): IncidentService {
  return new IncidentService(deps);
}
