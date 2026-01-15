/**
 * Approval Repository Interface
 * Handles approval workflow for runs, variants, deployments, and meta configs
 */

import type { IBaseRepository, PaginationParams, PaginatedResult } from './base.js';
import type { Approval, ApprovalTargetType } from '../../types/entities.js';

/**
 * Input for creating a new approval (submitted state)
 */
export interface CreateApprovalInput {
  tenantId: string;
  targetType: ApprovalTargetType;
  targetId: string;
  /** Content hash at the time of submission */
  targetHash: string;
  /** Optional comment when submitting */
  comment?: string;
}

/**
 * Input for approving an approval request
 */
export interface ApproveApprovalInput {
  reviewerUserId: string;
  comment?: string;
}

/**
 * Input for rejecting an approval request
 */
export interface RejectApprovalInput {
  reviewerUserId: string;
  comment: string;
}

/**
 * Filter options for querying approvals
 */
export interface ApprovalFilter {
  tenantId?: string;
  targetType?: ApprovalTargetType;
  targetId?: string;
  status?: 'submitted' | 'approved' | 'rejected';
  reviewerUserId?: string;
}

/**
 * Approval Repository Interface
 * Extends IBaseRepository but with custom create/update methods
 */
export interface IApprovalRepository extends Omit<IBaseRepository<Approval, CreateApprovalInput, never>, 'create' | 'update'> {
  /**
   * Create a new approval request (status: submitted)
   */
  create(input: CreateApprovalInput): Promise<Approval>;

  /**
   * Find approval by ID
   */
  findById(id: string): Promise<Approval | null>;

  /**
   * Find approvals by target (type and ID)
   */
  findByTarget(targetType: ApprovalTargetType, targetId: string): Promise<Approval[]>;

  /**
   * Find the latest approval for a target
   */
  findLatestByTarget(targetType: ApprovalTargetType, targetId: string): Promise<Approval | null>;

  /**
   * Find approvals by filter with pagination
   */
  findByFilter(
    filter: ApprovalFilter,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Approval>>;

  /**
   * Find all submitted (pending) approvals for a tenant
   */
  findPendingByTenant(tenantId: string, pagination?: PaginationParams): Promise<PaginatedResult<Approval>>;

  /**
   * Approve an approval request
   */
  approve(id: string, input: ApproveApprovalInput): Promise<Approval | null>;

  /**
   * Reject an approval request
   */
  reject(id: string, input: RejectApprovalInput): Promise<Approval | null>;

  /**
   * Check if a target has an approved status
   */
  isApproved(targetType: ApprovalTargetType, targetId: string): Promise<boolean>;

  /**
   * Check if a target has a pending (submitted) approval request
   */
  hasPendingApproval(targetType: ApprovalTargetType, targetId: string): Promise<boolean>;

  /**
   * Get approval history for a target
   */
  getHistory(
    targetType: ApprovalTargetType,
    targetId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Approval>>;

  /**
   * Count approvals by filter
   */
  countByFilter(filter: ApprovalFilter): Promise<number>;
}
