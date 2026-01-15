/**
 * Deployment repository interface
 */

import type { Deployment, DeploymentStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating a deployment
 */
export interface CreateDeploymentInput {
  id?: string;
  runId: string;
  status?: DeploymentStatus;
  urlsJson?: string;
  snapshotManifestR2Key?: string | null;
}

/**
 * Input for updating a deployment
 */
export interface UpdateDeploymentInput {
  status?: DeploymentStatus;
  urlsJson?: string;
  snapshotManifestR2Key?: string | null;
}

/**
 * Filter options for finding deployments
 */
export interface DeploymentFilter {
  runId?: string;
  status?: DeploymentStatus | DeploymentStatus[];
}

/**
 * Deployment repository interface
 */
export interface IDeploymentRepository
  extends IBaseRepository<Deployment, CreateDeploymentInput, UpdateDeploymentInput> {
  /**
   * Find deployments by run ID
   */
  findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<Deployment>>;

  /**
   * Find latest deployment for a run
   */
  findLatestByRunId(runId: string): Promise<Deployment | null>;

  /**
   * Find deployments by filter
   */
  findByFilter(
    filter: DeploymentFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Deployment>>;

  /**
   * Find published deployment for a run
   */
  findPublishedByRunId(runId: string): Promise<Deployment | null>;

  /**
   * Update deployment status
   */
  updateStatus(id: string, status: DeploymentStatus): Promise<Deployment | null>;

  /**
   * Mark deployment as published
   */
  markPublished(id: string): Promise<Deployment | null>;

  /**
   * Mark deployment as rolled back
   */
  markRolledBack(id: string): Promise<Deployment | null>;

  /**
   * Check if deployment belongs to run
   */
  belongsToRun(deploymentId: string, runId: string): Promise<boolean>;
}
