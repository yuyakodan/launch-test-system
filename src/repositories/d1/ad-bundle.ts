/**
 * D1 Ad Bundle Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count, insert } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { AdBundle, AdBundleStatus } from '../../types/entities.js';
import type {
  IAdBundleRepository,
  CreateAdBundleInput,
  UpdateAdBundleInput,
  AdBundleFilter,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for ad_bundles table
 */
interface AdBundleRow {
  id: string;
  run_id: string;
  intent_id: string;
  lp_variant_id: string;
  creative_variant_id: string;
  ad_copy_id: string;
  utm_string: string;
  status: AdBundleStatus;
  meta_campaign_id: string | null;
  meta_adset_id: string | null;
  meta_ad_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Ad Bundle Repository
 */
export class D1AdBundleRepository
  extends BaseD1Repository<AdBundle, CreateAdBundleInput, UpdateAdBundleInput>
  implements IAdBundleRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'runId',
    'intentId',
    'lpVariantId',
    'creativeVariantId',
    'adCopyId',
    'utmString',
    'status',
    'metaCampaignId',
    'metaAdsetId',
    'metaAdId',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'ad_bundles');
  }

  protected rowToEntity(row: AdBundleRow): AdBundle {
    return {
      id: row.id,
      runId: row.run_id,
      intentId: row.intent_id,
      lpVariantId: row.lp_variant_id,
      creativeVariantId: row.creative_variant_id,
      adCopyId: row.ad_copy_id,
      utmString: row.utm_string,
      status: row.status,
      metaCampaignId: row.meta_campaign_id,
      metaAdsetId: row.meta_adset_id,
      metaAdId: row.meta_ad_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateAdBundleInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      run_id: input.runId,
      intent_id: input.intentId,
      lp_variant_id: input.lpVariantId,
      creative_variant_id: input.creativeVariantId,
      ad_copy_id: input.adCopyId,
      utm_string: input.utmString,
      status: input.status ?? 'ready',
      meta_campaign_id: input.metaCampaignId ?? null,
      meta_adset_id: input.metaAdsetId ?? null,
      meta_ad_id: input.metaAdId ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateAdBundleInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      utm_string: input.utmString,
      meta_campaign_id: input.metaCampaignId,
      meta_adset_id: input.metaAdsetId,
      meta_ad_id: input.metaAdId,
    });
  }

  async findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<AdBundle>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<AdBundleRow>(selectBuilder);
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
  ): Promise<PaginatedResult<AdBundle>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('intent_id', '=', intentId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<AdBundleRow>(selectBuilder);
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
    filter: AdBundleFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<AdBundle>> {
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
    if (filter.lpVariantId) {
      countBuilder = countBuilder.where('lp_variant_id', '=', filter.lpVariantId);
    }
    if (filter.creativeVariantId) {
      countBuilder = countBuilder.where('creative_variant_id', '=', filter.creativeVariantId);
    }
    if (filter.adCopyId) {
      countBuilder = countBuilder.where('ad_copy_id', '=', filter.adCopyId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.metaAdId) {
      countBuilder = countBuilder.where('meta_ad_id', '=', filter.metaAdId);
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
    if (filter.lpVariantId) {
      selectBuilder = selectBuilder.where('lp_variant_id', '=', filter.lpVariantId);
    }
    if (filter.creativeVariantId) {
      selectBuilder = selectBuilder.where('creative_variant_id', '=', filter.creativeVariantId);
    }
    if (filter.adCopyId) {
      selectBuilder = selectBuilder.where('ad_copy_id', '=', filter.adCopyId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.metaAdId) {
      selectBuilder = selectBuilder.where('meta_ad_id', '=', filter.metaAdId);
    }

    selectBuilder = selectBuilder.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<AdBundleRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByUtmString(utmString: string): Promise<AdBundle | null> {
    const builder = select(this.tableName).where('utm_string', '=', utmString);
    const row = await this.executor.first<AdBundleRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByMetaAdId(metaAdId: string): Promise<AdBundle | null> {
    const builder = select(this.tableName).where('meta_ad_id', '=', metaAdId);
    const row = await this.executor.first<AdBundleRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async updateStatus(id: string, status: AdBundleStatus): Promise<AdBundle | null> {
    return this.update(id, { status });
  }

  async updateMetaIds(
    id: string,
    metaIds: {
      metaCampaignId?: string | null;
      metaAdsetId?: string | null;
      metaAdId?: string | null;
    }
  ): Promise<AdBundle | null> {
    return this.update(id, metaIds);
  }

  async belongsToRun(bundleId: string, runId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', bundleId)
      .where('run_id', '=', runId);

    const total = await this.executor.count(builder);
    return total > 0;
  }

  async countByStatusForRun(runId: string): Promise<Record<AdBundleStatus, number>> {
    const sql = `
      SELECT status, COUNT(*) as count
      FROM ${this.tableName}
      WHERE run_id = ?
      GROUP BY status
    `;

    const rows = await this.executor.raw<{ status: AdBundleStatus; count: number }>(sql, [runId]);

    const result: Record<AdBundleStatus, number> = {
      ready: 0,
      running: 0,
      paused: 0,
      archived: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
    }

    return result;
  }

  async createBatch(inputs: CreateAdBundleInput[]): Promise<AdBundle[]> {
    const now = this.now();
    const bundles: AdBundle[] = [];

    for (const input of inputs) {
      const id = input.id ?? ulid();
      const row = {
        id,
        run_id: input.runId,
        intent_id: input.intentId,
        lp_variant_id: input.lpVariantId,
        creative_variant_id: input.creativeVariantId,
        ad_copy_id: input.adCopyId,
        utm_string: input.utmString,
        status: input.status ?? 'ready',
        meta_campaign_id: input.metaCampaignId ?? null,
        meta_adset_id: input.metaAdsetId ?? null,
        meta_ad_id: input.metaAdId ?? null,
        created_at: now,
        updated_at: now,
      };

      const insertBuilder = insert(this.tableName).values(row);
      await this.executor.insert(insertBuilder);

      bundles.push({
        id,
        runId: input.runId,
        intentId: input.intentId,
        lpVariantId: input.lpVariantId,
        creativeVariantId: input.creativeVariantId,
        adCopyId: input.adCopyId,
        utmString: input.utmString,
        status: (input.status ?? 'ready') as AdBundleStatus,
        metaCampaignId: input.metaCampaignId ?? null,
        metaAdsetId: input.metaAdsetId ?? null,
        metaAdId: input.metaAdId ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return bundles;
  }
}
