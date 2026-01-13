/**
 * D1 Intent Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { Intent, IntentStatus } from '../../types/entities.js';
import type {
  IIntentRepository,
  CreateIntentInput,
  UpdateIntentInput,
  IntentFilter,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for intents table
 */
interface IntentRow {
  id: string;
  run_id: string;
  title: string;
  hypothesis: string;
  evidence_json: string;
  faq_json: string;
  priority: number;
  status: IntentStatus;
  created_at: string;
  updated_at: string;
}

/**
 * D1 Intent Repository
 */
export class D1IntentRepository
  extends BaseD1Repository<Intent, CreateIntentInput, UpdateIntentInput>
  implements IIntentRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'runId',
    'title',
    'hypothesis',
    'evidenceJson',
    'faqJson',
    'priority',
    'status',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'intents');
  }

  protected rowToEntity(row: IntentRow): Intent {
    return {
      id: row.id,
      runId: row.run_id,
      title: row.title,
      hypothesis: row.hypothesis,
      evidenceJson: row.evidence_json,
      faqJson: row.faq_json,
      priority: row.priority,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateIntentInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      run_id: input.runId,
      title: input.title,
      hypothesis: input.hypothesis ?? '',
      evidence_json: input.evidenceJson ?? '{}',
      faq_json: input.faqJson ?? '{}',
      priority: input.priority ?? 0,
      status: input.status ?? 'active',
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateIntentInput): Record<string, unknown> {
    return removeUndefined({
      title: input.title,
      hypothesis: input.hypothesis,
      evidence_json: input.evidenceJson,
      faq_json: input.faqJson,
      priority: input.priority,
      status: input.status,
    });
  }

  async findByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Intent>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IntentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByRunIdOrderedByPriority(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Intent>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('run_id', '=', runId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('run_id', '=', runId)
      .orderBy('priority', 'DESC')
      .orderBy('created_at', 'ASC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IntentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByFilter(
    filter: IntentFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Intent>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.runId) {
      countBuilder = countBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.titleContains) {
      countBuilder = countBuilder.where('title', 'LIKE', `%${filter.titleContains}%`);
    }
    if (filter.minPriority !== undefined) {
      countBuilder = countBuilder.where('priority', '>=', filter.minPriority);
    }
    if (filter.maxPriority !== undefined) {
      countBuilder = countBuilder.where('priority', '<=', filter.maxPriority);
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.runId) {
      selectBuilder = selectBuilder.where('run_id', '=', filter.runId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.titleContains) {
      selectBuilder = selectBuilder.where('title', 'LIKE', `%${filter.titleContains}%`);
    }
    if (filter.minPriority !== undefined) {
      selectBuilder = selectBuilder.where('priority', '>=', filter.minPriority);
    }
    if (filter.maxPriority !== undefined) {
      selectBuilder = selectBuilder.where('priority', '<=', filter.maxPriority);
    }

    selectBuilder = selectBuilder
      .orderBy('priority', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<IntentRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findActiveByRunId(
    runId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Intent>> {
    return this.findByFilter({ runId, status: 'active' }, params);
  }

  async updateStatus(id: string, status: IntentStatus): Promise<Intent | null> {
    return this.update(id, { status });
  }

  async updatePriority(id: string, priority: number): Promise<Intent | null> {
    return this.update(id, { priority });
  }

  async bulkUpdatePriorities(
    updates: Array<{ id: string; priority: number }>
  ): Promise<void> {
    const statements: D1PreparedStatement[] = [];
    const now = this.now();

    for (const { id, priority } of updates) {
      const stmt = this.executor.prepare(
        `UPDATE ${this.tableName} SET priority = ?, updated_at = ? WHERE id = ?`
      );
      statements.push(stmt.bind(priority, now, id));
    }

    await this.executor.batch(statements);
  }

  async pause(id: string): Promise<Intent | null> {
    return this.updateStatus(id, 'paused');
  }

  async activate(id: string): Promise<Intent | null> {
    return this.updateStatus(id, 'active');
  }

  async archive(id: string): Promise<Intent | null> {
    return this.updateStatus(id, 'archived');
  }

  async belongsToRun(intentId: string, runId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', intentId)
      .where('run_id', '=', runId);

    const total = await this.executor.count(builder);
    return total > 0;
  }

  async countByStatusForRun(runId: string): Promise<Record<IntentStatus, number>> {
    const sql = `
      SELECT status, COUNT(*) as count
      FROM ${this.tableName}
      WHERE run_id = ?
      GROUP BY status
    `;

    const rows = await this.executor.raw<{ status: IntentStatus; count: number }>(sql, [runId]);

    const result: Record<IntentStatus, number> = {
      active: 0,
      paused: 0,
      archived: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
    }

    return result;
  }

  async getMaxPriorityForRun(runId: string): Promise<number> {
    const sql = `
      SELECT MAX(priority) as max_priority
      FROM ${this.tableName}
      WHERE run_id = ?
    `;

    const result = await this.executor.rawFirst<{ max_priority: number | null }>(sql, [runId]);
    return result?.max_priority ?? 0;
  }
}
