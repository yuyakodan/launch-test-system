/**
 * Ad Bundle repository interface
 */

import type { AdBundle, AdBundleStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating an ad bundle
 */
export interface CreateAdBundleInput {
  id?: string;
  runId: string;
  intentId: string;
  lpVariantId: string;
  creativeVariantId: string;
  adCopyId: string;
  utmString: string;
  status?: AdBundleStatus;
  metaCampaignId?: string | null;
  metaAdsetId?: string | null;
  metaAdId?: string | null;
}

/**
 * Input for updating an ad bundle
 */
export interface UpdateAdBundleInput {
  status?: AdBundleStatus;
  utmString?: string;
  metaCampaignId?: string | null;
  metaAdsetId?: string | null;
  metaAdId?: string | null;
}

/**
 * Filter options for finding ad bundles
 */
export interface AdBundleFilter {
  runId?: string;
  intentId?: string;
  lpVariantId?: string;
  creativeVariantId?: string;
  adCopyId?: string;
  status?: AdBundleStatus | AdBundleStatus[];
  metaAdId?: string;
}

/**
 * Ad Bundle repository interface
 */
export interface IAdBundleRepository
  extends IBaseRepository<AdBundle, CreateAdBundleInput, UpdateAdBundleInput> {
  /**
   * Find ad bundles by run ID
   */
  findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<AdBundle>>;

  /**
   * Find ad bundles by intent ID
   */
  findByIntentId(intentId: string, params?: PaginationParams): Promise<PaginatedResult<AdBundle>>;

  /**
   * Find ad bundles by filter
   */
  findByFilter(
    filter: AdBundleFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<AdBundle>>;

  /**
   * Find ad bundle by UTM string
   */
  findByUtmString(utmString: string): Promise<AdBundle | null>;

  /**
   * Find ad bundle by Meta Ad ID
   */
  findByMetaAdId(metaAdId: string): Promise<AdBundle | null>;

  /**
   * Update ad bundle status
   */
  updateStatus(id: string, status: AdBundleStatus): Promise<AdBundle | null>;

  /**
   * Update Meta IDs for ad bundle
   */
  updateMetaIds(
    id: string,
    metaIds: {
      metaCampaignId?: string | null;
      metaAdsetId?: string | null;
      metaAdId?: string | null;
    }
  ): Promise<AdBundle | null>;

  /**
   * Check if ad bundle belongs to run
   */
  belongsToRun(bundleId: string, runId: string): Promise<boolean>;

  /**
   * Count ad bundles by status for a run
   */
  countByStatusForRun(runId: string): Promise<Record<AdBundleStatus, number>>;

  /**
   * Create multiple ad bundles in batch
   */
  createBatch(inputs: CreateAdBundleInput[]): Promise<AdBundle[]>;
}
