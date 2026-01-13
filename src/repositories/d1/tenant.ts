/**
 * D1 Tenant Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { Tenant } from '../../types/entities.js';
import type {
  ITenantRepository,
  CreateTenantInput,
  UpdateTenantInput,
  TenantFilter,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for tenants table
 */
interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_key: string;
  settings_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Tenant Repository
 */
export class D1TenantRepository
  extends BaseD1Repository<Tenant, CreateTenantInput, UpdateTenantInput>
  implements ITenantRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'name',
    'slug',
    'planKey',
    'settingsJson',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'tenants');
  }

  protected rowToEntity(row: TenantRow): Tenant {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      planKey: row.plan_key,
      settingsJson: row.settings_json,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateTenantInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      name: input.name,
      slug: input.slug,
      plan_key: input.planKey ?? 'free',
      settings_json: input.settingsJson ?? '{}',
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateTenantInput): Record<string, unknown> {
    return removeUndefined({
      name: input.name,
      plan_key: input.planKey,
      settings_json: input.settingsJson,
    });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const builder = select(this.tableName).where('slug', '=', slug);
    const row = await this.executor.first<TenantRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByFilter(
    filter: TenantFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Tenant>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.planKey) {
      countBuilder = countBuilder.where('plan_key', '=', filter.planKey);
    }
    if (filter.slugPrefix) {
      countBuilder = countBuilder.where('slug', 'LIKE', `${filter.slugPrefix}%`);
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.planKey) {
      selectBuilder = selectBuilder.where('plan_key', '=', filter.planKey);
    }
    if (filter.slugPrefix) {
      selectBuilder = selectBuilder.where('slug', 'LIKE', `${filter.slugPrefix}%`);
    }

    selectBuilder = selectBuilder
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<TenantRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async isSlugAvailable(slug: string, excludeId?: string): Promise<boolean> {
    let builder = count(this.tableName).where('slug', '=', slug);

    if (excludeId) {
      builder = builder.where('id', '!=', excludeId);
    }

    const total = await this.executor.count(builder);
    return total === 0;
  }

  async updatePlan(id: string, planKey: string): Promise<Tenant | null> {
    return this.update(id, { planKey });
  }

  async getSettings<T>(id: string): Promise<T | null> {
    const tenant = await this.findById(id);
    if (!tenant) {
      return null;
    }

    try {
      return JSON.parse(tenant.settingsJson) as T;
    } catch {
      return null;
    }
  }

  async updateSettings(
    id: string,
    settings: Record<string, unknown>
  ): Promise<Tenant | null> {
    const settingsJson = JSON.stringify(settings);
    return this.update(id, { settingsJson });
  }
}
