/**
 * D1 Deployment Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { Deployment, DeploymentStatus } from '../../types/entities.js';
import type {
  IDeploymentRepository,
  CreateDeploymentInput,
  UpdateDeploymentInput,
  DeploymentFilter,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for deployments table
 */
interface DeploymentRow {
  id: string;
  run_id: string;
  status: DeploymentStatus;
  urls_json: string;
  snapshot_manifest_r2_key: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Deployment Repository
 */
export class D1DeploymentRepository
  extends BaseD1Repository<Deployment, CreateDeploymentInput, UpdateDeploymentInput>
  implements IDeploymentRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'runId',
    'status',
    'urlsJson',
    'snapshotManifestR2Key',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'deployments');
  }

  protected rowToEntity(row: DeploymentRow): Deployment {
    return {
      id: row.id,
      runId: row.run_id,
      status: row.status,
      urlsJson: row.urls_json,
      snapshotManifestR2Key: row.snapshot_manifest_r2_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateDeploymentInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      run_id: input.runId,
      status: input.status ?? 'draft',
      urls_json: input.urlsJson ?? '{}',
      snapshot_manifest_r2_key: input.snapshotManifestR2Key ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateDeploymentInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      urls_json: input.urlsJson,
      snapshot_manifest_r2_key: input.snapshotManifestR2Key,
    });
  }

  async findByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Deployment>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<DeploymentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findLatestByRunId(runId: string): Promise<Deployment | null> {
    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<DeploymentRow>(selectBuilder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByFilter(
    filter: DeploymentFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Deployment>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.runId) {
      countBuilder = countBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.runId) {
      selectBuilder = selectBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }

    selectBuilder = selectBuilder.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<DeploymentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findPublishedByRunId(runId: string): Promise<Deployment | null> {
    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('status', '=', 'published')
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<DeploymentRow>(selectBuilder);
    return row ? this.rowToEntity(row) : null;
  }

  async updateStatus(id: string, status: DeploymentStatus): Promise<Deployment | null> {
    return this.update(id, { status });
  }

  async markPublished(id: string): Promise<Deployment | null> {
    return this.update(id, { status: 'published' });
  }

  async markRolledBack(id: string): Promise<Deployment | null> {
    return this.update(id, { status: 'rolled_back' });
  }

  async belongsToRun(deploymentId: string, runId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', deploymentId)
      .where('run_id', '=', runId);

    const total = await this.executor.count(builder);
    return total > 0;
  }
}
