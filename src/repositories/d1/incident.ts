/**
 * D1 Incident Repository implementation
 * CRUD operations for incidents table
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count, update as updateBuilder } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type {
  Incident,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '../../types/entities.js';
import type {
  IIncidentRepository,
  CreateIncidentInput,
  UpdateIncidentInput,
  IncidentFilter,
} from '../interfaces/incident.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * Database row type for incidents table
 */
interface IncidentRow {
  id: string;
  tenant_id: string;
  run_id: string | null;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reason: string;
  meta_json: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

/**
 * D1 Incident Repository
 */
export class D1IncidentRepository
  extends BaseD1Repository<Incident, CreateIncidentInput, UpdateIncidentInput>
  implements IIncidentRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'tenantId',
    'runId',
    'incidentType',
    'severity',
    'status',
    'reason',
    'metaJson',
    'createdAt',
    'updatedAt',
    'resolvedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'incidents');
  }

  protected rowToEntity(row: IncidentRow): Incident {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      runId: row.run_id,
      incidentType: row.incident_type,
      severity: row.severity,
      status: row.status,
      reason: row.reason,
      metaJson: row.meta_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      resolvedAt: row.resolved_at,
    };
  }

  protected createInputToRow(input: CreateIncidentInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: ulid(),
      tenant_id: input.tenantId,
      run_id: input.runId ?? null,
      incident_type: input.incidentType,
      severity: input.severity ?? 'medium',
      status: input.status ?? 'open',
      reason: input.reason,
      meta_json: input.metaJson ?? '{}',
      created_at: now,
      updated_at: now,
      resolved_at: null,
    };
  }

  protected updateInputToRow(input: UpdateIncidentInput): Record<string, unknown> {
    return removeUndefined({
      severity: input.severity,
      status: input.status,
      reason: input.reason,
      meta_json: input.metaJson,
      resolved_at: input.resolvedAt,
    });
  }

  /**
   * Find incidents by tenant ID
   */
  async findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('tenant_id', '=', tenantId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IncidentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Find incidents by run ID
   */
  async findByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IncidentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Find incidents by filter criteria
   */
  async findByFilter(
    filter: IncidentFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countQuery = count(this.tableName);
    countQuery = this.applyFilter(countQuery, filter);
    const total = await this.executor.count(countQuery);

    // Build select query
    let selectQuery = select(this.tableName);
    selectQuery = this.applyFilter(selectQuery, filter);
    selectQuery = selectQuery.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<IncidentRow>(selectQuery);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Apply filter to query builder
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilter(query: any, filter: IncidentFilter): any {
    if (filter.tenantId) {
      query = query.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.runId) {
      query = query.where('run_id', '=', filter.runId);
    }
    if (filter.incidentType) {
      query = query.where('incident_type', '=', filter.incidentType);
    }
    if (filter.severity) {
      query = query.where('severity', '=', filter.severity);
    }
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }
    // Note: statuses array would require IN clause - simplified for now
    if (filter.createdAfter) {
      query = query.where('created_at', '>=', filter.createdAfter);
    }
    if (filter.createdBefore) {
      query = query.where('created_at', '<=', filter.createdBefore);
    }
    return query;
  }

  /**
   * Find open incidents for a tenant
   */
  async findOpenByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('status', '!=', 'resolved');
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('status', '!=', 'resolved')
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IncidentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Find open incidents for a run
   */
  async findOpenByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName)
      .where('run_id', '=', runId)
      .where('status', '!=', 'resolved');
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('status', '!=', 'resolved')
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IncidentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Resolve an incident
   */
  async resolve(id: string, resolvedAt?: string): Promise<Incident | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const now = resolvedAt ?? this.now();
    const builder = updateBuilder(this.tableName)
      .set({
        status: 'resolved',
        resolved_at: now,
        updated_at: now,
      })
      .where('id', '=', id);

    await this.executor.update(builder);
    return this.findById(id);
  }

  /**
   * Mark incident as mitigating
   */
  async markMitigating(id: string): Promise<Incident | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const builder = updateBuilder(this.tableName)
      .set({
        status: 'mitigating',
        updated_at: this.now(),
      })
      .where('id', '=', id);

    await this.executor.update(builder);
    return this.findById(id);
  }

  /**
   * Count incidents by tenant ID
   */
  async countByTenantId(tenantId: string): Promise<number> {
    const builder = count(this.tableName).where('tenant_id', '=', tenantId);
    return this.executor.count(builder);
  }

  /**
   * Count open incidents by tenant ID
   */
  async countOpenByTenantId(tenantId: string): Promise<number> {
    const builder = count(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('status', '!=', 'resolved');
    return this.executor.count(builder);
  }

  /**
   * Count incidents by run ID
   */
  async countByRunId(runId: string): Promise<number> {
    const builder = count(this.tableName).where('run_id', '=', runId);
    return this.executor.count(builder);
  }

  /**
   * Check if a run has any open incidents
   */
  async hasOpenIncidents(runId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('run_id', '=', runId)
      .where('status', '!=', 'resolved');
    const total = await this.executor.count(builder);
    return total > 0;
  }

  /**
   * Check if incident belongs to tenant
   */
  async belongsToTenant(id: string, tenantId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', id)
      .where('tenant_id', '=', tenantId);
    const total = await this.executor.count(builder);
    return total > 0;
  }

  /**
   * Find latest incident for a run
   */
  async findLatestByRunId(runId: string): Promise<Incident | null> {
    const builder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<IncidentRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find incidents by type for a tenant
   */
  async findByType(
    tenantId: string,
    incidentType: IncidentType,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('incident_type', '=', incidentType);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('incident_type', '=', incidentType)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IncidentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }
}
