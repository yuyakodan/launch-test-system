/**
 * D1 Decision Repository implementation
 * CRUD operations for decisions table
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count, update as updateBuilder } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { Decision, DecisionConfidence } from '../../types/entities.js';
import type {
  IDecisionRepository,
  CreateDecisionInput,
  UpdateDecisionInput,
  DecisionFilter,
} from '../interfaces/decision.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * Database row type for decisions table
 */
interface DecisionRow {
  id: string;
  run_id: string;
  status: 'draft' | 'final';
  confidence: DecisionConfidence;
  winner_json: string;
  ranking_json: string;
  stats_json: string;
  rationale: string;
  decided_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

/**
 * D1 Decision Repository
 */
export class D1DecisionRepository
  extends BaseD1Repository<Decision, CreateDecisionInput, UpdateDecisionInput>
  implements IDecisionRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'runId',
    'status',
    'confidence',
    'winnerJson',
    'rankingJson',
    'statsJson',
    'rationale',
    'decidedAt',
    'createdByUserId',
    'createdAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'decisions');
  }

  protected rowToEntity(row: DecisionRow): Decision {
    return {
      id: row.id,
      runId: row.run_id,
      status: row.status,
      confidence: row.confidence,
      winnerJson: row.winner_json,
      rankingJson: row.ranking_json,
      statsJson: row.stats_json,
      rationale: row.rationale,
      decidedAt: row.decided_at,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
    };
  }

  protected createInputToRow(input: CreateDecisionInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: ulid(),
      run_id: input.runId,
      status: input.status ?? 'draft',
      confidence: input.confidence,
      winner_json: input.winnerJson ?? '{}',
      ranking_json: input.rankingJson ?? '[]',
      stats_json: input.statsJson ?? '{}',
      rationale: input.rationale ?? '',
      decided_at: input.decidedAt ?? null,
      created_by_user_id: input.createdByUserId ?? null,
      created_at: now,
    };
  }

  protected updateInputToRow(input: UpdateDecisionInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      confidence: input.confidence,
      winner_json: input.winnerJson,
      ranking_json: input.rankingJson,
      stats_json: input.statsJson,
      rationale: input.rationale,
      decided_at: input.decidedAt,
    });
  }

  /**
   * Find all decisions for a specific run
   */
  async findByRunId(runId: string, params?: PaginationParams): Promise<PaginatedResult<Decision>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<DecisionRow>(selectBuilder);
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
   * Find the latest decision for a run
   */
  async findLatestByRunId(runId: string): Promise<Decision | null> {
    const builder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<DecisionRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find the final decision for a run (status = 'final')
   */
  async findFinalByRunId(runId: string): Promise<Decision | null> {
    const builder = select(this.tableName)
      .where('run_id', '=', runId)
      .where('status', '=', 'final')
      .orderBy('created_at', 'DESC')
      .limit(1);

    const row = await this.executor.first<DecisionRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find decisions by filter criteria
   */
  async findByFilter(
    filter: DecisionFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Decision>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countQuery = count(this.tableName);
    if (filter.runId) {
      countQuery = countQuery.where('run_id', '=', filter.runId);
    }
    if (filter.status) {
      countQuery = countQuery.where('status', '=', filter.status);
    }
    if (filter.confidence) {
      countQuery = countQuery.where('confidence', '=', filter.confidence);
    }
    if (filter.createdByUserId) {
      countQuery = countQuery.where('created_by_user_id', '=', filter.createdByUserId);
    }

    const total = await this.executor.count(countQuery);

    // Build select query
    let selectQuery = select(this.tableName);
    if (filter.runId) {
      selectQuery = selectQuery.where('run_id', '=', filter.runId);
    }
    if (filter.status) {
      selectQuery = selectQuery.where('status', '=', filter.status);
    }
    if (filter.confidence) {
      selectQuery = selectQuery.where('confidence', '=', filter.confidence);
    }
    if (filter.createdByUserId) {
      selectQuery = selectQuery.where('created_by_user_id', '=', filter.createdByUserId);
    }

    selectQuery = selectQuery.orderBy('created_at', 'DESC').limit(limit).offset(offset);

    const rows = await this.executor.all<DecisionRow>(selectQuery);
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
   * Mark a decision as final
   */
  async markFinal(id: string, decidedAt?: string): Promise<Decision | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const builder = updateBuilder(this.tableName)
      .set({
        status: 'final',
        decided_at: decidedAt ?? this.now(),
      })
      .where('id', '=', id);

    await this.executor.update(builder);
    return this.findById(id);
  }

  /**
   * Count decisions by run ID
   */
  async countByRunId(runId: string): Promise<number> {
    const builder = count(this.tableName).where('run_id', '=', runId);
    return this.executor.count(builder);
  }

  /**
   * Check if a run has a final decision
   */
  async hasFinalDecision(runId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('run_id', '=', runId)
      .where('status', '=', 'final');
    const total = await this.executor.count(builder);
    return total > 0;
  }
}
