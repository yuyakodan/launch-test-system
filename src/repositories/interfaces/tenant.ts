/**
 * Tenant repository interface
 */

import type { Tenant } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating a tenant
 */
export interface CreateTenantInput {
  id?: string;
  name: string;
  slug: string;
  planKey?: string;
  settingsJson?: string;
}

/**
 * Input for updating a tenant
 */
export interface UpdateTenantInput {
  name?: string;
  planKey?: string;
  settingsJson?: string;
}

/**
 * Filter options for finding tenants
 */
export interface TenantFilter {
  planKey?: string;
  slugPrefix?: string;
}

/**
 * Tenant repository interface
 */
export interface ITenantRepository
  extends IBaseRepository<Tenant, CreateTenantInput, UpdateTenantInput> {
  /**
   * Find tenant by slug
   */
  findBySlug(slug: string): Promise<Tenant | null>;

  /**
   * Find tenants by filter with pagination
   */
  findByFilter(
    filter: TenantFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Tenant>>;

  /**
   * Check if slug is available
   */
  isSlugAvailable(slug: string, excludeId?: string): Promise<boolean>;

  /**
   * Update tenant plan
   */
  updatePlan(id: string, planKey: string): Promise<Tenant | null>;

  /**
   * Get tenant settings as parsed JSON
   */
  getSettings<T>(id: string): Promise<T | null>;

  /**
   * Update tenant settings
   */
  updateSettings(id: string, settings: Record<string, unknown>): Promise<Tenant | null>;
}
