/**
 * Decision Repository Interface
 * CRUD operations for decisions table
 */

import type { Decision, DecisionConfidence } from '../../types/entities.js';
import type { IBaseRepository, PaginationParams, PaginatedResult } from './base.js';

/**
 * Input for creating a new decision
 */
export interface CreateDecisionInput {
  /** Run ID this decision belongs to */
  runId: string;
  /** Decision status (draft or final) */
  status?: 'draft' | 'final';
  /** Confidence level of the decision */
  confidence: DecisionConfidence;
  /** Winner information as JSON string */
  winnerJson?: string;
  /** Ranking information as JSON string */
  rankingJson?: string;
  /** Statistics details as JSON string (CI/Bayes results) */
  statsJson?: string;
  /** Human-readable rationale for the decision */
  rationale?: string;
  /** Timestamp when decision was made (null for draft) */
  decidedAt?: string | null;
  /** User ID who created this decision */
  createdByUserId?: string | null;
}

/**
 * Input for updating an existing decision
 */
export interface UpdateDecisionInput {
  /** Decision status (draft or final) */
  status?: 'draft' | 'final';
  /** Confidence level of the decision */
  confidence?: DecisionConfidence;
  /** Winner information as JSON string */
  winnerJson?: string;
  /** Ranking information as JSON string */
  rankingJson?: string;
  /** Statistics details as JSON string */
  statsJson?: string;
  /** Human-readable rationale for the decision */
  rationale?: string;
  /** Timestamp when decision was made */
  decidedAt?: string | null;
}

/**
 * Filter options for finding decisions
 */
export interface DecisionFilter {
  /** Filter by run ID */
  runId?: string;
  /** Filter by status */
  status?: 'draft' | 'final';
  /** Filter by confidence level */
  confidence?: DecisionConfidence;
  /** Filter by created by user ID */
  createdByUserId?: string;
}

/**
 * Decision Repository Interface
 */
export interface IDecisionRepository extends IBaseRepository<Decision, CreateDecisionInput, UpdateDecisionInput> {
  /**
   * Find all decisions for a specific run
   * @param runId - Run ID to filter by
   * @param params - Optional pagination parameters
   */
  findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<Decision>>;

  /**
   * Find the latest decision for a run
   * @param runId - Run ID to search
   */
  findLatestByRunId(runId: string): Promise<Decision | null>;

  /**
   * Find the final decision for a run (status = 'final')
   * @param runId - Run ID to search
   */
  findFinalByRunId(runId: string): Promise<Decision | null>;

  /**
   * Find decisions by filter criteria
   * @param filter - Filter options
   * @param params - Optional pagination parameters
   */
  findByFilter(filter: DecisionFilter, params?: PaginationParams): Promise<PaginatedResult<Decision>>;

  /**
   * Mark a decision as final
   * @param id - Decision ID
   * @param decidedAt - Timestamp of the final decision (defaults to now)
   */
  markFinal(id: string, decidedAt?: string): Promise<Decision | null>;

  /**
   * Count decisions by run ID
   * @param runId - Run ID to count
   */
  countByRunId(runId: string): Promise<number>;

  /**
   * Check if a run has a final decision
   * @param runId - Run ID to check
   */
  hasFinalDecision(runId: string): Promise<boolean>;
}
