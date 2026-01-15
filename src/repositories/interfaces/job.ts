/**
 * Job repository interface
 * Handles job queue management for async tasks
 */

import type { Job, JobType, JobStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating a new job
 */
export interface CreateJobInput {
  tenantId: string;
  jobType: JobType;
  payloadJson?: string;
  maxAttempts?: number;
  scheduledAt?: string;
}

/**
 * Input for updating a job
 */
export interface UpdateJobInput {
  status?: JobStatus;
  resultJson?: string;
  attempts?: number;
  lastError?: string;
}

/**
 * Filter options for querying jobs
 */
export interface JobFilter {
  tenantId?: string;
  jobType?: JobType;
  status?: JobStatus;
  statuses?: JobStatus[];
  scheduledBefore?: string;
}

/**
 * Job repository interface
 */
export interface IJobRepository extends IBaseRepository<Job, CreateJobInput, UpdateJobInput> {
  /**
   * Find jobs by tenant ID
   */
  findByTenantId(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<Job>>;

  /**
   * Find jobs by filter
   */
  findByFilter(filter: JobFilter, params?: PaginationParams): Promise<PaginatedResult<Job>>;

  /**
   * Find pending jobs ready to execute (queued and not scheduled for future)
   */
  findPendingJobs(limit?: number): Promise<Job[]>;

  /**
   * Find jobs by type and status
   */
  findByTypeAndStatus(jobType: JobType, status: JobStatus, params?: PaginationParams): Promise<PaginatedResult<Job>>;

  /**
   * Mark job as running (increment attempts, set status)
   */
  markAsRunning(id: string): Promise<Job | null>;

  /**
   * Mark job as succeeded
   */
  markAsSucceeded(id: string, resultJson?: string): Promise<Job | null>;

  /**
   * Mark job as failed
   */
  markAsFailed(id: string, error: string): Promise<Job | null>;

  /**
   * Mark job as cancelled
   */
  markAsCancelled(id: string): Promise<Job | null>;

  /**
   * Retry a failed job (reset status to queued)
   */
  retry(id: string): Promise<Job | null>;

  /**
   * Check if job can be retried (attempts < maxAttempts)
   */
  canRetry(id: string): Promise<boolean>;

  /**
   * Count jobs by status for a tenant
   */
  countByStatus(tenantId: string, status: JobStatus): Promise<number>;

  /**
   * Get job statistics for a tenant
   */
  getStats(tenantId: string): Promise<JobStats>;

  /**
   * Delete old completed jobs (cleanup)
   */
  deleteOldCompleted(olderThan: string): Promise<number>;
}

/**
 * Job statistics
 */
export interface JobStats {
  total: number;
  queued: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
}
