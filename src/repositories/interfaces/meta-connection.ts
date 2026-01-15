/**
 * Meta Connection Repository Interface
 * Handles meta_connections table CRUD operations
 */

import type { MetaConnection, MetaConnectionStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginationParams, PaginatedResult } from './base.js';

/**
 * Input for creating a new Meta connection
 */
export interface CreateMetaConnectionInput {
  tenantId: string;
  tokenRef: string;
  adAccountId?: string;
  pixelId?: string;
  pageId?: string;
  igUserId?: string;
  scopesJson?: string;
  metaJson?: string;
}

/**
 * Input for updating a Meta connection
 */
export interface UpdateMetaConnectionInput {
  status?: MetaConnectionStatus;
  tokenRef?: string;
  adAccountId?: string | null;
  pixelId?: string | null;
  pageId?: string | null;
  igUserId?: string | null;
  scopesJson?: string;
  metaJson?: string;
}

/**
 * Filter options for Meta connections
 */
export interface MetaConnectionFilter {
  tenantId?: string;
  status?: MetaConnectionStatus;
  adAccountId?: string;
}

/**
 * Meta Connection Repository Interface
 */
export interface IMetaConnectionRepository
  extends IBaseRepository<MetaConnection, CreateMetaConnectionInput, UpdateMetaConnectionInput> {
  /**
   * Find all connections for a tenant
   */
  findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaConnection>>;

  /**
   * Find active connection for a tenant
   */
  findActiveByTenantId(tenantId: string): Promise<MetaConnection | null>;

  /**
   * Find connection by ad account ID
   */
  findByAdAccountId(adAccountId: string): Promise<MetaConnection | null>;

  /**
   * Find connections with filter
   */
  findByFilter(
    filter: MetaConnectionFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaConnection>>;

  /**
   * Revoke a connection (set status to revoked)
   */
  revoke(id: string): Promise<MetaConnection | null>;

  /**
   * Set connection error status
   */
  setError(id: string, errorDetails?: Record<string, unknown>): Promise<MetaConnection | null>;

  /**
   * Update token reference
   */
  updateTokenRef(id: string, tokenRef: string): Promise<MetaConnection | null>;
}
