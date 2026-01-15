/**
 * D1 Meta Connection Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { MetaConnection, MetaConnectionStatus } from '../../types/entities.js';
import type {
  IMetaConnectionRepository,
  CreateMetaConnectionInput,
  UpdateMetaConnectionInput,
  MetaConnectionFilter,
} from '../interfaces/meta-connection.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * Database row type for meta_connections table
 */
interface MetaConnectionRow {
  id: string;
  tenant_id: string;
  status: MetaConnectionStatus;
  token_ref: string;
  ad_account_id: string | null;
  pixel_id: string | null;
  page_id: string | null;
  ig_user_id: string | null;
  scopes_json: string;
  meta_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Meta Connection Repository
 */
export class D1MetaConnectionRepository
  extends BaseD1Repository<MetaConnection, CreateMetaConnectionInput, UpdateMetaConnectionInput>
  implements IMetaConnectionRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'tenantId',
    'status',
    'tokenRef',
    'adAccountId',
    'pixelId',
    'pageId',
    'igUserId',
    'scopesJson',
    'metaJson',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'meta_connections');
  }

  protected rowToEntity(row: MetaConnectionRow): MetaConnection {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      status: row.status,
      tokenRef: row.token_ref,
      adAccountId: row.ad_account_id,
      pixelId: row.pixel_id,
      pageId: row.page_id,
      igUserId: row.ig_user_id,
      scopesJson: row.scopes_json,
      metaJson: row.meta_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateMetaConnectionInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: ulid(),
      tenant_id: input.tenantId,
      status: 'active',
      token_ref: input.tokenRef,
      ad_account_id: input.adAccountId ?? null,
      pixel_id: input.pixelId ?? null,
      page_id: input.pageId ?? null,
      ig_user_id: input.igUserId ?? null,
      scopes_json: input.scopesJson ?? '[]',
      meta_json: input.metaJson ?? '{}',
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateMetaConnectionInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      token_ref: input.tokenRef,
      ad_account_id: input.adAccountId,
      pixel_id: input.pixelId,
      page_id: input.pageId,
      ig_user_id: input.igUserId,
      scopes_json: input.scopesJson,
      meta_json: input.metaJson,
    });
  }

  async findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaConnection>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Get total count
    const countBuilder = count(this.tableName).where('tenant_id', '=', tenantId);
    const total = await this.executor.count(countBuilder);

    // Get paginated results
    const selectBuilder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<MetaConnectionRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findActiveByTenantId(tenantId: string): Promise<MetaConnection | null> {
    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', 'active')
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<MetaConnectionRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByAdAccountId(adAccountId: string): Promise<MetaConnection | null> {
    const builder = select(this.tableName).where('ad_account_id', '=', adAccountId);
    const row = await this.executor.first<MetaConnectionRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByFilter(
    filter: MetaConnectionFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaConnection>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.tenantId) {
      countBuilder = countBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.status) {
      countBuilder = countBuilder.where('status', '=', filter.status);
    }
    if (filter.adAccountId) {
      countBuilder = countBuilder.where('ad_account_id', '=', filter.adAccountId);
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.tenantId) {
      selectBuilder = selectBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.status) {
      selectBuilder = selectBuilder.where('status', '=', filter.status);
    }
    if (filter.adAccountId) {
      selectBuilder = selectBuilder.where('ad_account_id', '=', filter.adAccountId);
    }

    selectBuilder = selectBuilder.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<MetaConnectionRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async revoke(id: string): Promise<MetaConnection | null> {
    return this.update(id, { status: 'revoked' });
  }

  async setError(id: string, errorDetails?: Record<string, unknown>): Promise<MetaConnection | null> {
    const updates: UpdateMetaConnectionInput = { status: 'error' };
    if (errorDetails) {
      const existing = await this.findById(id);
      if (existing) {
        const currentMeta = JSON.parse(existing.metaJson);
        updates.metaJson = JSON.stringify({
          ...currentMeta,
          error: errorDetails,
          errorAt: new Date().toISOString(),
        });
      }
    }
    return this.update(id, updates);
  }

  async updateTokenRef(id: string, tokenRef: string): Promise<MetaConnection | null> {
    return this.update(id, { tokenRef });
  }
}
