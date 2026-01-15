/**
 * Meta Entity Repository Interface
 * Handles meta_entities table CRUD operations
 */

import type { MetaEntity, MetaEntityType } from '../../types/entities.js';
import type { IBaseRepository, PaginationParams, PaginatedResult } from './base.js';

/**
 * Input for creating a new Meta entity
 */
export interface CreateMetaEntityInput {
  runId: string;
  intentId?: string;
  entityType: MetaEntityType;
  localRef: string;
  remoteId?: string;
  status?: string;
  metaJson?: string;
}

/**
 * Input for updating a Meta entity
 */
export interface UpdateMetaEntityInput {
  remoteId?: string | null;
  status?: string;
  metaJson?: string;
}

/**
 * Filter options for Meta entities
 */
export interface MetaEntityFilter {
  runId?: string;
  intentId?: string;
  entityType?: MetaEntityType;
  localRef?: string;
  remoteId?: string;
  status?: string;
}

/**
 * Meta Entity Repository Interface
 */
export interface IMetaEntityRepository
  extends IBaseRepository<MetaEntity, CreateMetaEntityInput, UpdateMetaEntityInput> {
  /**
   * Find all entities for a run
   */
  findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<MetaEntity>>;

  /**
   * Find all entities for an intent
   */
  findByIntentId(intentId: string, params?: PaginationParams): Promise<PaginatedResult<MetaEntity>>;

  /**
   * Find entity by local reference
   */
  findByLocalRef(runId: string, localRef: string): Promise<MetaEntity | null>;

  /**
   * Find entity by remote (Meta) ID
   */
  findByRemoteId(remoteId: string): Promise<MetaEntity | null>;

  /**
   * Find entities by type for a run
   */
  findByRunAndType(
    runId: string,
    entityType: MetaEntityType,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaEntity>>;

  /**
   * Find entities with filter
   */
  findByFilter(
    filter: MetaEntityFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<MetaEntity>>;

  /**
   * Update remote ID (after Meta API creation)
   */
  updateRemoteId(id: string, remoteId: string): Promise<MetaEntity | null>;

  /**
   * Update status
   */
  updateStatus(id: string, status: string): Promise<MetaEntity | null>;

  /**
   * Batch create entities
   */
  createBatch(inputs: CreateMetaEntityInput[]): Promise<MetaEntity[]>;
}
