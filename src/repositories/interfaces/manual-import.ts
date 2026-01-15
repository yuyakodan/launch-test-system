/**
 * Manual Import Repository Interface
 * Handles CRUD operations for manual_imports table
 */

import type { ManualImport, ManualImportType } from '../../types/entities.js';
import type { IBaseRepository, PaginationParams, PaginatedResult } from './base.js';

/**
 * Input for creating a manual import record
 */
export interface CreateManualImportInput {
  /** Optional: Specify ID (defaults to ULID) */
  id?: string;
  /** Tenant ID */
  tenantId: string;
  /** Run ID */
  runId: string;
  /** Import type */
  importType: ManualImportType;
  /** R2 key where CSV file is stored */
  fileR2Key: string;
  /** Import summary JSON */
  summaryJson?: string;
  /** User who performed import */
  createdByUserId?: string | null;
}

/**
 * Update input for manual import (limited - mainly for status updates)
 */
export interface UpdateManualImportInput {
  /** Updated summary JSON */
  summaryJson?: string;
}

/**
 * Filter options for manual imports
 */
export interface ManualImportFilter {
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by run ID */
  runId?: string;
  /** Filter by import type */
  importType?: ManualImportType;
  /** Filter by user who created */
  createdByUserId?: string;
  /** Filter by date range (from) */
  createdFrom?: string;
  /** Filter by date range (to) */
  createdTo?: string;
}

/**
 * Manual Import Repository interface
 */
export interface IManualImportRepository
  extends IBaseRepository<ManualImport, CreateManualImportInput, UpdateManualImportInput> {
  /**
   * Find imports by run ID
   */
  findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<ManualImport>>;

  /**
   * Find imports by tenant ID
   */
  findByTenantId(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<ManualImport>>;

  /**
   * Find imports by filter
   */
  findByFilter(
    filter: ManualImportFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<ManualImport>>;

  /**
   * Find imports by type for a run
   */
  findByRunIdAndType(
    runId: string,
    importType: ManualImportType,
    params?: PaginationParams
  ): Promise<PaginatedResult<ManualImport>>;

  /**
   * Get latest import for a run by type
   */
  getLatestByRunIdAndType(runId: string, importType: ManualImportType): Promise<ManualImport | null>;

  /**
   * Create a new import record
   */
  create(input: CreateManualImportInput): Promise<ManualImport>;

  /**
   * Update import record
   */
  update(id: string, input: UpdateManualImportInput): Promise<ManualImport | null>;

  /**
   * Check if import belongs to tenant
   */
  belongsToTenant(importId: string, tenantId: string): Promise<boolean>;

  /**
   * Check if import belongs to run
   */
  belongsToRun(importId: string, runId: string): Promise<boolean>;

  /**
   * Count imports by type for a run
   */
  countByRunIdAndType(runId: string, importType: ManualImportType): Promise<number>;
}
