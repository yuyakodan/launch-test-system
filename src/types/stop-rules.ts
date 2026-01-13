/**
 * 停止条件DSL型定義
 * Run停止判定に使用するルールの型定義
 */

// ================================
// Rule Types (ルールタイプ)
// ================================

/**
 * サポートされるルールタイプ
 */
export type RuleType =
  | 'spend_total_cap'      // 総額上限
  | 'spend_daily_cap'      // 日額上限
  | 'cpa_cap'              // CPA上限
  | 'cv_zero_duration'     // CVゼロ継続
  | 'measurement_anomaly'  // 計測欠落
  | 'meta_rejected'        // Meta Rejected検知
  | 'sync_failure_streak'; // 同期失敗連続

/**
 * サポートされるアクションタイプ
 */
export type ActionType =
  | 'pause_run'       // Run全体を停止
  | 'pause_bundle'    // 特定のAdBundleを停止
  | 'notify_only'     // 通知のみ（停止しない）
  | 'create_incident'; // インシデント作成

/**
 * 重要度レベル
 */
export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * インシデントタイプ（action-executor用）
 */
export type IncidentType =
  | 'meta_rejected'
  | 'meta_account_issue'
  | 'api_outage'
  | 'measurement_issue'
  | 'other';

/**
 * インシデント重要度（action-executor用）
 */
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

// ================================
// Gating Conditions (ゲーティング条件)
// ================================

/**
 * ルール評価前の前提条件
 * これらの条件を満たさない場合、ルールはスキップされる
 */
export interface GatingConditions {
  /** 最小経過時間（秒） */
  min_elapsed_sec?: number;
  /** 最小総クリック数 */
  min_total_clicks?: number;
  /** 最小総消費額 */
  min_total_spend?: number;
  /** 最小インプレッション数 */
  min_total_impressions?: number;
  /** 評価対象のステータス（RunまたはBundle） */
  required_status?: string[];
}

// ================================
// Rule Definitions (ルール定義)
// ================================

/**
 * 基本ルール構造
 */
export interface BaseRule {
  /** ルールID（一意識別子） */
  id: string;
  /** ルールタイプ */
  type: RuleType;
  /** ルールが有効かどうか */
  enabled: boolean;
  /** ルールの説明 */
  description?: string;
  /** ゲーティング条件 */
  gating?: GatingConditions;
  /** トリガー時のアクション */
  action: ActionType;
  /** 重要度 */
  severity: SeverityLevel;
}

/**
 * 総額上限ルール
 */
export interface SpendTotalCapRule extends BaseRule {
  type: 'spend_total_cap';
  /** 上限金額 */
  threshold: number;
  /** 通貨コード */
  currency?: string;
}

/**
 * 日額上限ルール
 */
export interface SpendDailyCapRule extends BaseRule {
  type: 'spend_daily_cap';
  /** 上限金額 */
  threshold: number;
  /** 通貨コード */
  currency?: string;
}

/**
 * CPA上限ルール
 */
export interface CpaCapRule extends BaseRule {
  type: 'cpa_cap';
  /** 上限CPA */
  threshold: number;
  /** 通貨コード */
  currency?: string;
  /** CV計算対象イベントタイプ */
  cv_event_types?: string[];
}

/**
 * CVゼロ継続ルール
 */
export interface CvZeroDurationRule extends BaseRule {
  type: 'cv_zero_duration';
  /** CVゼロ継続時間（秒） */
  duration_sec: number;
  /** 最小消費額（この額を超えた場合のみ評価） */
  min_spend?: number;
}

/**
 * 計測欠落ルール
 */
export interface MeasurementAnomalyRule extends BaseRule {
  type: 'measurement_anomaly';
  /** 欠落許容期間（秒） */
  max_gap_sec: number;
  /** 欠落検知対象のイベントタイプ */
  event_types?: string[];
}

/**
 * Meta Rejected検知ルール
 */
