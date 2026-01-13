/**
 * D1 Variant Repository implementations
 * LP Variant, Creative Variant, Ad Copy
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type {
  LpVariant,
  CreativeVariant,
  AdCopy,
  ApprovalStatus,
  VariantStatus,
  CreativeSize,
} from '../../types/entities.js';
import type {
  ILpVariantRepository,
  CreateLpVariantInput,
  UpdateLpVariantInput,
  LpVariantFilter,
  ICreativeVariantRepository,
  CreateCreativeVariantInput,
  UpdateCreativeVariantInput,
  CreativeVariantFilter,
  IAdCopyRepository,
  CreateAdCopyInput,
  UpdateAdCopyInput,
  AdCopyFilter,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

// ================================
// LP Variant Row Type
// ================================

interface LpVariantRow {
  id: string;
  intent_id: string;
  version: number;
  status: VariantStatus;
  blocks_json: string;
  theme_json: string;
  qa_result_json: string;
  approval_status: ApprovalStatus;
  approved_hash: string | null;
  published_url: string | null;
  snapshot_r2_key: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * D1 LP Variant Repository
 */
export class D1LpVariantRepository
  extends BaseD1Repository<LpVariant, CreateLpVariantInput, UpdateLpVariantInput>
  implements ILpVariantRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'intentId',
    'version',
    'status',
    'blocksJson',
    'themeJson',
    'qaResultJson',
    'approvalStatus',
    'approvedHash',
    'publishedUrl',
    'snapshotR2Key',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'lp_variants');
  }

  protected rowToEntity(row: LpVariantRow): LpVariant {
    return {
      id: row.id,
      intentId: row.intent_id,
      version: row.version,
      status: row.status,
      blocksJson: row.blocks_json,
      themeJson: row.theme_json,
      qaResultJson: row.qa_result_json,
      approvalStatus: row.approval_status,
      approvedHash: row.approved_hash,
      publishedUrl: row.published_url,
      snapshotR2Key: row.snapshot_r2_key,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateLpVariantInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      intent_id: input.intentId,
      version: input.version ?? 1,
      status: input.status ?? 'draft',
      blocks_json: input.blocksJson ?? '{}',
      theme_json: input.themeJson ?? '{}',
      qa_result_json: input.qaResultJson ?? '{}',
      approval_status: input.approvalStatus ?? 'draft',
      approved_hash: null,
      published_url: null,
      snapshot_r2_key: null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateLpVariantInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      blocks_json: input.blocksJson,
      theme_json: input.themeJson,
      qa_result_json: input.qaResultJson,
      approval_status: input.approvalStatus,
      approved_hash: input.approvedHash,
      published_url: input.publishedUrl,
      snapshot_r2_key: input.snapshotR2Key,
    });
  }

  async findByIntentId(
    intentId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<LpVariant>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('intent_id', '=', intentId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('version', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<LpVariantRow>(selectBuilder);
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
    filter: LpVariantFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<LpVariant>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    let countBuilder = count(this.tableName);
    if (filter.intentId) {
      countBuilder = countBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.approvalStatus) {
      if (Array.isArray(filter.approvalStatus)) {
        countBuilder = countBuilder.whereIn('approval_status', filter.approvalStatus);
      } else {
        countBuilder = countBuilder.where('approval_status', '=', filter.approvalStatus);
      }
    }

    const total = await this.executor.count(countBuilder);

    let selectBuilder = select(this.tableName);
    if (filter.intentId) {
      selectBuilder = selectBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.approvalStatus) {
      if (Array.isArray(filter.approvalStatus)) {
        selectBuilder = selectBuilder.whereIn('approval_status', filter.approvalStatus);
      } else {
        selectBuilder = selectBuilder.where('approval_status', '=', filter.approvalStatus);
      }
    }

    selectBuilder = selectBuilder
      .orderBy('version', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<LpVariantRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findLatestByIntentId(intentId: string): Promise<LpVariant | null> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('version', 'DESC')
      .limit(1);

    const row = await this.executor.first<LpVariantRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findApprovedByIntentId(intentId: string): Promise<LpVariant[]> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .where('approval_status', '=', 'approved')
      .orderBy('version', 'DESC');

    const rows = await this.executor.all<LpVariantRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedHash?: string
  ): Promise<LpVariant | null> {
    return this.update(id, {
      approvalStatus: status,
      approvedHash: status === 'approved' ? approvedHash : undefined,
    });
  }

  async publish(
    id: string,
    publishedUrl: string,
    snapshotR2Key: string
  ): Promise<LpVariant | null> {
    return this.update(id, {
      status: 'published',
      publishedUrl,
      snapshotR2Key,
    });
  }

  async getNextVersionForIntent(intentId: string): Promise<number> {
    const sql = `
      SELECT MAX(version) as max_version
      FROM ${this.tableName}
      WHERE intent_id = ?
    `;

    const result = await this.executor.rawFirst<{ max_version: number | null }>(sql, [intentId]);
    return (result?.max_version ?? 0) + 1;
  }
}

// ================================
// Creative Variant Row Type
// ================================

interface CreativeVariantRow {
  id: string;
  intent_id: string;
  size: CreativeSize;
  version: number;
  status: string;
  text_layers_json: string;
  image_r2_key: string;
  qa_result_json: string;
  approval_status: ApprovalStatus;
  approved_hash: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Creative Variant Repository
 */
export class D1CreativeVariantRepository
  extends BaseD1Repository<CreativeVariant, CreateCreativeVariantInput, UpdateCreativeVariantInput>
  implements ICreativeVariantRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'intentId',
    'size',
    'version',
    'status',
    'textLayersJson',
    'imageR2Key',
    'qaResultJson',
    'approvalStatus',
    'approvedHash',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'creative_variants');
  }

  protected rowToEntity(row: CreativeVariantRow): CreativeVariant {
    return {
      id: row.id,
      intentId: row.intent_id,
      size: row.size,
      version: row.version,
      status: row.status,
      textLayersJson: row.text_layers_json,
      imageR2Key: row.image_r2_key,
      qaResultJson: row.qa_result_json,
      approvalStatus: row.approval_status,
      approvedHash: row.approved_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateCreativeVariantInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      intent_id: input.intentId,
      size: input.size,
      version: input.version ?? 1,
      status: input.status ?? 'draft',
      text_layers_json: input.textLayersJson ?? '{}',
      image_r2_key: input.imageR2Key,
      qa_result_json: input.qaResultJson ?? '{}',
      approval_status: input.approvalStatus ?? 'draft',
      approved_hash: null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateCreativeVariantInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      text_layers_json: input.textLayersJson,
      image_r2_key: input.imageR2Key,
      qa_result_json: input.qaResultJson,
      approval_status: input.approvalStatus,
      approved_hash: input.approvedHash,
    });
  }

  async findByIntentId(
    intentId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<CreativeVariant>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('intent_id', '=', intentId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('size', 'ASC')
      .orderBy('version', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<CreativeVariantRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByIntentIdAndSize(
    intentId: string,
    size: CreativeSize
  ): Promise<CreativeVariant[]> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .where('size', '=', size)
      .orderBy('version', 'DESC');

    const rows = await this.executor.all<CreativeVariantRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByFilter(
    filter: CreativeVariantFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<CreativeVariant>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    let countBuilder = count(this.tableName);
    if (filter.intentId) {
      countBuilder = countBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.size) {
      if (Array.isArray(filter.size)) {
        countBuilder = countBuilder.whereIn('size', filter.size);
      } else {
        countBuilder = countBuilder.where('size', '=', filter.size);
      }
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.approvalStatus) {
      if (Array.isArray(filter.approvalStatus)) {
        countBuilder = countBuilder.whereIn('approval_status', filter.approvalStatus);
      } else {
        countBuilder = countBuilder.where('approval_status', '=', filter.approvalStatus);
      }
    }

    const total = await this.executor.count(countBuilder);

    let selectBuilder = select(this.tableName);
    if (filter.intentId) {
      selectBuilder = selectBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.size) {
      if (Array.isArray(filter.size)) {
        selectBuilder = selectBuilder.whereIn('size', filter.size);
      } else {
        selectBuilder = selectBuilder.where('size', '=', filter.size);
      }
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.approvalStatus) {
      if (Array.isArray(filter.approvalStatus)) {
        selectBuilder = selectBuilder.whereIn('approval_status', filter.approvalStatus);
      } else {
        selectBuilder = selectBuilder.where('approval_status', '=', filter.approvalStatus);
      }
    }

    selectBuilder = selectBuilder
      .orderBy('size', 'ASC')
      .orderBy('version', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<CreativeVariantRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findLatestByIntentIdAndSize(
    intentId: string,
    size: CreativeSize
  ): Promise<CreativeVariant | null> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .where('size', '=', size)
      .orderBy('version', 'DESC')
      .limit(1);

    const row = await this.executor.first<CreativeVariantRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findApprovedByIntentId(intentId: string): Promise<CreativeVariant[]> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .where('approval_status', '=', 'approved')
      .orderBy('size', 'ASC')
      .orderBy('version', 'DESC');

    const rows = await this.executor.all<CreativeVariantRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedHash?: string
  ): Promise<CreativeVariant | null> {
    return this.update(id, {
      approvalStatus: status,
      approvedHash: status === 'approved' ? approvedHash : undefined,
    });
  }

  async getNextVersionForIntentAndSize(
    intentId: string,
    size: CreativeSize
  ): Promise<number> {
    const sql = `
      SELECT MAX(version) as max_version
      FROM ${this.tableName}
      WHERE intent_id = ? AND size = ?
    `;

    const result = await this.executor.rawFirst<{ max_version: number | null }>(sql, [intentId, size]);
    return (result?.max_version ?? 0) + 1;
  }
}

// ================================
// Ad Copy Row Type
// ================================

interface AdCopyRow {
  id: string;
  intent_id: string;
  version: number;
  status: string;
  primary_text: string;
  headline: string;
  description: string;
  qa_result_json: string;
  approval_status: ApprovalStatus;
  approved_hash: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Ad Copy Repository
 */
export class D1AdCopyRepository
  extends BaseD1Repository<AdCopy, CreateAdCopyInput, UpdateAdCopyInput>
  implements IAdCopyRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'intentId',
    'version',
    'status',
    'primaryText',
    'headline',
    'description',
    'qaResultJson',
    'approvalStatus',
    'approvedHash',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'ad_copies');
  }

  protected rowToEntity(row: AdCopyRow): AdCopy {
    return {
      id: row.id,
      intentId: row.intent_id,
      version: row.version,
      status: row.status,
      primaryText: row.primary_text,
      headline: row.headline,
      description: row.description,
      qaResultJson: row.qa_result_json,
      approvalStatus: row.approval_status,
      approvedHash: row.approved_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateAdCopyInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      intent_id: input.intentId,
      version: input.version ?? 1,
      status: input.status ?? 'draft',
      primary_text: input.primaryText ?? '',
      headline: input.headline ?? '',
      description: input.description ?? '',
      qa_result_json: input.qaResultJson ?? '{}',
      approval_status: input.approvalStatus ?? 'draft',
      approved_hash: null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateAdCopyInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      primary_text: input.primaryText,
      headline: input.headline,
      description: input.description,
      qa_result_json: input.qaResultJson,
      approval_status: input.approvalStatus,
      approved_hash: input.approvedHash,
    });
  }

  async findByIntentId(
    intentId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<AdCopy>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('intent_id', '=', intentId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('version', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<AdCopyRow>(selectBuilder);
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
    filter: AdCopyFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<AdCopy>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    let countBuilder = count(this.tableName);
    if (filter.intentId) {
      countBuilder = countBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.approvalStatus) {
      if (Array.isArray(filter.approvalStatus)) {
        countBuilder = countBuilder.whereIn('approval_status', filter.approvalStatus);
      } else {
        countBuilder = countBuilder.where('approval_status', '=', filter.approvalStatus);
      }
    }

    const total = await this.executor.count(countBuilder);

    let selectBuilder = select(this.tableName);
    if (filter.intentId) {
      selectBuilder = selectBuilder.where('intent_id', '=', filter.intentId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.approvalStatus) {
      if (Array.isArray(filter.approvalStatus)) {
        selectBuilder = selectBuilder.whereIn('approval_status', filter.approvalStatus);
      } else {
        selectBuilder = selectBuilder.where('approval_status', '=', filter.approvalStatus);
      }
    }

    selectBuilder = selectBuilder
      .orderBy('version', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<AdCopyRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findLatestByIntentId(intentId: string): Promise<AdCopy | null> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .orderBy('version', 'DESC')
      .limit(1);

    const row = await this.executor.first<AdCopyRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findApprovedByIntentId(intentId: string): Promise<AdCopy[]> {
    const builder = select(this.tableName)
      .where('intent_id', '=', intentId)
      .where('approval_status', '=', 'approved')
      .orderBy('version', 'DESC');

    const rows = await this.executor.all<AdCopyRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedHash?: string
  ): Promise<AdCopy | null> {
    return this.update(id, {
      approvalStatus: status,
      approvedHash: status === 'approved' ? approvedHash : undefined,
    });
  }

  async getNextVersionForIntent(intentId: string): Promise<number> {
    const sql = `
      SELECT MAX(version) as max_version
      FROM ${this.tableName}
      WHERE intent_id = ?
    `;

    const result = await this.executor.rawFirst<{ max_version: number | null }>(sql, [intentId]);
    return (result?.max_version ?? 0) + 1;
  }
}
