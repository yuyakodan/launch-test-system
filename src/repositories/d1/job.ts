/**
 * D1 Job Repository implementation
 * Handles job queue persistence in Cloudflare D1
 */

import { select, count } from '../../lib/db/index.js';
import type { Job, JobType, JobStatus } from '../../types/entities.js';
import type { PaginatedResult, PaginationParams } from '../interfaces/base.js';
import type {
  IJobRepository,
  CreateJobInput,
  UpdateJobInput,
  JobFilter,
  JobStats,
} from '../interfaces/job.js';
import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';

/**
 * D1 Job Repository
 */
export class D1JobRepository
  extends BaseD1Repository<Job, CreateJobInput, UpdateJobInput>
  implements IJobRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'tenantId',
    'jobType',
    'status',
    'payloadJson',
    'resultJson',
    'attempts',
    'maxAttempts',
    'lastError',
    'scheduledAt',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'jobs');
  }

  protected rowToEntity(row: Record<string, unknown>): Job {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      jobType: row.job_type as JobType,
      status: row.status as JobStatus,
      payloadJson: row.payload_json as string,
      resultJson: row.result_json as string,
      attempts: row.attempts as number,
      maxAttempts: row.max_attempts as number,
      lastError: row.last_error as string,
      scheduledAt: row.scheduled_at as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }

  protected createInputToRow(input: CreateJobInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: this.generateId(),
      tenant_id: input.tenantId,
      job_type: input.jobType,
      status: 'queued',
      payload_json: input.payloadJson ?? '{}',
      result_json: '{}',
      attempts: 0,
      max_attempts: input.maxAttempts ?? 10,
      last_error: '',
      scheduled_at: input.scheduledAt ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateJobInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      result_json: input.resultJson,
      attempts: input.attempts,
      last_error: input.lastError,
    });
  }

  async findByTenantId(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<Job>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('tenant_id', '=', tenantId);
    const total = await this.executor.count(countBuilder);

    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<Record<string, unknown>>(builder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByFilter(filter: JobFilter, params?: PaginationParams): Promise<PaginatedResult<Job>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    let countBuilder = count(this.tableName);
    let queryBuilder = select(this.tableName);

    if (filter.tenantId) {
      countBuilder = countBuilder.where('tenant_id', '=', filter.tenantId);
      queryBuilder = queryBuilder.where('tenant_id', '=', filter.tenantId);
    }

    if (filter.jobType) {
      countBuilder = countBuilder.where('job_type', '=', filter.jobType);
      queryBuilder = queryBuilder.where('job_type', '=', filter.jobType);
    }

    if (filter.status) {
      countBuilder = countBuilder.where('status', '=', filter.status);
      queryBuilder = queryBuilder.where('status', '=', filter.status);
    }

    if (filter.statuses && filter.statuses.length > 0) {
      countBuilder = countBuilder.whereIn('status', filter.statuses);
      queryBuilder = queryBuilder.whereIn('status', filter.statuses);
    }

    if (filter.scheduledBefore) {
      countBuilder = countBuilder.where('scheduled_at', '<=', filter.scheduledBefore);
      queryBuilder = queryBuilder.where('scheduled_at', '<=', filter.scheduledBefore);
    }

    const total = await this.executor.count(countBuilder);

    queryBuilder = queryBuilder
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<Record<string, unknown>>(queryBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findPendingJobs(limit = 100): Promise<Job[]> {
    const now = this.now();
    // Use raw SQL for complex WHERE clause with OR on scheduled_at
    const sql = `
      SELECT * FROM ${this.tableName}
      WHERE status = ?
      AND (scheduled_at IS NULL OR scheduled_at <= ?)
      ORDER BY created_at ASC
      LIMIT ?
    `;

    const rows = await this.executor.raw<Record<string, unknown>>(sql, ['queued', now, limit]);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByTypeAndStatus(
    jobType: JobType,
    status: JobStatus,
    params?: PaginationParams
  ): Promise<PaginatedResult<Job>> {
    return this.findByFilter({ jobType, status }, params);
  }

  async markAsRunning(id: string): Promise<Job | null> {
    const job = await this.findById(id);
    if (!job) return null;

    return this.update(id, {
      status: 'running',
      attempts: job.attempts + 1,
    });
  }

  async markAsSucceeded(id: string, resultJson?: string): Promise<Job | null> {
    return this.update(id, {
      status: 'succeeded',
      resultJson: resultJson ?? '{}',
    });
  }

  async markAsFailed(id: string, error: string): Promise<Job | null> {
    return this.update(id, {
      status: 'failed',
      lastError: error,
    });
  }

  async markAsCancelled(id: string): Promise<Job | null> {
    return this.update(id, {
      status: 'cancelled',
    });
  }

  async retry(id: string): Promise<Job | null> {
    const job = await this.findById(id);
    if (!job) return null;

    if (job.attempts >= job.maxAttempts) {
      return null;
    }

    return this.update(id, {
      status: 'queued',
      lastError: '',
    });
  }

  async canRetry(id: string): Promise<boolean> {
    const job = await this.findById(id);
    if (!job) return false;
    return job.attempts < job.maxAttempts;
  }

  async countByStatus(tenantId: string, status: JobStatus): Promise<number> {
    const builder = count(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', status);
    return this.executor.count(builder);
  }

  async getStats(tenantId: string): Promise<JobStats> {
    const [total, queued, running, succeeded, failed, cancelled] = await Promise.all([
      this.executor.count(count(this.tableName).where('tenant_id', '=', tenantId)),
      this.countByStatus(tenantId, 'queued'),
      this.countByStatus(tenantId, 'running'),
      this.countByStatus(tenantId, 'succeeded'),
      this.countByStatus(tenantId, 'failed'),
      this.countByStatus(tenantId, 'cancelled'),
    ]);

    return {
      total,
      queued,
      running,
      succeeded,
      failed,
      cancelled,
    };
  }

  async deleteOldCompleted(olderThan: string): Promise<number> {
    // D1 doesn't support DELETE with SELECT count, so we count first
    const countBuilder = count(this.tableName)
      .whereIn('status', ['succeeded', 'failed', 'cancelled'])
      .where('updated_at', '<', olderThan);

    const toDelete = await this.executor.count(countBuilder);

    if (toDelete > 0) {
      const sql = `
        DELETE FROM jobs
        WHERE status IN ('succeeded', 'failed', 'cancelled')
        AND updated_at < ?
      `;
      await this.executor.raw(sql, [olderThan]);
    }

    return toDelete;
  }
}
