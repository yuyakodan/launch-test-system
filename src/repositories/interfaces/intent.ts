/**
 * Intent repository interface
 */

import type { Intent, IntentStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating an intent
 */
export interface CreateIntentInput {
  id?: string;
  runId: string;
  title: string;
  hypothesis?: string;
  evidenceJson?: string;
  faqJson?: string;
  priority?: number;
  status?: IntentStatus;
}

/**
 * Input for updating an intent
 */
export interface UpdateIntentInput {
  title?: string;
  hypothesis?: string;
  evidenceJson?: string;
  faqJson?: string;
  priority?: number;
  status?: IntentStatus;
}

/**
 * Filter options for finding intents
 */
export interface IntentFilter {
  runId?: string;
  status?: IntentStatus | IntentStatus[];
  titleContains?: string;
  minPriority?: number;
  maxPriority?: number;
}

/**
 * Intent repository interface
 */
export interface IIntentRepository
  extends IBaseRepository<Intent, CreateIntentInput, UpdateIntentInput> {
  /**
   * Find intents by run ID
   */
  findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<Intent>>;

  /**
   * Find intents by run ID ordered by priority
   */
  findByRunIdOrderedByPriority(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Intent>>;

  /**
   * Find intents by filter
   */
  findByFilter(filter: IntentFilter, params?: PaginationParams): Promise<PaginatedResult<Intent>>;

  /**
   * Find active intents for a run
   */
  findActiveByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<Intent>>;

  /**
   * Update intent status
   */
  updateStatus(id: string, status: IntentStatus): Promise<Intent | null>;

  /**
   * Update intent priority
   */
  updatePriority(id: string, priority: number): Promise<Intent | null>;

  /**
   * Bulk update priorities for reordering
   */
  bulkUpdatePriorities(updates: Array<{ id: string; priority: number }>): Promise<void>;

  /**
   * Pause an intent
   */
  pause(id: string): Promise<Intent | null>;

  /**
   * Activate an intent
   */
  activate(id: string): Promise<Intent | null>;

  /**
   * Archive an intent
   */
  archive(id: string): Promise<Intent | null>;

  /**
   * Check if intent belongs to run
   */
  belongsToRun(intentId: string, runId: string): Promise<boolean>;

  /**
   * Count intents by status for a run
   */
  countByStatusForRun(runId: string): Promise<Record<IntentStatus, number>>;

  /**
   * Get max priority for a run (for new intent ordering)
   */
  getMaxPriorityForRun(runId: string): Promise<number>;
}
