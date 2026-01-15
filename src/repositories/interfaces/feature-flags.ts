/**
 * Feature Flags Repository Interface
 * CRUD operations for tenant_flags table
 */

import type { TenantFlag } from '../../types/feature-flags.js';
import type { PaginatedResult, PaginationParams } from './base.js';

/**
 * Create feature flag input
 */
export interface CreateFeatureFlagInput {
  tenantId: string;
  flagKey: string;
  valueJson: string;
}

/**
 * Update feature flag input
 */
export interface UpdateFeatureFlagInput {
  valueJson: string;
}

/**
 * Feature flag filter options
 */
export interface FeatureFlagFilter {
  tenantId?: string;
  flagKey?: string;
  flagKeys?: string[];
}

/**
 * Feature Flags Repository Interface
 */
export interface IFeatureFlagRepository {
  /**
   * Find a flag by tenant ID and key
   */
  findByTenantAndKey(tenantId: string, flagKey: string): Promise<TenantFlag | null>;

  /**
   * Find all flags for a tenant
   */
  findAllByTenant(tenantId: string): Promise<TenantFlag[]>;

  /**
   * Find flags by multiple keys for a tenant
   */
  findByTenantAndKeys(tenantId: string, flagKeys: string[]): Promise<TenantFlag[]>;

  /**
   * Find all flags with pagination
   */
  findAll(
    filter?: FeatureFlagFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<TenantFlag>>;

  /**
   * Create or update a flag (upsert)
   */
  upsert(input: CreateFeatureFlagInput): Promise<TenantFlag>;

  /**
   * Update a flag
   */
  update(tenantId: string, flagKey: string, input: UpdateFeatureFlagInput): Promise<TenantFlag | null>;

  /**
   * Delete a flag
   */
  delete(tenantId: string, flagKey: string): Promise<boolean>;

  /**
   * Delete all flags for a tenant
   */
  deleteAllByTenant(tenantId: string): Promise<number>;

  /**
   * Check if a flag exists
   */
  exists(tenantId: string, flagKey: string): Promise<boolean>;

  /**
   * Count flags for a tenant
   */
  countByTenant(tenantId: string): Promise<number>;

  /**
   * Get all tenants with a specific flag value
   * Useful for migration queries
   */
  findTenantsByFlagValue(flagKey: string, valueJson: string): Promise<string[]>;
}
