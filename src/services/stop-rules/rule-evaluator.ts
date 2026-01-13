/**
 * ルール評価エンジン
 * 各ルールタイプの評価ロジックを実装
 */

import type {
  StopRulesDsl,
  StopRule,
  EvaluationContext,
  RuleEvaluationResult,
  DslEvaluationResult,
  ActionToExecute,
  GatingConditions,
  SpendTotalCapRule,
  SpendDailyCapRule,
  CpaCapRule,
  CvZeroDurationRule,
  MeasurementAnomalyRule,
  MetaRejectedRule,
  SyncFailureStreakRule,
} from '../../types/stop-rules.js';

/**
 * ルール評価エンジンクラス
 */
export class RuleEvaluator {
  private dsl: StopRulesDsl;

  constructor(dsl: StopRulesDsl) {
    this.dsl = dsl;
  }

  /**
   * DSL全体を評価
   * @param context 評価コンテキスト
   * @returns 評価結果
   */
  evaluate(context: EvaluationContext): DslEvaluationResult {
    const evaluatedAt = new Date().toISOString();
    const results: RuleEvaluationResult[] = [];
    const actions: ActionToExecute[] = [];
    let hasError = false;
    let errorMessage: string | undefined;

    try {
      // 有効なルールのみを評価
      const enabledRules = this.dsl.rules.filter((rule) => rule.enabled);

      for (const rule of enabledRules) {
        const result = this.evaluateRule(rule, context);
        results.push(result);

        // トリガーされたルールのアクションを収集
        if (result.triggered && result.action) {
          actions.push({
            type: result.action,
            triggeredByRuleId: result.ruleId,
            severity: result.severity!,
            reason: result.triggerReason || 'Rule triggered',
            targetBundleIds: result.targetBundleIds,
            metadata: result.metadata,
          });
        }
      }
    } catch (error) {
      hasError = true;
      errorMessage = (error as Error).message;

      // セーフモードが有効な場合、停止アクションを追加
      if (this.dsl.safe_mode_on_error) {
        actions.push({
          type: 'pause_run',
          triggeredByRuleId: 'safe_mode',
          severity: 'critical',
          reason: `Evaluation error with safe_mode_on_error enabled: ${errorMessage}`,
        });
      }
    }

    // 重複アクションの除去と優先度順のソート
    const deduplicatedActions = this.deduplicateAndPrioritizeActions(actions);

    return {
      evaluatedAt,
      runId: context.runId,
      rulesEvaluated: results.filter((r) => !r.skipped).length,
      rulesTriggered: results.filter((r) => r.triggered).length,
      rulesSkipped: results.filter((r) => r.skipped).length,
      results,
      actions: deduplicatedActions,
      hasError,
      errorMessage,
    };
  }

  /**
   * 単一ルールを評価
   * @param rule 評価するルール
   * @param context 評価コンテキスト
   * @returns 評価結果
   */
  private evaluateRule(
    rule: StopRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    // ゲーティング条件のチェック
    if (rule.gating) {
      const gatingResult = this.checkGatingConditions(rule.gating, context);
      if (!gatingResult.passed) {
        return {
          ruleId: rule.id,
          ruleType: rule.type,
          triggered: false,
          skipped: true,
          skipReason: gatingResult.reason,
        };
      }
    }

    // ルールタイプに応じた評価
    switch (rule.type) {
      case 'spend_total_cap':
        return this.evaluateSpendTotalCap(rule, context);
      case 'spend_daily_cap':
        return this.evaluateSpendDailyCap(rule, context);
      case 'cpa_cap':
        return this.evaluateCpaCap(rule, context);
      case 'cv_zero_duration':
        return this.evaluateCvZeroDuration(rule, context);
      case 'measurement_anomaly':
        return this.evaluateMeasurementAnomaly(rule, context);
      case 'meta_rejected':
        return this.evaluateMetaRejected(rule, context);
      case 'sync_failure_streak':
        return this.evaluateSyncFailureStreak(rule, context);
      default: {
        // exhaustive check - this should never happen
        const _exhaustiveCheck: never = rule;
        return {
          ruleId: (_exhaustiveCheck as StopRule).id,
          ruleType: (_exhaustiveCheck as StopRule).type,
          triggered: false,
          skipped: true,
          skipReason: `Unknown rule type: ${(_exhaustiveCheck as StopRule).type}`,
        };
      }
    }
  }