export interface MetaRejectedRule extends BaseRule {
  type: 'meta_rejected';
  /** Rejected検知対象のエンティティタイプ */
  entity_types?: ('campaign' | 'adset' | 'ad' | 'creative')[];
  /** 許容するRejected数（これを超えたらトリガー） */
  max_rejected_count?: number;
}

/**
 * 同期失敗連続ルール
 */
export interface SyncFailureStreakRule extends BaseRule {
  type: 'sync_failure_streak';
  /** 連続失敗回数の閾値 */
  threshold: number;
  /** 対象のジョブタイプ */
  job_types?: string[];
}

/**
 * ルールのユニオン型
 */
export type StopRule =
  | SpendTotalCapRule
  | SpendDailyCapRule
  | CpaCapRule
  | CvZeroDurationRule
  | MeasurementAnomalyRule
  | MetaRejectedRule
  | SyncFailureStreakRule;

// ================================
// DSL Root Structure
// ================================

/**
 * 停止条件DSLルート構造
 */
export interface StopRulesDsl {
  /** DSLバージョン */
  version: string;
  /** 評価間隔（秒） */
  evaluation_interval_sec: number;
  /** エラー時のセーフモード（trueの場合、エラー時は停止） */
  safe_mode_on_error: boolean;
  /** ルール配列 */
  rules: StopRule[];
  /** グローバル設定 */
  global_settings?: GlobalSettings;
}

/**
 * グローバル設定
 */
export interface GlobalSettings {
  /** デフォルト通貨 */
  default_currency?: string;
  /** タイムゾーン */
  timezone?: string;
  /** 通知チャンネル */
  notification_channels?: NotificationChannel[];
}

/**
 * 通知チャンネル設定
 */
export interface NotificationChannel {
  /** チャンネルタイプ */
  type: 'email' | 'slack' | 'webhook';
  /** 通知対象の重要度 */
  min_severity: SeverityLevel;
  /** チャンネル固有の設定 */
  config?: Record<string, unknown>;
}

// ================================
// Evaluation Types (評価関連型)
// ================================

/**
 * 評価コンテキスト
 * ルール評価に必要なデータを保持
 */
export interface EvaluationContext {
  /** Run ID */
  runId: string;
  /** Run開始時刻 */
  runStartedAt: string;
  /** 現在時刻 */
  currentTime: string;
  /** 総消費額 */
  totalSpend: number;
  /** 本日の消費額 */
  dailySpend: number;
  /** 総CV数 */
  totalConversions: number;
  /** 総クリック数 */
  totalClicks: number;
  /** 総インプレッション数 */
  totalImpressions: number;
  /** 最後のCV時刻 */
  lastConversionAt?: string;
  /** 最後のイベント時刻 */
  lastEventAt?: string;
  /** 同期失敗連続回数 */
  syncFailureStreak: number;
  /** Rejected広告数 */
  rejectedAdCount: number;
  /** AdBundle別のメトリクス */
  bundleMetrics?: BundleMetrics[];
  /** Runステータス */
  runStatus: string;
}

/**
 * AdBundle単位のメトリクス
 */
export interface BundleMetrics {
  /** Bundle ID */
  bundleId: string;
  /** 消費額 */
  spend: number;
  /** CV数 */
  conversions: number;
  /** クリック数 */
  clicks: number;
  /** インプレッション数 */
  impressions: number;
  /** CPA */
  cpa?: number;
  /** ステータス */
  status: string;
}

/**
 * 単一ルールの評価結果
 */
export interface RuleEvaluationResult {
  /** ルールID */
  ruleId: string;
  /** ルールタイプ */
  ruleType: RuleType;
  /** トリガーされたか */
  triggered: boolean;
  /** スキップされたか（ゲーティング条件未達） */
  skipped: boolean;
  /** スキップ理由 */
  skipReason?: string;
  /** トリガー理由 */
  triggerReason?: string;
  /** 実行するアクション */
  action?: ActionType;
  /** 重要度 */
  severity?: SeverityLevel;
  /** 対象のBundle ID（pause_bundleの場合） */
  targetBundleIds?: string[];
  /** 追加データ */
  metadata?: Record<string, unknown>;
}

