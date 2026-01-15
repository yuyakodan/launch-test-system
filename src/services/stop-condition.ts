/**
 * 停止条件DSL評価サービス
 * Cron/Queueから呼び出され、Run/Bundleの停止条件を評価・実行する
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  StopRulesDsl,
  EvaluationContext,
  DslEvaluationResult,
  ActionExecutionResult,
  StopRule,
  RuleType,
  ActionType,
  SeverityLevel,
} from '../types/stop-rules.js';
import type { Run, AdBundle, Incident, Job } from '../types/entities.js';
import { createDslParser, DslParseError } from './stop-rules/dsl-parser.js';
import { createRuleEvaluator } from './stop-rules/rule-evaluator.js';
import {
  createActionExecutor,
  type ActionExecutorDependencies,
  type ActionExecutorContext,
} from './stop-rules/action-executor.js';
import { ulid } from '../lib/ulid.js';

// ================================
// Types
// ================================

/**
 * 停止条件評価リクエスト
 */
export interface EvaluateStopRulesRequest {
  /** 評価対象のRun ID（指定しない場合はアクティブな全Runを評価） */
  runId?: string;
  /** 強制評価（gating条件を無視） */
  forceEvaluate?: boolean;
}

/**
 * 停止条件評価レスポンス
 */
export interface EvaluateStopRulesResponse {
  /** 評価時刻 */
  evaluatedAt: string;
  /** 評価されたRun数 */
  runsEvaluated: number;
  /** 評価結果リスト */
  results: RunEvaluationResult[];
  /** エラーがあったか */
  hasErrors: boolean;
}

/**
 * Run単位の評価結果
 */
export interface RunEvaluationResult {
  /** Run ID */
  runId: string;
  /** Run名 */
  runName: string;
  /** 評価成功したか */
  success: boolean;
  /** DSL評価結果 */
  evaluation?: DslEvaluationResult;
  /** アクション実行結果 */
  actionResults?: ActionExecutionResult[];
  /** エラーメッセージ */
  errorMessage?: string;
}

/**
 * 停止条件取得レスポンス
 */
export interface GetStopRulesResponse {
  /** Run ID */
  runId: string;
  /** DSLが設定されているか */
  hasStopRules: boolean;
  /** パースされたDSL */
  dsl?: StopRulesDsl;
  /** DSL検証結果 */
  validation?: {
    valid: boolean;
    errors: Array<{ code: string; message: string }>;
    warnings: Array<{ code: string; message: string }>;
  };
  /** 最後の評価時刻 */
  lastEvaluatedAt?: string;
}

/**
 * メトリクス集計結果
 */
interface AggregatedMetrics {
  totalSpend: number;
  dailySpend: number;
  totalConversions: number;
  totalClicks: number;
  totalImpressions: number;
  lastConversionAt?: string;
  lastEventAt?: string;
  syncFailureStreak: number;
  rejectedAdCount: number;
}

// ================================
// StopConditionService
// ================================

/**
 * 停止条件サービスクラス
 */
export class StopConditionService {
  private db: D1Database;
  private tenantId: string;

  constructor(db: D1Database, tenantId: string) {
    this.db = db;
    this.tenantId = tenantId;
  }

  /**
   * 停止条件を評価
   * @param request 評価リクエスト
   * @returns 評価レスポンス
   */
  async evaluate(request: EvaluateStopRulesRequest): Promise<EvaluateStopRulesResponse> {
    const evaluatedAt = new Date().toISOString();
    const results: RunEvaluationResult[] = [];
    let hasErrors = false;

    // 評価対象のRunを取得
    const runs = await this.getRunsToEvaluate(request.runId);

    for (const run of runs) {
      const result = await this.evaluateRun(run, request.forceEvaluate ?? false);
      results.push(result);
      if (!result.success) {
        hasErrors = true;
      }
    }

    return {
      evaluatedAt,
      runsEvaluated: runs.length,
      results,
      hasErrors,
    };
  }