  /**
   * ゲーティング条件のチェック
   * @param gating ゲーティング条件
   * @param context 評価コンテキスト
   * @returns チェック結果
   */
  private checkGatingConditions(
    gating: GatingConditions,
    context: EvaluationContext
  ): { passed: boolean; reason?: string } {
    // min_elapsed_sec のチェック
    if (gating.min_elapsed_sec !== undefined) {
      const elapsedSec = this.calculateElapsedSeconds(
        context.runStartedAt,
        context.currentTime
      );
      if (elapsedSec < gating.min_elapsed_sec) {
        return {
          passed: false,
          reason: `Elapsed time (${elapsedSec}s) is less than required (${gating.min_elapsed_sec}s)`,
        };
      }
    }

    // min_total_clicks のチェック
    if (
      gating.min_total_clicks !== undefined &&
      context.totalClicks < gating.min_total_clicks
    ) {
      return {
        passed: false,
        reason: `Total clicks (${context.totalClicks}) is less than required (${gating.min_total_clicks})`,
      };
    }

    // min_total_spend のチェック
    if (
      gating.min_total_spend !== undefined &&
      context.totalSpend < gating.min_total_spend
    ) {
      return {
        passed: false,
        reason: `Total spend (${context.totalSpend}) is less than required (${gating.min_total_spend})`,
      };
    }

    // min_total_impressions のチェック
    if (
      gating.min_total_impressions !== undefined &&
      context.totalImpressions < gating.min_total_impressions
    ) {
      return {
        passed: false,
        reason: `Total impressions (${context.totalImpressions}) is less than required (${gating.min_total_impressions})`,
      };
    }

    // required_status のチェック
    if (
      gating.required_status !== undefined &&
      gating.required_status.length > 0 &&
      !gating.required_status.includes(context.runStatus)
    ) {
      return {
        passed: false,
        reason: `Run status (${context.runStatus}) is not in required statuses (${gating.required_status.join(', ')})`,
      };
    }

    return { passed: true };
  }

  /**
   * 経過時間を秒で計算
   */
  private calculateElapsedSeconds(startTime: string, currentTime: string): number {
    const start = new Date(startTime).getTime();
    const current = new Date(currentTime).getTime();
    return Math.floor((current - start) / 1000);
  }