/**
 * DSL全体の評価結果
 */
export interface DslEvaluationResult {
  /** 評価時刻 */
  evaluatedAt: string;
  /** Run ID */
  runId: string;
  /** 評価されたルール数 */
  rulesEvaluated: number;
  /** トリガーされたルール数 */
  rulesTriggered: number;
  /** スキップされたルール数 */
  rulesSkipped: number;
  /** 各ルールの評価結果 */
  results: RuleEvaluationResult[];
  /** 実行するアクションリスト */
  actions: ActionToExecute[];
  /** エラーが発生したか */
  hasError: boolean;
  /** エラーメッセージ */
  errorMessage?: string;
}

/**
 * 実行するアクション
 */
export interface ActionToExecute {
  /** アクションタイプ */
  type: ActionType;
  /** トリガーしたルールID */
  triggeredByRuleId: string;
  /** 重要度 */
  severity: SeverityLevel;
  /** 理由 */
  reason: string;
  /** 対象Bundle ID（pause_bundleの場合） */
  targetBundleIds?: string[];
  /** 追加のメタデータ */
  metadata?: Record<string, unknown>;
}

// ================================
// Action Execution Types
// ================================

/**
 * アクション実行結果
 */
export interface ActionExecutionResult {
  /** アクションタイプ */
  actionType: ActionType;
  /** 成功したか */
  success: boolean;
  /** 実行時刻 */
  executedAt: string;
  /** エラーメッセージ（失敗時） */
  errorMessage?: string;
  /** 影響を受けたエンティティ */
  affectedEntities?: AffectedEntity[];
}

/**
 * 影響を受けたエンティティ
 */
export interface AffectedEntity {
  /** エンティティタイプ */
  type: 'run' | 'bundle' | 'incident' | 'notification';
  /** エンティティID */
  id: string;
  /** 以前の状態 */
  previousState?: string;
  /** 新しい状態 */
  newState?: string;
}

// ================================
// Validation Types
// ================================

/**
 * DSL検証結果
 */
export interface DslValidationResult {
  /** 有効かどうか */
  valid: boolean;
  /** エラーリスト */
  errors: DslValidationError[];
  /** 警告リスト */
  warnings: DslValidationWarning[];
}

/**
 * DSL検証エラー
 */
export interface DslValidationError {
  /** エラーコード */
  code: string;
  /** エラーメッセージ */
  message: string;
  /** エラー箇所のパス */
  path?: string;
  /** 関連するルールID */
  ruleId?: string;
}

/**
 * DSL検証警告
 */
export interface DslValidationWarning {
  /** 警告コード */
  code: string;
  /** 警告メッセージ */
  message: string;
  /** 警告箇所のパス */
  path?: string;
  /** 関連するルールID */
  ruleId?: string;
}

// ================================
// Constants
// ================================

/**
 * デフォルトのDSL設定
 */
export const DEFAULT_DSL_CONFIG = {
  version: '1.0',
  evaluation_interval_sec: 300,
  safe_mode_on_error: true,
} as const;

/**
 * サポートされるルールタイプ一覧
 */
export const SUPPORTED_RULE_TYPES: readonly RuleType[] = [
  'spend_total_cap',
  'spend_daily_cap',
  'cpa_cap',
  'cv_zero_duration',
  'measurement_anomaly',
  'meta_rejected',
  'sync_failure_streak',
] as const;

/**
 * サポートされるアクションタイプ一覧
 */
export const SUPPORTED_ACTION_TYPES: readonly ActionType[] = [
  'pause_run',
  'pause_bundle',
  'notify_only',
  'create_incident',
] as const;

/**
 * 重要度レベル一覧（優先度順）
 */
export const SEVERITY_LEVELS: readonly SeverityLevel[] = [
  'low',
  'medium',
  'high',
  'critical',
] as const;
