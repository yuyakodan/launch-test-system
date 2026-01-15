/**
 * D1 Meta Entity Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count, insert } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { MetaEntity, MetaEntityType } from '../../types/entities.js';
import type {
  IMetaEntityRepository,
  CreateMetaEntityInput,
  UpdateMetaEntityInput,
  MetaEntityFilter,
} from '../interfaces/meta-entity.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * Database row type for meta_entities table
 */
interface MetaEntityRow {
  id: string;
  run_id: string;
  intent_id: string | null;
  entity_type: MetaEntityType;
  local_ref: string;
  remote_id: string | null;
  status: string;
  meta_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Meta Entity Repository
 */
export class D1MetaEntityRepository
  extends BaseD1Repository<MetaEntity, CreateMetaEntityInput, UpdateMetaEntityInput>
  implements IMetaEntityRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'runId',
    'intentId',
    'entityType',
    'localRef',
    'remoteId',
    'status',
    'metaJson',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'meta_entities');
  }

  protected rowToEntity(row: MetaEntityRow): MetaEntity {
    return {
      id: row.id,
      runId: row.run_id,
      intentId: row.intent_id,
      entityType: row.entity_type,
      localRef: row.local_ref,
      remoteId: row.remote_id,
      status: row.status,
      metaJson: row.meta_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateMetaEntityInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: ulid(),
      run_id: input.runId,
      intent_id: input.intentId ?? null,
      entity_type: input.entityType,
      local_ref: input.localRef,
      remote_id: input.remoteId ?? null,
      status: input.status ?? 'draft',
      meta_json: input.metaJson ?? '{}',
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateMetaEntityInput): Record<string, unknown> {
    return removeUndefined({
      remote_id: input.remoteId,
      status: input.status,
      meta_json: input.metaJson,
    });
  }

  async findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<MetaEntity>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Get total count
    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    // Get paginated results
    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<MetaEntityRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByIntentId(
    intentId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaEntity>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Get total count
    const countBuilder = count(this.tableName).where('intent_id', '=', intentId);
    const total = await this.executor.count(countBuilder);

    // Get paginated results
    const selectBuilder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<MetaEntityRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByLocalRef(runId: string, localRef: string): Promise<MetaEntity | null> {
    const builder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('local_ref', '=', localRef);

    const row = await this.executor.first<MetaEntityRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByRemoteId(remoteId: string): Promise<MetaEntity | null> {
    const builder = select(this.tableName).where('remote_id', '=', remoteId);
    const row = await this.executor.first<MetaEntityRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByRunAndType(
    runId: string,
    entityType: MetaEntityType,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaEntity>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Get total count
    const countBuilder = count(this.tableName)
      .where('run_id', '=', runId)
      .where('entity_type', '=', entityType);
    const total = await this.executor.count(countBuilder);

    // Get paginated results
    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('entity_type', '=', entityType)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<MetaEntityRow>(selectBuilder);
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
    filter: MetaEntityFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaEntity>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.runId) {
      countBuilder = countBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.intentId) {
      countBuilder = countBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.entityType) {
      countBuilder = countBuilder.where('entity_type', '=', filter.entityType);
    }
    if (filter.localRef) {
      countBuilder = countBuilder.where('local_ref', '=', filter.localRef);
    }
    if (filter.remoteId) {
      countBuilder = countBuilder.where('remote_id', '=', filter.remoteId);
    }
    if (filter.status) {
      countBuilder = countBuilder.where('status', '=', filter.status);
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.runId) {
      selectBuilder = selectBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.intentId) {
      selectBuilder = selectBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.entityType) {
      selectBuilder = selectBuilder.where('entity_type', '=', filter.entityType);
    }
    if (filter.localRef) {
      selectBuilder = selectBuilder.where('local_ref', '=', filter.localRef);
    }
    if (filter.remoteId) {
      selectBuilder = selectBuilder.where('remote_id', '=', filter.remoteId);
    }
    if (filter.status) {
      selectBuilder = selectBuilder.where('status', '=', filter.status);
    }

    selectBuilder = selectBuilder.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<MetaEntityRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async updateRemoteId(id: string, remoteId: string): Promise<MetaEntity | null> {
    return this.update(id, { remoteId });
  }

  async updateStatus(id: string, status: string): Promise<MetaEntity | null> {
    return this.update(id, { status });
  }

  async createBatch(inputs: CreateMetaEntityInput[]): Promise<MetaEntity[]> {
    if (inputs.length === 0) {
      return [];
    }

    const rows = inputs.map((input) => this.createInputToRow(input));
    const ids = rows.map((row) => row.id as string);

    // Insert all rows
    for (const row of rows) {
      const insertBuilder = insert(this.tableName).values(row);
      await this.executor.insert(insertBuilder);
    }

    // Fetch all created entities
    const entities: MetaEntity[] = [];
    for (const id of ids) {
      const entity = await this.findById(id);
      if (entity) {
        entities.push(entity);
      }
    }

    return entities;
  }
}
