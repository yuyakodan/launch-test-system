/**
 * アクション実行器
 * トリガーされたルールに対応するアクションを実行
 */

import type {
  ActionToExecute,
  ActionExecutionResult,
  AffectedEntity,
  SeverityLevel,
  IncidentType,
  IncidentSeverity,
} from '../../types/stop-rules.js';

/**
 * アクション実行器の依存関係インターフェース
 * 実際のデータベース操作や外部APIコールを抽象化
 */
export interface ActionExecutorDependencies {
  /**
   * Runを一時停止する
   * @param runId Run ID
   * @returns 成功したか
   */
  pauseRun: (runId: string) => Promise<boolean>;

  /**
   * AdBundleを一時停止する
   * @param bundleIds Bundle ID配列
   * @returns 成功したBundle ID配列
   */
  pauseBundles: (bundleIds: string[]) => Promise<string[]>;

  /**
   * 通知を送信する
   * @param notification 通知内容
   * @returns 成功したか
   */
  sendNotification: (notification: NotificationPayload) => Promise<boolean>;

  /**
   * インシデントを作成する
   * @param incident インシデント内容
   * @returns 作成されたインシデントID
   */
  createIncident: (incident: IncidentPayload) => Promise<string | null>;

  /**
   * 監査ログを記録する
   * @param log 監査ログ
   */
  logAudit: (log: AuditLogPayload) => Promise<void>;
}

/**
 * 通知ペイロード
 */
export interface NotificationPayload {
  channel: 'email' | 'slack' | 'webhook';
  severity: SeverityLevel;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * インシデントペイロード
 */
export interface IncidentPayload {
  tenantId: string;
  runId: string;
  type: IncidentType;
  severity: IncidentSeverity;
  reason: string;
  metadata?: Record<string, unknown>;
}

/**
 * 監査ログペイロード
 */
export interface AuditLogPayload {
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
}

/**
 * アクション実行器のコンテキスト
 */
export interface ActionExecutorContext {
  tenantId: string;
  runId: string;
  evaluatedAt: string;
}

/**
 * アクション実行器クラス
 */
export class ActionExecutor {
  private deps: ActionExecutorDependencies;

  constructor(deps: ActionExecutorDependencies) {
    this.deps = deps;
  }

  /**
   * アクションリストを実行
   * @param actions 実行するアクションリスト
   * @param context 実行コンテキスト
   * @returns 実行結果リスト
   */
  async executeAll(
    actions: ActionToExecute[],
    context: ActionExecutorContext
  ): Promise<ActionExecutionResult[]> {
    const results: ActionExecutionResult[] = [];

    for (const action of actions) {
      const result = await this.executeAction(action, context);
      results.push(result);

      // 監査ログを記録
      await this.logActionExecution(action, result, context);
    }

    return results;
  }

  /**
   * 単一アクションを実行
   * @param action 実行するアクション
   * @param context 実行コンテキスト
   * @returns 実行結果
   */
  private async executeAction(
    action: ActionToExecute,
    context: ActionExecutorContext
  ): Promise<ActionExecutionResult> {
    const executedAt = new Date().toISOString();

    try {
      switch (action.type) {
        case 'pause_run':
          return await this.executePauseRun(action, context, executedAt);
        case 'pause_bundle':
          return await this.executePauseBundle(action, context, executedAt);
        case 'notify_only':
          return await this.executeNotifyOnly(action, context, executedAt);
        case 'create_incident':
          return await this.executeCreateIncident(action, context, executedAt);
        default:
          return {
            actionType: action.type,
            success: false,
            executedAt,
            errorMessage: `Unknown action type: ${action.type}`,
          };
      }
    } catch (error) {
      return {
        actionType: action.type,
        success: false,
        executedAt,
        errorMessage: (error as Error).message,
      };
    }
  }

  /**
   * pause_run アクションを実行
   */
  private async executePauseRun(
    action: ActionToExecute,
    context: ActionExecutorContext,
    executedAt: string
  ): Promise<ActionExecutionResult> {
    const success = await this.deps.pauseRun(context.runId);

    const affectedEntities: AffectedEntity[] = [
      {
        type: 'run',
        id: context.runId,
        previousState: 'Running',
        newState: success ? 'Paused' : 'Running',
      },
    ];

    // 通知も送信
    if (success) {
      await this.deps.sendNotification({
        channel: 'slack',
        severity: action.severity,
        title: 'Run Paused by Stop Rules',
        message: action.reason,
        metadata: {
          runId: context.runId,
          triggeredByRuleId: action.triggeredByRuleId,
        },
      });
    }

    return {
      actionType: 'pause_run',
      success,
      executedAt,
      affectedEntities,
      errorMessage: success ? undefined : 'Failed to pause run',
    };
  }

