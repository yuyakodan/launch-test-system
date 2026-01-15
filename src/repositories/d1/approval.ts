/**
 * D1 Approval Repository Implementation
 * Handles approval workflow persistence in D1
 */

import {
  BaseD1Repository,
  generateColumnMappings,
  removeUndefined,
  type ColumnMapping,
} from './base.js';
import type {
  IApprovalRepository,
  CreateApprovalInput,
  ApproveApprovalInput,
  RejectApprovalInput,
  ApprovalFilter,
} from '../interfaces/approval.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';
import type { Approval, ApprovalTargetType } from '../../types/entities.js';
import { select, insert, update, count } from '../../lib/db/index.js';

/**
 * Database row type for approvals table
 */
interface ApprovalRow {
  id: string;
  tenant_id: string;
  target_type: string;
  target_id: string;
  status: string;
  reviewer_user_id: string | null;
  comment: string;
  target_hash: string;
  created_at: string;
}

/**
 * D1 Approval Repository
 */
export class D1ApprovalRepository
  extends BaseD1Repository<Approval, CreateApprovalInput, never>
  implements IApprovalRepository
{
  protected columnMappings: ColumnMapping[] = generateColumnMappings([
    'id',
    'tenantId',
    'targetType',
    'targetId',
    'status',
    'reviewerUserId',
    'comment',
    'targetHash',
    'createdAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'approvals', 'id');
  }

  /**
   * Convert database row to entity
   */
  protected rowToEntity(row: ApprovalRow): Approval {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      targetType: row.target_type as ApprovalTargetType,
      targetId: row.target_id,
      status: row.status as 'submitted' | 'approved' | 'rejected',
      reviewerUserId: row.reviewer_user_id,
      comment: row.comment,
      targetHash: row.target_hash,
      createdAt: row.created_at,
    };
  }

  /**
   * Convert create input to database row
   */
  protected createInputToRow(input: CreateApprovalInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: this.generateId(),
      tenant_id: input.tenantId,
      target_type: input.targetType,
      target_id: input.targetId,
      status: 'submitted',
      reviewer_user_id: null,
      comment: input.comment ?? '',
      target_hash: input.targetHash,
      created_at: now,
    };
  }

  /**
   * Not used - approvals don't have generic updates
   */
  protected updateInputToRow(_input: never): Record<string, unknown> {
    return {};
  }

  /**
   * Create a new approval request (status: submitted)
   */
  async create(input: CreateApprovalInput): Promise<Approval> {
    const row = this.createInputToRow(input);
    const builder = insert(this.tableName).values(row);
    await this.executor.insert(builder);

    const id = row.id as string;
    const created = await this.findById(id);

    if (!created) {
      throw new Error('Failed to create approval');
    }

    return created;
  }

  /**
   * Find approvals by target (type and ID)
   */
  async findByTarget(targetType: ApprovalTargetType, targetId: string): Promise<Approval[]> {
    const builder = select(this.tableName)
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .orderBy('created_at', 'DESC');

    const rows = await this.executor.all<ApprovalRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  /**
   * Find the latest approval for a target
   */
  async findLatestByTarget(
    targetType: ApprovalTargetType,
    targetId: string
  ): Promise<Approval | null> {
    const builder = select(this.tableName)
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<ApprovalRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find approvals by filter with pagination
   */
  async findByFilter(
    filter: ApprovalFilter,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Approval>> {
    const limit = pagination?.limit ?? 100;
    const offset = pagination?.offset ?? 0;

    // Build query with filters
    let builder = select(this.tableName);

    if (filter.tenantId) {
      builder = builder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.targetType) {
      builder = builder.where('target_type', '=', filter.targetType);
    }
    if (filter.targetId) {
      builder = builder.where('target_id', '=', filter.targetId);
    }
    if (filter.status) {
      builder = builder.where('status', '=', filter.status);
    }
    if (filter.reviewerUserId) {
      builder = builder.where('reviewer_user_id', '=', filter.reviewerUserId);
    }

    // Get total count
    const total = await this.countByFilter(filter);

    // Get paginated results
    builder = builder.orderBy('created_at', 'DESC').limit(limit).offset(offset);
    const rows = await this.executor.all<ApprovalRow>(builder);
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
   * Find all submitted (pending) approvals for a tenant
   */
  async findPendingByTenant(
    tenantId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Approval>> {
    return this.findByFilter({ tenantId, status: 'submitted' }, pagination);
  }

  /**
   * Approve an approval request
   */
  async approve(id: string, input: ApproveApprovalInput): Promise<Approval | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    if (existing.status !== 'submitted') {
      throw new Error(`Cannot approve: approval is in ${existing.status} status`);
    }

    const builder = update(this.tableName)
      .set(
        removeUndefined({
          status: 'approved',
          reviewer_user_id: input.reviewerUserId,
          comment: input.comment ?? existing.comment,
        })
      )
      .where('id', '=', id);

    await this.executor.update(builder);
    return this.findById(id);
  }

  /**
   * Reject an approval request
   */
  async reject(id: string, input: RejectApprovalInput): Promise<Approval | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    if (existing.status !== 'submitted') {
      throw new Error(`Cannot reject: approval is in ${existing.status} status`);
    }

    const builder = update(this.tableName)
      .set({
        status: 'rejected',
        reviewer_user_id: input.reviewerUserId,
        comment: input.comment,
      })
      .where('id', '=', id);

    await this.executor.update(builder);
    return this.findById(id);
  }

  /**
   * Check if a target has an approved status
   */
  async isApproved(targetType: ApprovalTargetType, targetId: string): Promise<boolean> {
    const latest = await this.findLatestByTarget(targetType, targetId);
    return latest?.status === 'approved';
  }

  /**
   * Check if a target has a pending (submitted) approval request
   */
  async hasPendingApproval(targetType: ApprovalTargetType, targetId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('target_type', '=', targetType)
      .where('target_id', '=', targetId)
      .where('status', '=', 'submitted');

    const total = await this.executor.count(builder);
    return total > 0;
  }

  /**
   * Get approval history for a target
   */
  async getHistory(
    targetType: ApprovalTargetType,
    targetId: string,
    pagination?: PaginationParams
  ): Promise<PaginatedResult<Approval>> {
    return this.findByFilter({ targetType, targetId }, pagination);
  }

  /**
   * Count approvals by filter
   */
  async countByFilter(filter: ApprovalFilter): Promise<number> {
    let builder = count(this.tableName);

    if (filter.tenantId) {
      builder = builder.where('tenant_id', '=', filter.tenantId);
    }
    if (filter.targetType) {
      builder = builder.where('target_type', '=', filter.targetType);
    }
    if (filter.targetId) {
      builder = builder.where('target_id', '=', filter.targetId);
    }
    if (filter.status) {
      builder = builder.where('status', '=', filter.status);
    }
    if (filter.reviewerUserId) {
      builder = builder.where('reviewer_user_id', '=', filter.reviewerUserId);
    }

    return this.executor.count(builder);
  }
}