  /**
   * 特定Runの停止条件を取得
   * @param runId Run ID
   * @returns 停止条件情報
   */
  async getStopRules(runId: string): Promise<GetStopRulesResponse> {
    const run = await this.getRun(runId);

    if (!run) {
      return {
        runId,
        hasStopRules: false,
      };
    }

    const response: GetStopRulesResponse = {
      runId,
      hasStopRules: false,
    };

    // stop_dsl_jsonが空か確認
    if (!run.stopDslJson || run.stopDslJson === '{}') {
      return response;
    }

    // DSLをパース
    const parser = createDslParser();
    try {
      const parsed = JSON.parse(run.stopDslJson);
      const validation = parser.validate(parsed);

      response.hasStopRules = true;
      response.validation = {
        valid: validation.valid,
        errors: validation.errors.map((e) => ({ code: e.code, message: e.message })),
        warnings: validation.warnings.map((w) => ({ code: w.code, message: w.message })),
      };

      if (validation.valid) {
        response.dsl = parsed as StopRulesDsl;
      }
    } catch (error) {
      response.validation = {
        valid: false,
        errors: [
          {
            code: 'PARSE_ERROR',
            message: (error as Error).message,
          },
        ],
        warnings: [],
      };
    }

    // 最後の評価時刻を取得
    const lastJob = await this.getLastEvaluationJob(runId);
    if (lastJob) {
      response.lastEvaluatedAt = lastJob.updatedAt;
    }

    return response;
  }

  /**
   * 単一Runを評価
   * @param run 評価対象のRun
   * @param forceEvaluate 強制評価フラグ
   * @returns 評価結果
   */
  private async evaluateRun(run: Run, forceEvaluate: boolean): Promise<RunEvaluationResult> {
    const result: RunEvaluationResult = {
      runId: run.id,
      runName: run.name,
      success: false,
    };

    try {
      // stop_dsl_jsonが空の場合はスキップ
      if (!run.stopDslJson || run.stopDslJson === '{}') {
        result.success = true;
        result.errorMessage = 'No stop rules configured';
        return result;
      }

      // DSLをパース
      const parser = createDslParser();
      let dsl: StopRulesDsl;
      try {
        dsl = parser.parse(run.stopDslJson);
      } catch (error) {
        if (error instanceof DslParseError) {
          result.errorMessage = `DSL parse error: ${error.message}`;
          return result;
        }
        throw error;
      }

      // 評価コンテキストを構築
      const context = await this.buildEvaluationContext(run);

      // ルールを評価
      const evaluator = createRuleEvaluator(dsl);
      const evaluation = evaluator.evaluate(context);
      result.evaluation = evaluation;

      // アクションを実行
      if (evaluation.actions.length > 0) {
        const deps = this.createActionExecutorDependencies();
        const executor = createActionExecutor(deps);
        const execContext: ActionExecutorContext = {
          tenantId: this.tenantId,
          runId: run.id,
          evaluatedAt: evaluation.evaluatedAt,
        };
        result.actionResults = await executor.executeAll(evaluation.actions, execContext);
      }

      // 評価結果をジョブとして記録
      await this.recordEvaluationJob(run.id, evaluation, result.actionResults);

      result.success = true;
    } catch (error) {
      result.errorMessage = (error as Error).message;
    }

    return result;
  }

  /**
   * 評価対象のRunを取得
   * @param runId 特定のRun ID（省略可）
   * @returns 評価対象のRunリスト
   */
  private async getRunsToEvaluate(runId?: string): Promise<Run[]> {
    if (runId) {
      const run = await this.getRun(runId);
      return run ? [run] : [];
    }

    // アクティブなRunを取得（Running, Paused, Live）
    const stmt = this.db.prepare(`
      SELECT r.*
      FROM runs r
      JOIN projects p ON r.project_id = p.id
      WHERE p.tenant_id = ?
        AND r.status IN ('Running', 'Paused', 'Live')
        AND r.stop_dsl_json IS NOT NULL
        AND r.stop_dsl_json != '{}'
      ORDER BY r.created_at DESC
    `);

    const result = await stmt.bind(this.tenantId).all<RunRow>();
    return (result.results || []).map(this.mapRunRow);
  }

