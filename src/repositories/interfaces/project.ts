/**
 * Project repository interface
 */

import type { Project, ProjectAsset } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating a project
 */
export interface CreateProjectInput {
  id?: string;
  tenantId: string;
  name: string;
  offerJson?: string;
  cvDefinitionJson?: string;
  ngRulesJson?: string;
  brandJson?: string;
  formConfigJson?: string;
  defaultDisclaimer?: string;
}

/**
 * Input for updating a project
 */
export interface UpdateProjectInput {
  name?: string;
  offerJson?: string;
  cvDefinitionJson?: string;
  ngRulesJson?: string;
  brandJson?: string;
  formConfigJson?: string;
  defaultDisclaimer?: string;
}

/**
 * Filter options for finding projects
 */
export interface ProjectFilter {
  tenantId?: string;
  nameContains?: string;
  includeArchived?: boolean;
}

/**
 * Project repository interface
 */
export interface IProjectRepository
  extends IBaseRepository<Project, CreateProjectInput, UpdateProjectInput> {
  /**
   * Find projects by tenant ID
   */
  findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Project>>;

  /**
   * Find projects by filter
   */
  findByFilter(
    filter: ProjectFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Project>>;

  /**
   * Find active (non-archived) projects for a tenant
   */
  findActiveByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Project>>;

  /**
   * Archive a project
   */
  archive(id: string): Promise<Project | null>;

  /**
   * Unarchive a project
   */
  unarchive(id: string): Promise<Project | null>;

  /**
   * Check if project belongs to tenant
   */
  belongsToTenant(projectId: string, tenantId: string): Promise<boolean>;
}

/**
 * Input for creating a project asset
 */
export interface CreateProjectAssetInput {
  id?: string;
  projectId: string;
  assetType: string;
  r2Key: string;
  metaJson?: string;
}

/**
 * Project asset repository interface
 */
export interface IProjectAssetRepository {
  /**
   * Find asset by ID
   */
  findById(id: string): Promise<ProjectAsset | null>;

  /**
   * Find assets by project ID
   */
  findByProjectId(projectId: string): Promise<ProjectAsset[]>;

  /**
   * Find assets by project ID and type
   */
  findByProjectIdAndType(projectId: string, assetType: string): Promise<ProjectAsset[]>;

  /**
   * Create a new asset
   */
  create(input: CreateProjectAssetInput): Promise<ProjectAsset>;

  /**
   * Delete an asset
   */
  delete(id: string): Promise<boolean>;

  /**
   * Delete all assets for a project
   */
  deleteByProjectId(projectId: string): Promise<number>;
}