  /**
   * 総額上限ルールの評価
   */
  private evaluateSpendTotalCap(
    rule: SpendTotalCapRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    const triggered = context.totalSpend >= rule.threshold;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `Total spend (${context.totalSpend}) exceeded threshold (${rule.threshold})`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        currentSpend: context.totalSpend,
        threshold: rule.threshold,
        currency: rule.currency,
      },
    };
  }

  /**
   * 日額上限ルールの評価
   */
  private evaluateSpendDailyCap(
    rule: SpendDailyCapRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    const triggered = context.dailySpend >= rule.threshold;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `Daily spend (${context.dailySpend}) exceeded threshold (${rule.threshold})`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        currentDailySpend: context.dailySpend,
        threshold: rule.threshold,
        currency: rule.currency,
      },
    };
  }

  /**
   * CPA上限ルールの評価
   */
  private evaluateCpaCap(
    rule: CpaCapRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    // CVが0の場合はCPA計算不可
    if (context.totalConversions === 0) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        triggered: false,
        skipped: true,
        skipReason: 'No conversions yet, CPA cannot be calculated',
      };
    }

    const currentCpa = context.totalSpend / context.totalConversions;
    const triggered = currentCpa >= rule.threshold;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `CPA (${currentCpa.toFixed(2)}) exceeded threshold (${rule.threshold})`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        currentCpa,
        threshold: rule.threshold,
        totalSpend: context.totalSpend,
        totalConversions: context.totalConversions,
        currency: rule.currency,
      },
    };
  }

  /**
   * CVゼロ継続ルールの評価
   */
  private evaluateCvZeroDuration(
    rule: CvZeroDurationRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    // 最小消費額の確認
    if (rule.min_spend !== undefined && context.totalSpend < rule.min_spend) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        triggered: false,
        skipped: true,
        skipReason: `Total spend (${context.totalSpend}) is less than min_spend (${rule.min_spend})`,
      };
    }

    // 最後のCV時刻がない場合は開始時刻を使用
    const lastCvTime = context.lastConversionAt || context.runStartedAt;
    const durationWithoutCv = this.calculateElapsedSeconds(
      lastCvTime,
      context.currentTime
    );

    const triggered = durationWithoutCv >= rule.duration_sec;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `No conversion for ${durationWithoutCv} seconds (threshold: ${rule.duration_sec}s)`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        durationWithoutCv,
        threshold: rule.duration_sec,
        lastConversionAt: context.lastConversionAt,
      },
    };
  }

  /**
   * 計測欠落ルールの評価
   */
  private evaluateMeasurementAnomaly(
    rule: MeasurementAnomalyRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    // 最後のイベント時刻がない場合は評価不可
    if (!context.lastEventAt) {
      return {
        ruleId: rule.id,
        ruleType: rule.type,
        triggered: false,
        skipped: true,
        skipReason: 'No events recorded yet',
      };
    }

    const gapSec = this.calculateElapsedSeconds(
      context.lastEventAt,
      context.currentTime
    );

    const triggered = gapSec >= rule.max_gap_sec;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `No events received for ${gapSec} seconds (threshold: ${rule.max_gap_sec}s)`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        eventGapSec: gapSec,
        threshold: rule.max_gap_sec,
        lastEventAt: context.lastEventAt,
      },
    };
  }

  /**
   * Meta Rejected検知ルールの評価
   */
  private evaluateMetaRejected(
    rule: MetaRejectedRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    const maxCount = rule.max_rejected_count ?? 0;
    const triggered = context.rejectedAdCount > maxCount;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `Rejected ad count (${context.rejectedAdCount}) exceeded threshold (${maxCount})`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        rejectedCount: context.rejectedAdCount,
        threshold: maxCount,
        entityTypes: rule.entity_types,
      },
    };
  }

  /**
   * 同期失敗連続ルールの評価
   */
  private evaluateSyncFailureStreak(
    rule: SyncFailureStreakRule,
    context: EvaluationContext
  ): RuleEvaluationResult {
    const triggered = context.syncFailureStreak >= rule.threshold;

    return {
      ruleId: rule.id,
      ruleType: rule.type,
      triggered,
      skipped: false,
      triggerReason: triggered
        ? `Sync failure streak (${context.syncFailureStreak}) reached threshold (${rule.threshold})`
        : undefined,
      action: triggered ? rule.action : undefined,
      severity: triggered ? rule.severity : undefined,
      metadata: {
        currentStreak: context.syncFailureStreak,
        threshold: rule.threshold,
        jobTypes: rule.job_types,
      },
    };
  }

  /**
   * アクションの重複除去と優先度順ソート
   */
  private deduplicateAndPrioritizeActions(
    actions: ActionToExecute[]
  ): ActionToExecute[] {
    // 重要度の優先順位
    const severityPriority: Record<string, number> = {
      critical: 4,
      high: 3,
      medium: 2,
      low: 1,
    };

    // アクションタイプの優先順位（破壊的なアクションが優先）
    const actionPriority: Record<string, number> = {
      pause_run: 4,
      pause_bundle: 3,
      create_incident: 2,
      notify_only: 1,
    };

    // ソート（重要度とアクションタイプで優先）
    const sorted = [...actions].sort((a, b) => {
      const severityDiff =
        (severityPriority[b.severity] || 0) - (severityPriority[a.severity] || 0);
      if (severityDiff !== 0) return severityDiff;

      return (actionPriority[b.type] || 0) - (actionPriority[a.type] || 0);
    });

    // pause_runがある場合、pause_bundleは冗長なので除外
    const hasPauseRun = sorted.some((a) => a.type === 'pause_run');
    if (hasPauseRun) {
      return sorted.filter((a) => a.type !== 'pause_bundle');
    }

    return sorted;
  }

  /**
   * DSLを更新
   * @param newDsl 新しいDSL
   */
  updateDsl(newDsl: StopRulesDsl): void {
    this.dsl = newDsl;
  }

  /**
   * 現在のDSLを取得
   * @returns 現在のDSL
   */
  getDsl(): StopRulesDsl {
    return { ...this.dsl, rules: [...this.dsl.rules] };
  }
}

/**
 * RuleEvaluatorのファクトリ関数
 * @param dsl DSL
 * @returns RuleEvaluatorインスタンス
 */
export function createRuleEvaluator(dsl: StopRulesDsl): RuleEvaluator {
  return new RuleEvaluator(dsl);
}
