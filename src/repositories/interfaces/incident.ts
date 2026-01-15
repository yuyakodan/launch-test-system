/**
 * Incident Repository Interface
 * CRUD operations for incidents table
 */

import type {
  IBaseRepository,
  PaginationParams,
  PaginatedResult,
} from './base.js';
import type {
  Incident,
  IncidentType,
  IncidentSeverity,
  IncidentStatus,
} from '../../types/entities.js';

/**
 * Create incident input
 */
export interface CreateIncidentInput {
  /** Tenant ID */
  tenantId: string;
  /** Run ID (optional) */
  runId?: string | null;
  /** Incident type */
  incidentType: IncidentType;
  /** Severity */
  severity?: IncidentSeverity;
  /** Status (defaults to 'open') */
  status?: IncidentStatus;
  /** Reason/description */
  reason: string;
  /** Additional metadata as JSON string */
  metaJson?: string;
}

/**
 * Update incident input
 */
export interface UpdateIncidentInput {
  /** Update severity */
  severity?: IncidentSeverity;
  /** Update status */
  status?: IncidentStatus;
  /** Update reason */
  reason?: string;
  /** Update metadata */
  metaJson?: string;
  /** Resolution timestamp (set when status becomes 'resolved') */
  resolvedAt?: string | null;
}

/**
 * Incident filter criteria
 */
export interface IncidentFilter {
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by run ID */
  runId?: string;
  /** Filter by incident type */
  incidentType?: IncidentType;
  /** Filter by severity */
  severity?: IncidentSeverity;
  /** Filter by status */
  status?: IncidentStatus;
  /** Filter by multiple statuses */
  statuses?: IncidentStatus[];
  /** Filter by created after date */
  createdAfter?: string;
  /** Filter by created before date */
  createdBefore?: string;
}

/**
 * Incident Repository Interface
 */
export interface IIncidentRepository
  extends IBaseRepository<Incident, CreateIncidentInput, UpdateIncidentInput> {
  /**
   * Find incidents by tenant ID
   */
  findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>>;

  /**
   * Find incidents by run ID
   */
  findByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>>;

  /**
   * Find incidents by filter criteria
   */
  findByFilter(
    filter: IncidentFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>>;

  /**
   * Find open incidents for a tenant
   */
  findOpenByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>>;

  /**
   * Find open incidents for a run
   */
  findOpenByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>>;

  /**
   * Resolve an incident
   * Sets status to 'resolved' and records resolvedAt timestamp
   */
  resolve(id: string, resolvedAt?: string): Promise<Incident | null>;

  /**
   * Mark incident as mitigating
   */
  markMitigating(id: string): Promise<Incident | null>;

  /**
   * Count incidents by tenant ID
   */
  countByTenantId(tenantId: string): Promise<number>;

  /**
   * Count open incidents by tenant ID
   */
  countOpenByTenantId(tenantId: string): Promise<number>;

  /**
   * Count incidents by run ID
   */
  countByRunId(runId: string): Promise<number>;

  /**
   * Check if a run has any open incidents
   */
  hasOpenIncidents(runId: string): Promise<boolean>;

  /**
   * Check if incident belongs to tenant
   */
  belongsToTenant(id: string, tenantId: string): Promise<boolean>;

  /**
   * Find latest incident for a run
   */
  findLatestByRunId(runId: string): Promise<Incident | null>;

  /**
   * Find incidents by type for a tenant
   */
  findByType(
    tenantId: string,
    incidentType: IncidentType,
    params?: PaginationParams
  ): Promise<PaginatedResult<Incident>>;
}
