/**
 * D1 Feature Flags Repository Implementation
 * CRUD operations for tenant_flags table using D1
 */

import { D1Executor, select, insert, update, del, count } from '../../lib/db/index.js';
import type { TenantFlag } from '../../types/feature-flags.js';
import type { PaginatedResult, PaginationParams } from '../interfaces/base.js';
import type {
  IFeatureFlagRepository,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
  FeatureFlagFilter,
} from '../interfaces/feature-flags.js';

/**
 * Database row type for tenant_flags
 */
interface TenantFlagRow {
  tenant_id: string;
  flag_key: string;
  value_json: string;
  updated_at: string;
}

/**
 * D1 Feature Flags Repository
 */
export class D1FeatureFlagRepository implements IFeatureFlagRepository {
  private executor: D1Executor;
  private tableName = 'tenant_flags';

  constructor(db: D1Database) {
    this.executor = new D1Executor(db);
  }

  /**
   * Get current timestamp in ISO8601 format
   */
  private now(): string {
    return new Date().toISOString();
  }

  /**
   * Convert database row to entity
   */
  private rowToEntity(row: TenantFlagRow): TenantFlag {
    return {
      tenantId: row.tenant_id,
      flagKey: row.flag_key,
      valueJson: row.value_json,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Find a flag by tenant ID and key
   */
  async findByTenantAndKey(tenantId: string, flagKey: string): Promise<TenantFlag | null> {
    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('flag_key', '=', flagKey);

    const row = await this.executor.first<TenantFlagRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all flags for a tenant
   */
  async findAllByTenant(tenantId: string): Promise<TenantFlag[]> {
    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('flag_key', 'ASC');

    const rows = await this.executor.all<TenantFlagRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find flags by multiple keys for a tenant
   */
  async findByTenantAndKeys(tenantId: string, flagKeys: string[]): Promise<TenantFlag[]> {
    if (flagKeys.length === 0) {
      return [];
    }

    // Build IN clause manually since our query builder may not support it directly
    const placeholders = flagKeys.map(() => '?').join(', ');
    const sql = `SELECT * FROM ${this.tableName} WHERE tenant_id = ? AND flag_key IN (${placeholders}) ORDER BY flag_key ASC`;
    const params = [tenantId, ...flagKeys];

    const stmt = this.executor['db'].prepare(sql).bind(...params);
    const result = await stmt.all<TenantFlagRow>();
    return (result.results ?? []).map((row) => this.rowToEntity(row));
  }

  /**
   * Find all flags with pagination
   */
  async findAll(
    filter?: FeatureFlagFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<TenantFlag>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter?.tenantId) {
      countBuilder = countBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter?.flagKey) {
      countBuilder = countBuilder.where('flag_key', '=', filter.flagKey);
    }
    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter?.tenantId) {
      selectBuilder = selectBuilder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter?.flagKey) {
      selectBuilder = selectBuilder.where('flag_key', '=', filter.flagKey);
    }
    selectBuilder = selectBuilder.orderBy('tenant_id', 'ASC').orderBy('flag_key', 'ASC').limit(limit).offset(offset);

    const rows = await this.executor.all<TenantFlagRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Create or update a flag (upsert)
   */
  async upsert(input: CreateFeatureFlagInput): Promise<TenantFlag> {
    const now = this.now();

    // Check if exists
    const existing = await this.findByTenantAndKey(input.tenantId, input.flagKey);

    if (existing) {
      // Update existing
      const updateBuilder = update(this.tableName)
        .set({
          value_json: input.valueJson,
          updated_at: now,
        })
        .where('tenant_id', '=', input.tenantId)
        .where('flag_key', '=', input.flagKey);

      await this.executor.update(updateBuilder);
    } else {
      // Insert new
      const insertBuilder = insert(this.tableName).values({
        tenant_id: input.tenantId,
        flag_key: input.flagKey,
        value_json: input.valueJson,
        updated_at: now,
      });

      await this.executor.insert(insertBuilder);
    }

    const result = await this.findByTenantAndKey(input.tenantId, input.flagKey);
    if (!result) {
      throw new Error('Failed to upsert feature flag');
    }
    return result;
  }

  /**
   * Update a flag
   */
  async update(
    tenantId: string,
    flagKey: string,
    input: UpdateFeatureFlagInput
  ): Promise<TenantFlag | null> {
    const existing = await this.findByTenantAndKey(tenantId, flagKey);
    if (!existing) {
      return null;
    }

    const updateBuilder = update(this.tableName)
      .set({
        value_json: input.valueJson,
        updated_at: this.now(),
      })
      .where('tenant_id', '=', tenantId)
      .where('flag_key', '=', flagKey);

    await this.executor.update(updateBuilder);
    return this.findByTenantAndKey(tenantId, flagKey);
  }

  /**
   * Delete a flag
   */
  async delete(tenantId: string, flagKey: string): Promise<boolean> {
    const existing = await this.findByTenantAndKey(tenantId, flagKey);
    if (!existing) {
      return false;
    }

    const deleteBuilder = del(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('flag_key', '=', flagKey);

    await this.executor.delete(deleteBuilder);
    return true;
  }

  /**
   * Delete all flags for a tenant
   */
  async deleteAllByTenant(tenantId: string): Promise<number> {
    const countBefore = await this.countByTenant(tenantId);

    const deleteBuilder = del(this.tableName).where('tenant_id', '=', tenantId);
    await this.executor.delete(deleteBuilder);

    return countBefore;
  }

  /**
   * Check if a flag exists
   */
  async exists(tenantId: string, flagKey: string): Promise<boolean> {
    const flag = await this.findByTenantAndKey(tenantId, flagKey);
    return flag !== null;
  }

  /**
   * Count flags for a tenant
   */
  async countByTenant(tenantId: string): Promise<number> {
    const builder = count(this.tableName).where('tenant_id', '=', tenantId);
    return this.executor.count(builder);
  }

  /**
   * Get all tenants with a specific flag value
   */
  async findTenantsByFlagValue(flagKey: string, valueJson: string): Promise<string[]> {
    const builder = select(this.tableName)
      .select('tenant_id')
      .where('flag_key', '=', flagKey)
      .where('value_json', '=', valueJson);

    const rows = await this.executor.all<{ tenant_id: string }>(builder);
    return rows.map((row) => row.tenant_id);
  }
}
