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
