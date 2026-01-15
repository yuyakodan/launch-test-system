/**
 * D1 Manual Import Repository implementation
 * Handles CRUD operations for manual_imports table
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { ManualImport, ManualImportType } from '../../types/entities.js';
import type {
  IManualImportRepository,
  CreateManualImportInput,
  UpdateManualImportInput,
  ManualImportFilter,
} from '../interfaces/manual-import.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * Database row type for manual_imports table
 */
interface ManualImportRow {
  id: string;
  tenant_id: string;
  run_id: string;
  import_type: ManualImportType;
  file_r2_key: string;
  summary_json: string;
  created_by_user_id: string | null;
  created_at: string;
}

/**
 * D1 Manual Import Repository
 */
export class D1ManualImportRepository
  extends BaseD1Repository<ManualImport, CreateManualImportInput, UpdateManualImportInput>
  implements IManualImportRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'tenantId',
    'runId',
    'importType',
    'fileR2Key',
    'summaryJson',
    'createdByUserId',
    'createdAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'manual_imports');
  }

  protected rowToEntity(row: ManualImportRow): ManualImport {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      runId: row.run_id,
      importType: row.import_type,
      fileR2Key: row.file_r2_key,
      summaryJson: row.summary_json,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
    };
  }

  protected createInputToRow(input: CreateManualImportInput): Record<string, unknown> {
    return {
      id: input.id ?? ulid(),
      tenant_id: input.tenantId,
      run_id: input.runId,
      import_type: input.importType,
      file_r2_key: input.fileR2Key,
      summary_json: input.summaryJson ?? '{}',
      created_by_user_id: input.createdByUserId ?? null,
      created_at: this.now(),
    };
  }

  protected updateInputToRow(input: UpdateManualImportInput): Record<string, unknown> {
    return removeUndefined({
      summary_json: input.summaryJson,
    });
  }

  async findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<ManualImport>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<ManualImportRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<ManualImport>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('tenant_id', '=', tenantId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<ManualImportRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByFilter(
    filter: ManualImportFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<ManualImport>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.tenantId) {
      countBuilder = countBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.runId) {
      countBuilder = countBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.importType) {
      countBuilder = countBuilder.where('import_type', '=', filter.importType);
    }
    if (filter.createdByUserId) {
      countBuilder = countBuilder.where('created_by_user_id', '=', filter.createdByUserId);
    }
    if (filter.createdFrom) {
      countBuilder = countBuilder.where('created_at', '>=', filter.createdFrom);
    }
    if (filter.createdTo) {
      countBuilder = countBuilder.where('created_at', '<=', filter.createdTo);
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.tenantId) {
      selectBuilder = selectBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.runId) {
      selectBuilder = selectBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.importType) {
      selectBuilder = selectBuilder.where('import_type', '=', filter.importType);
    }
    if (filter.createdByUserId) {
      selectBuilder = selectBuilder.where('created_by_user_id', '=', filter.createdByUserId);
    }
    if (filter.createdFrom) {
      selectBuilder = selectBuilder.where('created_at', '>=', filter.createdFrom);
    }
    if (filter.createdTo) {
      selectBuilder = selectBuilder.where('created_at', '<=', filter.createdTo);
    }

    selectBuilder = selectBuilder.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<ManualImportRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByRunIdAndType(
    runId: string,
    importType: ManualImportType,
    params?: PaginationParams
  ): Promise<PaginatedResult<ManualImport>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName)
      .where('run_id', '=', runId)
      .where('import_type', '=', importType);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('import_type', '=', importType)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<ManualImportRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async getLatestByRunIdAndType(
    runId: string,
    importType: ManualImportType
  ): Promise<ManualImport | null> {
    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('import_type', '=', importType)
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<ManualImportRow>(selectBuilder);
    return row ? this.rowToEntity(row) : null;
  }

  async belongsToTenant(importId: string, tenantId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', importId)
      .where('tenant_id', '=', tenantId);

    const total = await this.executor.count(builder);
    return total > 0;
  }

  async belongsToRun(importId: string, runId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', importId)
      .where('run_id', '=', runId);

    const total = await this.executor.count(builder);
    return total > 0;
  }

  async countByRunIdAndType(runId: string, importType: ManualImportType): Promise<number> {
    const builder = count(this.tableName)
      .where('run_id', '=', runId)
      .where('import_type', '=', importType);

    return this.executor.count(builder);
  }
}
