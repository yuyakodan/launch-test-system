/**
 * Jobs Service
 * Manages async job queue operations for the Launch Test System
 *
 * Job Types:
 * - generate: LP/banner/ad copy generation
 * - qa_smoke: Smoke test execution
 * - publish: Publishing to CDN
 * - meta_sync: Meta Insights synchronization
 * - stop_eval: Stop condition evaluation
 * - report: Report generation
 * - notify: Notification dispatch
 * - import_parse: CSV import parsing
 */

import type { Job, JobType, JobStatus } from '../types/entities.js';
import type { PaginatedResult, PaginationParams } from '../repositories/interfaces/base.js';
import type { IJobRepository, CreateJobInput, JobFilter, JobStats } from '../repositories/interfaces/job.js';
import { D1JobRepository } from '../repositories/d1/job.js';

/**
 * Job creation options
 */
export interface CreateJobOptions {
  tenantId: string;
  jobType: JobType;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  scheduledAt?: Date;
}

/**
 * Job execution result
 */
export interface JobExecutionResult {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

/**
 * Jobs Service class
 */
export class JobsService {
  private repository: IJobRepository;

  constructor(db: D1Database) {
    this.repository = new D1JobRepository(db);
  }

  /**
   * Create a new job
   */
  async createJob(options: CreateJobOptions): Promise<Job> {
    const input: CreateJobInput = {
      tenantId: options.tenantId,
      jobType: options.jobType,
      payloadJson: options.payload ? JSON.stringify(options.payload) : '{}',
      maxAttempts: options.maxAttempts ?? 10,
      scheduledAt: options.scheduledAt?.toISOString() ?? undefined,
    };

    return this.repository.create(input);
  }

  /**
   * Get job by ID
   */
  async getJob(id: string): Promise<Job | null> {
    return this.repository.findById(id);
  }

  /**
   * List jobs for a tenant
   */
  async listJobs(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<Job>> {
    return this.repository.findByTenantId(tenantId, params);
  }

  /**
   * List jobs with filter
   */
  async listJobsWithFilter(filter: JobFilter, params?: PaginationParams): Promise<PaginatedResult<Job>> {
    return this.repository.findByFilter(filter, params);
  }

  /**
   * Get pending jobs ready for execution
   */
  async getPendingJobs(limit?: number): Promise<Job[]> {
    return this.repository.findPendingJobs(limit);
  }

  /**
   * Start job execution (mark as running)
   */
  async startJob(id: string): Promise<Job | null> {
    return this.repository.markAsRunning(id);
  }

  /**
   * Complete job successfully
   */
  async completeJob(id: string, result?: Record<string, unknown>): Promise<Job | null> {
    const resultJson = result ? JSON.stringify(result) : undefined;
    return this.repository.markAsSucceeded(id, resultJson);
  }

  /**
   * Fail job with error
   */
  async failJob(id: string, error: string): Promise<Job | null> {
    const job = await this.repository.markAsFailed(id, error);

    // Check if auto-retry is possible
    if (job && await this.repository.canRetry(id)) {
      // Auto-retry for certain job types
      const autoRetryTypes: JobType[] = ['meta_sync', 'notify', 'stop_eval'];
      if (autoRetryTypes.includes(job.jobType)) {
        return this.repository.retry(id);
      }
    }

    return job;
  }

  /**
   * Retry a failed job
   */
  async retryJob(id: string): Promise<Job | null> {
    const canRetry = await this.repository.canRetry(id);
    if (!canRetry) {
      return null;
    }
    return this.repository.retry(id);
  }

  /**
   * Cancel a job
   */
  async cancelJob(id: string): Promise<Job | null> {
    const job = await this.repository.findById(id);
    if (!job) return null;

    // Only queued or running jobs can be cancelled
    if (job.status !== 'queued' && job.status !== 'running') {
      return null;
    }

    return this.repository.markAsCancelled(id);
  }

  /**
   * Get job statistics for a tenant
   */
  async getStats(tenantId: string): Promise<JobStats> {
    return this.repository.getStats(tenantId);
  }

  /**
   * Get job payload as object
   */
  getJobPayload<T = Record<string, unknown>>(job: Job): T {
    try {
      return JSON.parse(job.payloadJson) as T;
    } catch {
      return {} as T;
    }
  }

  /**
   * Get job result as object
   */
  getJobResult<T = Record<string, unknown>>(job: Job): T {
    try {
      return JSON.parse(job.resultJson) as T;
    } catch {
      return {} as T;
    }
  }

  /**
   * Check if job can be retried
   */
  async canRetry(id: string): Promise<boolean> {
    return this.repository.canRetry(id);
  }

  /**
   * Cleanup old completed jobs
   */
  async cleanupOldJobs(daysOld: number): Promise<number> {
    const olderThan = new Date();
    olderThan.setDate(olderThan.getDate() - daysOld);
    return this.repository.deleteOldCompleted(olderThan.toISOString());
  }

  /**
   * Create a generation job
   */
  async createGenerationJob(
    tenantId: string,
    runId: string,
    options?: { maxAttempts?: number }
  ): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'generate',
      payload: { runId },
      maxAttempts: options?.maxAttempts ?? 3,
    });
  }

  /**
   * Create a QA smoke test job
   */
  async createQaSmokeJob(
    tenantId: string,
    runId: string,
    lpVariantIds: string[]
  ): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'qa_smoke',
      payload: { runId, lpVariantIds },
      maxAttempts: 3,
    });
  }

  /**
   * Create a publish job
   */
  async createPublishJob(tenantId: string, runId: string): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'publish',
      payload: { runId },
      maxAttempts: 3,
    });
  }

  /**
   * Create a Meta sync job
   */
  async createMetaSyncJob(tenantId: string, runId: string): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'meta_sync',
      payload: { runId },
      maxAttempts: 10,
    });
  }

  /**
   * Create a stop condition evaluation job
   */
  async createStopEvalJob(tenantId: string, runId: string): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'stop_eval',
      payload: { runId },
      maxAttempts: 5,
    });
  }

  /**
   * Create a report generation job
   */
  async createReportJob(tenantId: string, runId: string): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'report',
      payload: { runId },
      maxAttempts: 3,
    });
  }

  /**
   * Create a notification job
   */
  async createNotifyJob(
    tenantId: string,
    notificationId: string
  ): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'notify',
      payload: { notificationId },
      maxAttempts: 5,
    });
  }

  /**
   * Create an import parsing job
   */
  async createImportParseJob(
    tenantId: string,
    importId: string,
    fileR2Key: string
  ): Promise<Job> {
    return this.createJob({
      tenantId,
      jobType: 'import_parse',
      payload: { importId, fileR2Key },
      maxAttempts: 3,
    });
  }
}

/**
 * Create Jobs service factory
 */
export function createJobsService(db: D1Database): JobsService {
  return new JobsService(db);
}
