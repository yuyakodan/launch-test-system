/**
 * Run repository interface
 */

import type { Run, RunStatus, OperationMode } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating a run
 */
export interface CreateRunInput {
  id?: string;
  projectId: string;
  name: string;
  status?: RunStatus;
  operationMode?: OperationMode;
  startAt?: string | null;
  endAt?: string | null;
  runDesignJson?: string;
  stopDslJson?: string;
  fixedGranularityJson?: string;
  decisionRulesJson?: string;
  createdByUserId?: string | null;
}

/**
 * Input for updating a run
 */
export interface UpdateRunInput {
  name?: string;
  status?: RunStatus;
  operationMode?: OperationMode;
  startAt?: string | null;
  endAt?: string | null;
  runDesignJson?: string;
  stopDslJson?: string;
  fixedGranularityJson?: string;
  decisionRulesJson?: string;
  approvedAt?: string | null;
  publishedAt?: string | null;
  launchedAt?: string | null;
  completedAt?: string | null;
}

/**
 * Filter options for finding runs
 */
export interface RunFilter {
  projectId?: string;
  status?: RunStatus | RunStatus[];
  operationMode?: OperationMode;
  createdByUserId?: string;
  nameContains?: string;
}

/**
 * Run repository interface
 */
export interface IRunRepository extends IBaseRepository<Run, CreateRunInput, UpdateRunInput> {
  /**
   * Find runs by project ID
   */
  findByProjectId(projectId: string, params?: PaginationParams): Promise<PaginatedResult<Run>>;

  /**
   * Find runs by filter
   */
  findByFilter(filter: RunFilter, params?: PaginationParams): Promise<PaginatedResult<Run>>;

  /**
   * Find runs by status
   */
  findByStatus(status: RunStatus, params?: PaginationParams): Promise<PaginatedResult<Run>>;

  /**
   * Find active runs (Live or Running status)
   */
  findActiveRuns(params?: PaginationParams): Promise<PaginatedResult<Run>>;

  /**
   * Update run status
   */
  updateStatus(id: string, status: RunStatus): Promise<Run | null>;

  /**
   * Update run operation mode
   */
  updateOperationMode(id: string, mode: OperationMode): Promise<Run | null>;

  /**
   * Mark run as approved
   */
  markApproved(id: string): Promise<Run | null>;

  /**
   * Mark run as published
   */
  markPublished(id: string): Promise<Run | null>;

  /**
   * Mark run as launched
   */
  markLaunched(id: string): Promise<Run | null>;

  /**
   * Mark run as completed
   */
  markCompleted(id: string): Promise<Run | null>;

  /**
   * Check if run belongs to project
   */
  belongsToProject(runId: string, projectId: string): Promise<boolean>;

  /**
   * Count runs by status for a project
   */
  countByStatusForProject(
    projectId: string
  ): Promise<Record<RunStatus, number>>;
}
