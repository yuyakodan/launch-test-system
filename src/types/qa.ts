/**
 * QA関連の型定義
 * NG表現チェック、免責事項検証、主張エビデンス検証に使用
 */

/**
 * ブロックパターンの定義
 * 正規表現とその理由、重要度を含む
 */
export interface BlockedPattern {
  /** 正規表現パターン文字列 */
  pattern: string;
  /** 正規表現フラグ（例: "gi"） */
  flags?: string;
  /** ブロック理由 */
  reason: string;
  /** 重要度 */
  severity: 'blocker' | 'warning';
}

/**
 * 主張にエビデンスが必要なルール
 */
export interface ClaimRequiresEvidence {
  /** 主張を検出する正規表現パターン */
  pattern: string;
  /** 許可されるエビデンスの種類 */
  evidence_types: string[];
  /** 重要度 */
  severity: 'blocker' | 'warning';
}

/**
 * テキスト正規化オプション
 */
export interface NormalizationOptions {
  /** 空白を無視するか */
  ignore_whitespace: boolean;
  /** 句読点を無視するか */
  ignore_punctuation: boolean;
  /** 大文字小文字を区別しないか */
  case_insensitive: boolean;
}

/**
 * NG表現ルール定義
 * JSONスキーマに準拠した構造
 */
export interface NgRules {
  /** ルールバージョン */
  version: string;
  /** 禁止用語リスト */
  blocked_terms: string[];
  /** 禁止パターンリスト（正規表現） */
  blocked_patterns: BlockedPattern[];
  /** 許可リスト（ブロック対象から除外） */
  allowlist_terms: string[];
  /** 必須免責事項リスト */
  required_disclaimer: string[];
  /** 主張に対するエビデンス要求ルール */
  claim_requires_evidence: ClaimRequiresEvidence[];
  /** テキスト正規化オプション */
  normalization: NormalizationOptions;
}

/**
 * QA検出問題の詳細
 */
export interface QaIssue {
  /** 問題の種類 */
  type:
    | 'blocked_term'
    | 'blocked_pattern'
    | 'missing_disclaimer'
    | 'claim_without_evidence';
  /** 重要度 */
  severity: 'blocker' | 'warning';
  /** 問題の説明 */
  message: string;
  /** 検出された位置（該当する場合） */
  position?: {
    start: number;
    end: number;
  };
  /** 問題のあるテキスト（該当する場合） */
  matchedText?: string;
  /** 追加情報 */
  details?: Record<string, unknown>;
}

/**
 * QAチェック結果
 */
export interface QaCheckResult {
  /** チェック成功フラグ（blockerがない場合true） */
  passed: boolean;
  /** ブロッカー（リリース不可の問題）リスト */
  blockers: QaIssue[];
  /** 警告（修正推奨だがリリース可能）リスト */
  warnings: QaIssue[];
  /** チェック対象テキスト */
  checkedText: string;
  /** 使用したルールバージョン */
  rulesVersion: string;
  /** チェック実行タイムスタンプ */
  timestamp: string;
}

/**
 * スキーマ検証結果
 */
export interface SchemaValidationResult {
  /** 検証成功フラグ */
  valid: boolean;
  /** エラーメッセージ（失敗時） */
  errors?: string[];
}

/**
 * QAチェックリクエスト
 */
export interface QaCheckRequest {
  /** チェック対象テキスト */
  text: string;
  /** プロジェクトID（NGルール取得用） */
  projectId?: string;
  /** カスタムNGルール（直接指定） */
  ngRules?: NgRules;
  /** エビデンス情報（主張チェック用） */
  evidence?: EvidenceInfo[];
}

/**
 * エビデンス情報
 */
export interface EvidenceInfo {
  /** エビデンスの種類 */
  type: 'number' | 'case_study' | 'testimonial' | 'third_party' | 'internal_policy' | 'other';
  /** エビデンスの説明またはリンク */
  content: string;
  /** 対象の主張パターン（正規表現） */
  claimPattern?: string;
}

/**
 * スモークテストジョブ投入リクエスト
 */
export interface SmokeTestRequest {
  /** Run ID */
  runId: string;
  /** LP Variant ID（省略時は全バリアント） */
  lpVariantId?: string;
  /** テスト設定 */
  config?: SmokeTestConfig;
}

/**
 * スモークテスト設定
 */
export interface SmokeTestConfig {
  /** タイムアウト（ミリ秒） */
  timeoutMs?: number;
  /** CTAセレクタ */
  ctaSelector?: string;
  /** フォームセレクタ */
  formSelector?: string;
  /** 追加チェック項目 */
  additionalChecks?: string[];
}

/**
 * スモークテストジョブステータス
 */
export type SmokeTestJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * スモークテストジョブ
 */
export interface SmokeTestJob {
  /** ジョブID */
  id: string;
  /** テナントID */
  tenantId: string;
  /** Run ID */
  runId: string;
  /** LP Variant ID */
  lpVariantId?: string;
  /** ステータス */
  status: SmokeTestJobStatus;
  /** テスト設定 */
  config: SmokeTestConfig;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
  /** 結果 */
  result?: SmokeTestResult;
}

/**
 * スモークテスト結果
 */
export interface SmokeTestResult {
  /** テスト成功フラグ */
  passed: boolean;
  /** テスト項目結果 */
  checks: SmokeTestCheck[];
  /** エラー（失敗時） */
  error?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
  /** スクリーンショットURL（R2キー） */
  screenshotR2Key?: string;
  /** 完了日時 */
  completedAt: string;
}

/**
 * スモークテスト個別チェック結果
 */
export interface SmokeTestCheck {
  /** チェック名 */
  name: string;
  /** チェック成功フラグ */
  passed: boolean;
  /** メッセージ */
  message: string;
  /** 詳細情報 */
  details?: Record<string, unknown>;
}

/**
 * コンテンツチェック対象
 */
export interface ContentToCheck {
  /** コンテンツ種別 */
  type: 'lp_variant' | 'creative_variant' | 'ad_copy';
  /** コンテンツID */
  id: string;
  /** チェック対象テキスト */
  texts: {
    /** フィールド名 */
    field: string;
    /** テキスト内容 */
    value: string;
  }[];
}

/**
 * 一括QAチェック結果
 */
export interface BulkQaCheckResult {
  /** 全体の成功フラグ */
  passed: boolean;
  /** コンテンツごとの結果 */
  results: {
    /** コンテンツ種別 */
    type: string;
    /** コンテンツID */
    id: string;
    /** チェック結果 */
    result: QaCheckResult;
  }[];
  /** 全体のブロッカー数 */
  totalBlockers: number;
  /** 全体の警告数 */
  totalWarnings: number;
}
