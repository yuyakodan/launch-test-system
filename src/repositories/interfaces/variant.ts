/**
 * Variant repository interfaces
 * LP Variant, Creative Variant, Ad Copy
 */

import type {
  LpVariant,
  CreativeVariant,
  AdCopy,
  ApprovalStatus,
  VariantStatus,
  CreativeSize,
} from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

// ================================
// LP Variant
// ================================

/**
 * Input for creating an LP variant
 */
export interface CreateLpVariantInput {
  id?: string;
  intentId: string;
  version?: number;
  status?: VariantStatus;
  blocksJson?: string;
  themeJson?: string;
  qaResultJson?: string;
  approvalStatus?: ApprovalStatus;
}

/**
 * Input for updating an LP variant
 */
export interface UpdateLpVariantInput {
  status?: VariantStatus;
  blocksJson?: string;
  themeJson?: string;
  qaResultJson?: string;
  approvalStatus?: ApprovalStatus;
  approvedHash?: string | null;
  publishedUrl?: string | null;
  snapshotR2Key?: string | null;
}

/**
 * Filter options for LP variants
 */
export interface LpVariantFilter {
  intentId?: string;
  status?: VariantStatus | VariantStatus[];
  approvalStatus?: ApprovalStatus | ApprovalStatus[];
}

/**
 * LP Variant repository interface
 */
export interface ILpVariantRepository
  extends IBaseRepository<LpVariant, CreateLpVariantInput, UpdateLpVariantInput> {
  /**
   * Find variants by intent ID
   */
  findByIntentId(intentId: string, params?: PaginationParams): Promise<PaginatedResult<LpVariant>>;

  /**
   * Find variants by filter
   */
  findByFilter(
    filter: LpVariantFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<LpVariant>>;

  /**
   * Find latest version for an intent
   */
  findLatestByIntentId(intentId: string): Promise<LpVariant | null>;

  /**
   * Find approved variants for an intent
   */
  findApprovedByIntentId(intentId: string): Promise<LpVariant[]>;

  /**
   * Update approval status
   */
  updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedHash?: string
  ): Promise<LpVariant | null>;

  /**
   * Publish a variant
   */
  publish(id: string, publishedUrl: string, snapshotR2Key: string): Promise<LpVariant | null>;

  /**
   * Get next version number for an intent
   */
  getNextVersionForIntent(intentId: string): Promise<number>;
}

// ================================
// Creative Variant
// ================================

/**
 * Input for creating a creative variant
 */
export interface CreateCreativeVariantInput {
  id?: string;
  intentId: string;
  size: CreativeSize;
  version?: number;
  status?: string;
  textLayersJson?: string;
  imageR2Key: string;
  qaResultJson?: string;
  approvalStatus?: ApprovalStatus;
}

/**
 * Input for updating a creative variant
 */
export interface UpdateCreativeVariantInput {
  status?: string;
  textLayersJson?: string;
  imageR2Key?: string;
  qaResultJson?: string;
  approvalStatus?: ApprovalStatus;
  approvedHash?: string | null;
}

/**
 * Filter options for creative variants
 */
export interface CreativeVariantFilter {
  intentId?: string;
  size?: CreativeSize | CreativeSize[];
  status?: string | string[];
  approvalStatus?: ApprovalStatus | ApprovalStatus[];
}

/**
 * Creative Variant repository interface
 */
export interface ICreativeVariantRepository
  extends IBaseRepository<CreativeVariant, CreateCreativeVariantInput, UpdateCreativeVariantInput> {
  /**
   * Find variants by intent ID
   */
  findByIntentId(
    intentId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<CreativeVariant>>;

  /**
   * Find variants by intent ID and size
   */
  findByIntentIdAndSize(
    intentId: string,
    size: CreativeSize
  ): Promise<CreativeVariant[]>;

  /**
   * Find variants by filter
   */
  findByFilter(
    filter: CreativeVariantFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<CreativeVariant>>;

  /**
   * Find latest version for an intent and size
   */
  findLatestByIntentIdAndSize(intentId: string, size: CreativeSize): Promise<CreativeVariant | null>;

  /**
   * Find approved variants for an intent
   */
  findApprovedByIntentId(intentId: string): Promise<CreativeVariant[]>;

  /**
   * Update approval status
   */
  updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedHash?: string
  ): Promise<CreativeVariant | null>;

  /**
   * Get next version number for an intent and size
   */
  getNextVersionForIntentAndSize(intentId: string, size: CreativeSize): Promise<number>;
}

// ================================
// Ad Copy
// ================================

/**
 * Input for creating an ad copy
 */
export interface CreateAdCopyInput {
  id?: string;
  intentId: string;
  version?: number;
  status?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  qaResultJson?: string;
  approvalStatus?: ApprovalStatus;
}

/**
 * Input for updating an ad copy
 */
export interface UpdateAdCopyInput {
  status?: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  qaResultJson?: string;
  approvalStatus?: ApprovalStatus;
  approvedHash?: string | null;
}

/**
 * Filter options for ad copies
 */
export interface AdCopyFilter {
  intentId?: string;
  status?: string | string[];
  approvalStatus?: ApprovalStatus | ApprovalStatus[];
}

/**
 * Ad Copy repository interface
 */
export interface IAdCopyRepository
  extends IBaseRepository<AdCopy, CreateAdCopyInput, UpdateAdCopyInput> {
  /**
   * Find ad copies by intent ID
   */
  findByIntentId(intentId: string, params?: PaginationParams): Promise<PaginatedResult<AdCopy>>;

  /**
   * Find ad copies by filter
   */
  findByFilter(
    filter: AdCopyFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<AdCopy>>;

  /**
   * Find latest version for an intent
   */
  findLatestByIntentId(intentId: string): Promise<AdCopy | null>;

  /**
   * Find approved ad copies for an intent
   */
  findApprovedByIntentId(intentId: string): Promise<AdCopy[]>;

  /**
   * Update approval status
   */
  updateApprovalStatus(
    id: string,
    status: ApprovalStatus,
    approvedHash?: string
  ): Promise<AdCopy | null>;

  /**
   * Get next version number for an intent
   */
  getNextVersionForIntent(intentId: string): Promise<number>;
}