  /**
   * 単一Runを取得
   * @param runId Run ID
   * @returns Run or null
   */
  private async getRun(runId: string): Promise<Run | null> {
    const stmt = this.db.prepare(`
      SELECT r.*
      FROM runs r
      JOIN projects p ON r.project_id = p.id
      WHERE r.id = ?
        AND p.tenant_id = ?
    `);

    const result = await stmt.bind(runId, this.tenantId).first<RunRow>();
    return result ? this.mapRunRow(result) : null;
  }

  /**
   * 最後の評価ジョブを取得
   * @param runId Run ID
   * @returns Job or null
   */
  private async getLastEvaluationJob(runId: string): Promise<Job | null> {
    const stmt = this.db.prepare(`
      SELECT *
      FROM jobs
      WHERE tenant_id = ?
        AND job_type = 'stop_eval'
        AND json_extract(payload_json, '$.runId') = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    const result = await stmt.bind(this.tenantId, runId).first<JobRow>();
    return result ? this.mapJobRow(result) : null;
  }

  /**
   * 評価コンテキストを構築
   * @param run Run
   * @returns 評価コンテキスト
   */
  private async buildEvaluationContext(run: Run): Promise<EvaluationContext> {
    const metrics = await this.aggregateMetrics(run.id);
    const currentTime = new Date().toISOString();

    return {
      runId: run.id,
      runStartedAt: run.launchedAt || run.createdAt,
      currentTime,
      totalSpend: metrics.totalSpend,
      dailySpend: metrics.dailySpend,
      totalConversions: metrics.totalConversions,
      totalClicks: metrics.totalClicks,
      totalImpressions: metrics.totalImpressions,
      lastConversionAt: metrics.lastConversionAt,
      lastEventAt: metrics.lastEventAt,
      syncFailureStreak: metrics.syncFailureStreak,
      rejectedAdCount: metrics.rejectedAdCount,
      runStatus: run.status,
    };
  }

  /**
   * メトリクスを集計
   * @param runId Run ID
   * @returns 集計されたメトリクス
   */
  private async aggregateMetrics(runId: string): Promise<AggregatedMetrics> {
    // insights_daily から総消費額・クリック・インプレッションを集計
    const insightsStmt = this.db.prepare(`
      SELECT
        SUM(json_extract(metrics_json, '$.spend')) as total_spend,
        SUM(json_extract(metrics_json, '$.clicks')) as total_clicks,
        SUM(json_extract(metrics_json, '$.impressions')) as total_impressions
      FROM insights_daily
      WHERE ad_bundle_id IN (
        SELECT id FROM ad_bundles WHERE run_id = ?
      )
    `);
    const insightsResult = await insightsStmt.bind(runId).first<{
      total_spend: number | null;
      total_clicks: number | null;
      total_impressions: number | null;
    }>();

    // 本日の消費額を取得
    const today = new Date().toISOString().split('T')[0];
    const dailyStmt = this.db.prepare(`
      SELECT
        SUM(json_extract(metrics_json, '$.spend')) as daily_spend
      FROM insights_daily
      WHERE ad_bundle_id IN (
        SELECT id FROM ad_bundles WHERE run_id = ?
      )
      AND date_yyyy_mm_dd = ?
    `);
    const dailyResult = await dailyStmt.bind(runId, today).first<{
      daily_spend: number | null;
    }>();

    // events から CV数と最後のイベント時刻を取得
    const eventsStmt = this.db.prepare(`
      SELECT
        COUNT(*) FILTER (WHERE event_type IN ('form_submit', 'form_success')) as total_cvs,
        MAX(CASE WHEN event_type IN ('form_submit', 'form_success') THEN ts_ms END) as last_cv_ms,
        MAX(ts_ms) as last_event_ms
      FROM events
      WHERE run_id = ?
    `);
    const eventsResult = await eventsStmt.bind(runId).first<{
      total_cvs: number | null;
      last_cv_ms: number | null;
      last_event_ms: number | null;
    }>();

    // 同期失敗連続回数を取得
    const syncStmt = this.db.prepare(`
      SELECT COUNT(*) as streak
      FROM jobs
      WHERE tenant_id = ?
        AND job_type = 'meta_sync'
        AND json_extract(payload_json, '$.runId') = ?
        AND status = 'failed'
        AND created_at > (
          SELECT COALESCE(MAX(created_at), '1970-01-01')
          FROM jobs
          WHERE tenant_id = ?
            AND job_type = 'meta_sync'
            AND json_extract(payload_json, '$.runId') = ?
            AND status = 'succeeded'
        )
    `);
    const syncResult = await syncStmt.bind(this.tenantId, runId, this.tenantId, runId).first<{
      streak: number;
    }>();

    // Rejected広告数を取得
    const rejectedStmt = this.db.prepare(`
      SELECT COUNT(*) as count
      FROM meta_entities
      WHERE run_id = ?
        AND status = 'rejected'
    `);
    const rejectedResult = await rejectedStmt.bind(runId).first<{
      count: number;
    }>();

    return {
      totalSpend: insightsResult?.total_spend ?? 0,
      dailySpend: dailyResult?.daily_spend ?? 0,
      totalConversions: eventsResult?.total_cvs ?? 0,
      totalClicks: insightsResult?.total_clicks ?? 0,
      totalImpressions: insightsResult?.total_impressions ?? 0,
      lastConversionAt: eventsResult?.last_cv_ms
        ? new Date(eventsResult.last_cv_ms).toISOString()
        : undefined,
      lastEventAt: eventsResult?.last_event_ms
        ? new Date(eventsResult.last_event_ms).toISOString()
        : undefined,
      syncFailureStreak: syncResult?.streak ?? 0,
      rejectedAdCount: rejectedResult?.count ?? 0,
    };
  }

  /**
   * 評価結果をジョブとして記録
   * @param runId Run ID
   * @param evaluation 評価結果
   * @param actionResults アクション実行結果
   */
  private async recordEvaluationJob(
    runId: string,
    evaluation: DslEvaluationResult,
    actionResults?: ActionExecutionResult[]
  ): Promise<void> {
    const jobId = ulid();
    const now = new Date().toISOString();

    const stmt = this.db.prepare(`
      INSERT INTO jobs (
        id, tenant_id, job_type, status, payload_json, result_json,
        attempts, max_attempts, last_error, created_at, updated_at
      )
      VALUES (?, ?, 'stop_eval', 'succeeded', ?, ?, 1, 1, '', ?, ?)
    `);

    await stmt
      .bind(
        jobId,
        this.tenantId,
        JSON.stringify({ runId }),
        JSON.stringify({
          evaluation: {
            evaluatedAt: evaluation.evaluatedAt,
            rulesEvaluated: evaluation.rulesEvaluated,
            rulesTriggered: evaluation.rulesTriggered,
            rulesSkipped: evaluation.rulesSkipped,
            hasError: evaluation.hasError,
          },
          actionResults: actionResults ?? [],
        }),
        now,
        now
      )
      .run();
  }

  /**
   * アクション実行器の依存関係を作成
   * @returns ActionExecutorDependencies
   */
  private createActionExecutorDependencies(): ActionExecutorDependencies {
    const db = this.db;
    const tenantId = this.tenantId;

    return {
      pauseRun: async (runId: string): Promise<boolean> => {
        const stmt = db.prepare(`
          UPDATE runs
          SET status = 'Paused', updated_at = ?
          WHERE id = ?
        `);
        const result = await stmt.bind(new Date().toISOString(), runId).run();
        return result.meta.changes > 0;
      },

      pauseBundles: async (bundleIds: string[]): Promise<string[]> => {
        const pausedIds: string[] = [];
        for (const id of bundleIds) {
          const stmt = db.prepare(`
            UPDATE ad_bundles
            SET status = 'paused', updated_at = ?
            WHERE id = ?
          `);
          const result = await stmt.bind(new Date().toISOString(), id).run();
          if (result.meta.changes > 0) {
            pausedIds.push(id);
          }
        }
        return pausedIds;
      },

      sendNotification: async (notification): Promise<boolean> => {
        const notifId = ulid();
        const now = new Date().toISOString();
        const stmt = db.prepare(`
          INSERT INTO notifications (
            id, tenant_id, channel, event_type, payload_json, status, created_at
          )
          VALUES (?, ?, ?, 'stop_rule_triggered', ?, 'pending', ?)
        `);
        const result = await stmt
          .bind(
            notifId,
            tenantId,
            notification.channel,
            JSON.stringify(notification),
            now
          )
          .run();
        return result.meta.changes > 0;
      },

      createIncident: async (incident): Promise<string | null> => {
        const incidentId = ulid();
        const now = new Date().toISOString();
        const stmt = db.prepare(`
          INSERT INTO incidents (
            id, tenant_id, run_id, incident_type, severity, status,
            reason, meta_json, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
        `);
        const result = await stmt
          .bind(
            incidentId,
            incident.tenantId,
            incident.runId,
            incident.type,
            incident.severity,
            incident.reason,
            JSON.stringify(incident.metadata ?? {}),
            now,
            now
          )
          .run();
        return result.meta.changes > 0 ? incidentId : null;
      },

      logAudit: async (log): Promise<void> => {
        const auditId = ulid();
        const now = Date.now();
        const stmt = db.prepare(`
          INSERT INTO audit_logs (
            id, tenant_id, action, target_type, target_id,
            before_json, after_json, hash, request_id, ts_ms
          )
          VALUES (?, ?, ?, ?, ?, '{}', ?, ?, ?, ?)
        `);
        await stmt
          .bind(
            auditId,
            tenantId,
            log.action,
            log.targetType,
            log.targetId,
            JSON.stringify(log.details),
            'stub_hash', // Actual hash should be computed
            ulid(),
            now
          )
          .run();
      },
    };
  }

  /**
   * DBの行をRunエンティティにマッピング
   */
  private mapRunRow(row: RunRow): Run {
    return {
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      status: row.status as Run['status'],
      operationMode: row.operation_mode as Run['operationMode'],
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

  /**
   * DBの行をJobエンティティにマッピング
   */
  private mapJobRow(row: JobRow): Job {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      jobType: row.job_type as Job['jobType'],
      status: row.status as Job['status'],
      payloadJson: row.payload_json,
      resultJson: row.result_json,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

// ================================
// DB Row Types
// ================================

interface RunRow {
  id: string;
  project_id: string;
  name: string;
  status: string;
  operation_mode: string;
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

interface JobRow {
  id: string;
  tenant_id: string;
  job_type: string;
  status: string;
  payload_json: string;
  result_json: string;
  attempts: number;
  max_attempts: number;
  last_error: string;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ================================
// Factory Function
// ================================

/**
 * StopConditionServiceのファクトリ関数
 * @param db D1Database
 * @param tenantId テナントID
 * @returns StopConditionServiceインスタンス
 */
export function createStopConditionService(
  db: D1Database,
  tenantId: string
): StopConditionService {
  return new StopConditionService(db, tenantId);
}

// ================================
// Exports
// ================================

export type {
  StopRulesDsl,
  EvaluationContext,
  DslEvaluationResult,
  ActionExecutionResult,
  StopRule,
  RuleType,
  ActionType,
  SeverityLevel,
};
