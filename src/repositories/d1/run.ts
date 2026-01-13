/**
 * D1 Run Repository implementation
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { select, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { Run, RunStatus, OperationMode } from '../../types/entities.js';
import type {
  IRunRepository,
  CreateRunInput,
  UpdateRunInput,
  RunFilter,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for runs table
 */
interface RunRow {
  id: string;
  project_id: string;
  name: string;
  status: RunStatus;
  operation_mode: OperationMode;
  start_at: string | null;
  end_at: string | null;
  run_design_json: string;
  stop_dsl_json: string;
  fixed_granularity_json: string;
  decision_rules_json: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  published_at: string | null;
  launched_at: string | null;
  completed_at: string | null;
}

/**
 * D1 Run Repository
 */
export class D1RunRepository
  extends BaseD1Repository<Run, CreateRunInput, UpdateRunInput>
  implements IRunRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'projectId',
    'name',
    'status',
    'operationMode',
    'startAt',
    'endAt',
    'runDesignJson',
    'stopDslJson',
    'fixedGranularityJson',
    'decisionRulesJson',
    'createdByUserId',
    'createdAt',
    'updatedAt',
    'approvedAt',
    'publishedAt',
    'launchedAt',
    'completedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'runs');
  }

  protected rowToEntity(row: RunRow): Run {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      status: row.status,
      operationMode: row.operation_mode,
      startAt: row.start_at,
      endAt: row.end_at,
      runDesignJson: row.run_design_json,
      stopDslJson: row.stop_dsl_json,
      fixedGranularityJson: row.fixed_granularity_json,
      decisionRulesJson: row.decision_rules_json,
      createdByUserId: row.created_by_user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      approvedAt: row.approved_at,
      publishedAt: row.published_at,
      launchedAt: row.launched_at,
      completedAt: row.completed_at,
    };
  }

  protected createInputToRow(input: CreateRunInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      project_id: input.projectId,
      name: input.name,
      status: input.status ?? 'Draft',
      operation_mode: input.operationMode ?? 'manual',
      start_at: input.startAt ?? null,
      end_at: input.endAt ?? null,
      run_design_json: input.runDesignJson ?? '{}',
      stop_dsl_json: input.stopDslJson ?? '{}',
      fixed_granularity_json: input.fixedGranularityJson ?? '{}',
      decision_rules_json: input.decisionRulesJson ?? '{}',
      created_by_user_id: input.createdByUserId ?? null,
      created_at: now,
      updated_at: now,
      approved_at: null,
      published_at: null,
      launched_at: null,
      completed_at: null,
    };
  }

  protected updateInputToRow(input: UpdateRunInput): Record<string, unknown> {
    return removeUndefined({
      name: input.name,
      status: input.status,
      operation_mode: input.operationMode,
      start_at: input.startAt,
      end_at: input.endAt,
      run_design_json: input.runDesignJson,
      stop_dsl_json: input.stopDslJson,
      fixed_granularity_json: input.fixedGranularityJson,
      decision_rules_json: input.decisionRulesJson,
      approved_at: input.approvedAt,
      published_at: input.publishedAt,
      launched_at: input.launchedAt,
      completed_at: input.completedAt,
    });
  }

  async findByProjectId(
    projectId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Run>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('project_id', '=', projectId);
    const total = await this.executor.count(countBuilder);

    const selectBuilder = select(this.tableName)
      .where('project_id', '=', projectId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<RunRow>(selectBuilder);
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
    filter: RunFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Run>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build count query
    let countBuilder = count(this.tableName);
    if (filter.projectId) {
      countBuilder = countBuilder.where('project_id', '=', filter.projectId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        countBuilder = countBuilder.whereIn('status', filter.status);
      } else {
        countBuilder = countBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.operationMode) {
      countBuilder = countBuilder.where('operation_mode', '=', filter.operationMode);
    }
    if (filter.createdByUserId) {
      countBuilder = countBuilder.where('created_by_user_id', '=', filter.createdByUserId);
    }
    if (filter.nameContains) {
      countBuilder = countBuilder.where('name', 'LIKE', `%${filter.nameContains}%`);
    }

    const total = await this.executor.count(countBuilder);

    // Build select query
    let selectBuilder = select(this.tableName);
    if (filter.projectId) {
      selectBuilder = selectBuilder.where('project_id', '=', filter.projectId);
    }
    if (filter.status) {
      if (Array.isArray(filter.status)) {
        selectBuilder = selectBuilder.whereIn('status', filter.status);
      } else {
        selectBuilder = selectBuilder.where('status', '=', filter.status);
      }
    }
    if (filter.operationMode) {
      selectBuilder = selectBuilder.where('operation_mode', '=', filter.operationMode);
    }
    if (filter.createdByUserId) {
      selectBuilder = selectBuilder.where('created_by_user_id', '=', filter.createdByUserId);
    }
    if (filter.nameContains) {
      selectBuilder = selectBuilder.where('name', 'LIKE', `%${filter.nameContains}%`);
    }

    selectBuilder = selectBuilder
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<RunRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByStatus(
    status: RunStatus,
    params?: PaginationParams
  ): Promise<PaginatedResult<Run>> {
    return this.findByFilter({ status }, params);
  }

  async findActiveRuns(params?: PaginationParams): Promise<PaginatedResult<Run>> {
    return this.findByFilter({ status: ['Live', 'Running'] }, params);
  }

  async updateStatus(id: string, status: RunStatus): Promise<Run | null> {
    return this.update(id, { status });
  }

  async updateOperationMode(id: string, mode: OperationMode): Promise<Run | null> {
    return this.update(id, { operationMode: mode });
  }

  async markApproved(id: string): Promise<Run | null> {
    return this.update(id, {
      status: 'Approved',
      approvedAt: this.now(),
    });
  }

  async markPublished(id: string): Promise<Run | null> {
    return this.update(id, {
      status: 'Live',
      publishedAt: this.now(),
    });
  }

  async markLaunched(id: string): Promise<Run | null> {
    return this.update(id, {
      status: 'Running',
      launchedAt: this.now(),
    });
  }

  async markCompleted(id: string): Promise<Run | null> {
    return this.update(id, {
      status: 'Completed',
      completedAt: this.now(),
    });
  }

  async belongsToProject(runId: string, projectId: string): Promise<boolean> {
    const builder = count(this.tableName)
      .where('id', '=', runId)
      .where('project_id', '=', projectId);

    const total = await this.executor.count(builder);
    return total > 0;
  }

  async countByStatusForProject(
    projectId: string
  ): Promise<Record<RunStatus, number>> {
    const sql = `
      SELECT status, COUNT(*) as count
      FROM ${this.tableName}
      WHERE project_id = ?
      GROUP BY status
    `;

    const rows = await this.executor.raw<{ status: RunStatus; count: number }>(sql, [projectId]);

    const result: Record<RunStatus, number> = {
      Draft: 0,
      Designing: 0,
      Generating: 0,
      ReadyForReview: 0,
      Approved: 0,
      Publishing: 0,
      Live: 0,
      Running: 0,
      Paused: 0,
      Completed: 0,
      Archived: 0,
    };

    for (const row of rows) {
      result[row.status] = row.count;
    }

    return result;
  }
}
