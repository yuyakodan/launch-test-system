/**
 * D1 Project and Project Asset Repository implementations
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { D1Executor, select, insert, del, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { Project, ProjectAsset } from '../../types/entities.js';
import type {
  IProjectRepository,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilter,
  IProjectAssetRepository,
  CreateProjectAssetInput,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for projects table
 */
interface ProjectRow {
  id: string;
  tenant_id: string;
  name: string;
  offer_json: string;
  cv_definition_json: string;
  ng_rules_json: string;
  brand_json: string;
  form_config_json: string;
  default_disclaimer: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for project_assets table
 */
interface ProjectAssetRow {
  id: string;
  project_id: string;
  asset_type: string;
  r2_key: string;
  meta_json: string;
  created_at: string;
}

/**
 * D1 Project Repository
 */
export class D1ProjectRepository
  extends BaseD1Repository<Project, CreateProjectInput, UpdateProjectInput>
  implements IProjectRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'tenantId',
    'name',
    'offerJson',
    'cvDefinitionJson',
    'ngRulesJson',
    'brandJson',
    'formConfigJson',
    'defaultDisclaimer',
    'archivedAt',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'projects');
  }

  protected rowToEntity(row: ProjectRow): Project {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      name: row.name,
      offerJson: row.offer_json,
      cvDefinitionJson: row.cv_definition_json,
      ngRulesJson: row.ng_rules_json,
      brandJson: row.brand_json,
      formConfigJson: row.form_config_json,
      defaultDisclaimer: row.default_disclaimer,
      archivedAt: row.archived_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateProjectInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      tenant_id: input.tenantId,
      name: input.name,
      offer_json: input.offerJson ?? '{}',
      cv_definition_json: input.cvDefinitionJson ?? '{}',
      ng_rules_json: input.ngRulesJson ?? '{}',
      brand_json: input.brandJson ?? '{}',
      form_config_json: input.formConfigJson ?? '{}',
      default_disclaimer: input.defaultDisclaimer ?? '',
      archived_at: null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateProjectInput): Record<string, unknown> {
    return removeUndefined({
      name: input.name,
      offer_json: input.offerJson,
      cv_definition_json: input.cvDefinitionJson,
      ng_rules_json: input.ngRulesJson,
      brand_json: input.brandJson,
      form_config_json: input.formConfigJson,
      default_disclaimer: input.defaultDisclaimer,
    });
  }

  async findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Project>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('tenant_id', '=', tenantId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<ProjectRow>(selectBuilder);
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
    filter: ProjectFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Project>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.tenantId) {
      countBuilder = countBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.nameContains) {
      countBuilder = countBuilder.where('name', 'LIKE', `%${filter.nameContains}%`);
    }
    if (!filter.includeArchived) {
      countBuilder = countBuilder.whereNull('archived_at');
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.tenantId) {
      selectBuilder = selectBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.nameContains) {
      selectBuilder = selectBuilder.where('name', 'LIKE', `%${filter.nameContains}%`);
    }
    if (!filter.includeArchived) {
      selectBuilder = selectBuilder.whereNull('archived_at');
    }

    selectBuilder = selectBuilder
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<ProjectRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findActiveByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Project>> {
    return this.findByFilter({ tenantId, includeArchived: false }, params);
  }

  async archive(id: string): Promise<Project | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const sql = `UPDATE ${this.tableName} SET archived_at = ?, updated_at = ? WHERE id = ?`;
    const now = this.now();
    await this.executor.raw(sql, [now, now, id]);

    return this.findById(id);
  }

  async unarchive(id: string): Promise<Project | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const sql = `UPDATE ${this.tableName} SET archived_at = NULL, updated_at = ? WHERE id = ?`;
    await this.executor.raw(sql, [this.now(), id]);

    return this.findById(id);
  }

  async belongsToTenant(projectId: string, tenantId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', projectId)
      .where('tenant_id', '=', tenantId);

    const total = await this.executor.count(builder);
    return total > 0;
  }
}

/**
 * D1 Project Asset Repository
 */
export class D1ProjectAssetRepository implements IProjectAssetRepository {
  private executor: D1Executor;
  private tableName = 'project_assets';

  constructor(db: D1Database) {
    this.executor = new D1Executor(db);
  }

  private now(): string {
    return new Date().toISOString();
  }

  private rowToEntity(row: ProjectAssetRow): ProjectAsset {
    return {
      id: row.id,
      projectId: row.project_id,
      assetType: row.asset_type,
      r2Key: row.r2_key,
      metaJson: row.meta_json,
      createdAt: row.created_at,
    };
  }

  async findById(id: string): Promise<ProjectAsset | null> {
    const builder = select(this.tableName).where('id', '=', id);
    const row = await this.executor.first<ProjectAssetRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByProjectId(projectId: string): Promise<ProjectAsset[]> {
    const builder = select(this.tableName)
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'DESC');

    const rows = await this.executor.all<ProjectAssetRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByProjectIdAndType(
    projectId: string,
    assetType: string
  ): Promise<ProjectAsset[]> {
    const builder = select(this.tableName)
      .where('project_id', '=', projectId)
      .where('asset_type', '=', assetType)
      .orderBy('created_at', 'DESC');

    const rows = await this.executor.all<ProjectAssetRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async create(input: CreateProjectAssetInput): Promise<ProjectAsset> {
    const row = {
      id: input.id ?? ulid(),
      project_id: input.projectId,
      asset_type: input.assetType,
      r2_key: input.r2Key,
      meta_json: input.metaJson ?? '{}',
      created_at: this.now(),
    };

    const builder = insert(this.tableName).values(row);
    await this.executor.insert(builder);

    const created = await this.findById(row.id);
    if (!created) {
      throw new Error('Failed to create project asset');
    }

    return created;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    const builder = del(this.tableName).where('id', '=', id);
    await this.executor.delete(builder);
    return true;
  }

  async deleteByProjectId(projectId: string): Promise<number> {
    const assets = await this.findByProjectId(projectId);
    if (assets.length === 0) {
      return 0;
    }

    const builder = del(this.tableName).where('project_id', '=', projectId);
    const result = await this.executor.delete(builder);
    return result.meta.changes;
  }
}