  /**
   * pause_bundle アクションを実行
   */
  private async executePauseBundle(
    action: ActionToExecute,
    context: ActionExecutorContext,
    executedAt: string
  ): Promise<ActionExecutionResult> {
    const bundleIds = action.targetBundleIds || [];

    if (bundleIds.length === 0) {
      return {
        actionType: 'pause_bundle',
        success: false,
        executedAt,
        errorMessage: 'No bundle IDs specified for pause_bundle action',
      };
    }

    const pausedIds = await this.deps.pauseBundles(bundleIds);
    const success = pausedIds.length > 0;

    const affectedEntities: AffectedEntity[] = pausedIds.map((id) => ({
      type: 'bundle' as const,
      id,
      previousState: 'running',
      newState: 'paused',
    }));

    // 通知も送信
    if (success) {
      await this.deps.sendNotification({
        channel: 'slack',
        severity: action.severity,
        title: 'Bundles Paused by Stop Rules',
        message: `${pausedIds.length} bundle(s) paused. ${action.reason}`,
        metadata: {
          runId: context.runId,
          pausedBundleIds: pausedIds,
          triggeredByRuleId: action.triggeredByRuleId,
        },
      });
    }

    return {
      actionType: 'pause_bundle',
      success,
      executedAt,
      affectedEntities,
      errorMessage: success
        ? undefined
        : 'Failed to pause some or all bundles',
    };
  }

  /**
   * notify_only アクションを実行
   */
  private async executeNotifyOnly(
    action: ActionToExecute,
    context: ActionExecutorContext,
    executedAt: string
  ): Promise<ActionExecutionResult> {
    const success = await this.deps.sendNotification({
      channel: 'slack',
      severity: action.severity,
      title: 'Stop Rule Alert',
      message: action.reason,
      metadata: {
        runId: context.runId,
        triggeredByRuleId: action.triggeredByRuleId,
        ...action.metadata,
      },
    });

    const affectedEntities: AffectedEntity[] = success
      ? [
          {
            type: 'notification',
            id: `notification_${Date.now()}`,
          },
        ]
      : [];

    return {
      actionType: 'notify_only',
      success,
      executedAt,
      affectedEntities,
      errorMessage: success ? undefined : 'Failed to send notification',
    };
  }

  /**
   * create_incident アクションを実行
   */
  private async executeCreateIncident(
    action: ActionToExecute,
    context: ActionExecutorContext,
    executedAt: string
  ): Promise<ActionExecutionResult> {
    const incidentId = await this.deps.createIncident({
      tenantId: context.tenantId,
      runId: context.runId,
      type: this.mapSeverityToIncidentType(action),
      severity: this.mapSeverityLevel(action.severity),
      reason: action.reason,
      metadata: {
        triggeredByRuleId: action.triggeredByRuleId,
        evaluatedAt: context.evaluatedAt,
        ...action.metadata,
      },
    });

    const success = incidentId !== null;

    const affectedEntities: AffectedEntity[] = success && incidentId
      ? [
          {
            type: 'incident',
            id: incidentId,
            newState: 'open',
          },
        ]
      : [];

    // インシデント作成時は通知も送信
    if (success) {
      await this.deps.sendNotification({
        channel: 'slack',
        severity: action.severity,
        title: 'Incident Created by Stop Rules',
        message: `Incident ${incidentId} created. ${action.reason}`,
        metadata: {
          runId: context.runId,
          incidentId,
          triggeredByRuleId: action.triggeredByRuleId,
        },
      });
    }

    return {
      actionType: 'create_incident',
      success,
      executedAt,
      affectedEntities,
      errorMessage: success ? undefined : 'Failed to create incident',
    };
  }

  /**
   * アクション実行の監査ログを記録
   */
  private async logActionExecution(
    action: ActionToExecute,
    result: ActionExecutionResult,
    context: ActionExecutorContext
  ): Promise<void> {
    await this.deps.logAudit({
      action: `stop_rule_action_${action.type}`,
      targetType: action.type === 'pause_run' ? 'run' : 'bundle',
      targetId:
        action.type === 'pause_run'
          ? context.runId
          : (action.targetBundleIds?.join(',') || context.runId),
      details: {
        triggeredByRuleId: action.triggeredByRuleId,
        severity: action.severity,
        reason: action.reason,
        success: result.success,
        executedAt: result.executedAt,
        affectedEntities: result.affectedEntities,
        errorMessage: result.errorMessage,
      },
    });
  }

  /**
   * アクションからインシデントタイプをマッピング
   */
  private mapSeverityToIncidentType(action: ActionToExecute): IncidentType {
    // メタデータからインシデントタイプを推測
    const metadata = action.metadata || {};

    if (metadata['rejectedCount']) {
      return 'meta_rejected';
    }
    if (metadata['eventGapSec']) {
      return 'measurement_issue';
    }
    if (metadata['currentStreak']) {
      return 'api_outage';
    }

    return 'other';
  }

  /**
   * 重要度レベルをインシデント重要度にマッピング
   */
  private mapSeverityLevel(severity: SeverityLevel): IncidentSeverity {
    const mapping: Record<SeverityLevel, IncidentSeverity> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
      critical: 'critical',
    };
    return mapping[severity];
  }
}

/**
 * ActionExecutorのファクトリ関数
 * @param deps 依存関係
 * @returns ActionExecutorインスタンス
 */
export function createActionExecutor(
  deps: ActionExecutorDependencies
): ActionExecutor {
  return new ActionExecutor(deps);
}

/**
 * テスト用のモック依存関係を作成
 * @returns モック依存関係
 */
export function createMockDependencies(): ActionExecutorDependencies {
  return {
    pauseRun: async () => true,
    pauseBundles: async (ids) => ids,
    sendNotification: async () => true,
    createIncident: async () => `incident_${Date.now()}`,
    logAudit: async () => {},
  };
}
