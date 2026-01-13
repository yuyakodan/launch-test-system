/**
 * NG表現チェッカー
 * テキストに対してNG表現、免責事項、主張エビデンスをチェック
 */

import type { NgRules, QaCheckResult, QaIssue } from '../../types/qa.js';

/**
 * NG表現チェッカークラス
 */
export class NgChecker {
  private rules: NgRules;

  constructor(rules: NgRules) {
    this.rules = rules;
  }

  /**
   * テキストをチェックし、結果を返す
   * @param text チェック対象のテキスト
   * @returns チェック結果
   */
  check(text: string): QaCheckResult {
    const issues: QaIssue[] = [];

    // 1. blocked_terms チェック
    issues.push(...this.checkBlockedTerms(text));

    // 2. blocked_patterns チェック
    issues.push(...this.checkBlockedPatterns(text));

    // 3. required_disclaimer チェック
    issues.push(...this.checkRequiredDisclaimer(text));

    // 4. claim_requires_evidence チェック
    issues.push(...this.checkClaimRequiresEvidence(text));

    // blocker と warning に分類
    const blockers = issues.filter((issue) => issue.severity === 'blocker');
    const warnings = issues.filter((issue) => issue.severity === 'warning');

    return {
      passed: blockers.length === 0,
      blockers,
      warnings,
      checkedText: text,
      rulesVersion: this.rules.version,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * テキストを正規化
   * @param text 正規化対象のテキスト
   * @returns 正規化されたテキスト
   */
  private normalizeText(text: string): string {
    const opts = this.rules.normalization;
    let normalized = text;

    if (opts.case_insensitive) {
      normalized = normalized.toLowerCase();
    }

    if (opts.ignore_whitespace) {
      normalized = normalized.replace(/\s+/g, ' ').trim();
    }

    if (opts.ignore_punctuation) {
      // 日本語・英語の句読点を削除
      normalized = normalized.replace(
        /[、。，．！？!?.,;:'"()（）「」『』【】[\]]/g,
        ''
      );
    }

    return normalized;
  }

  /**
   * allowlist_terms に含まれるかチェック
   * @param text チェック対象のテキスト
   * @param term 検出された用語
   * @returns 許可リストに含まれる場合true
   */
  private isInAllowlist(text: string, term: string): boolean {
    const normalizedTerm = this.normalizeForComparison(term);
    const normalizedText = this.normalizeForComparison(text);

    // allowlist_terms の各項目をチェック
    for (const allowedTerm of this.rules.allowlist_terms) {
      const normalizedAllowed = this.normalizeForComparison(allowedTerm);

      // 許可用語がテキスト内に存在し、検出された用語を含む場合は除外
      if (
        normalizedText.includes(normalizedAllowed) &&
        normalizedAllowed.includes(normalizedTerm)
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * 比較用の正規化（大文字小文字のみ）
   */
  private normalizeForComparison(text: string): string {
    return this.rules.normalization.case_insensitive
      ? text.toLowerCase()
      : text;
  }

  /**
   * blocked_terms のチェック
   * @param text チェック対象のテキスト
   * @returns 検出された問題リスト
   */
  private checkBlockedTerms(text: string): QaIssue[] {
    const issues: QaIssue[] = [];
    const normalizedText = this.normalizeText(text);

    for (const term of this.rules.blocked_terms) {
      const normalizedTerm = this.rules.normalization.case_insensitive
        ? term.toLowerCase()
        : term;

      // 用語の検出
      let index = normalizedText.indexOf(normalizedTerm);
      while (index !== -1) {
        // allowlist による除外チェック
        if (!this.isInAllowlist(text, term)) {
          issues.push({
            type: 'blocked_term',
            severity: 'blocker',
            message: `禁止用語「${term}」が検出されました`,
            position: {
              start: index,
              end: index + normalizedTerm.length,
            },
            matchedText: term,
          });
        }
        index = normalizedText.indexOf(normalizedTerm, index + 1);
      }
    }

    return issues;
  }

  /**
   * blocked_patterns のチェック
   * @param text チェック対象のテキスト
   * @returns 検出された問題リスト
   */
  private checkBlockedPatterns(text: string): QaIssue[] {
    const issues: QaIssue[] = [];

    for (const patternDef of this.rules.blocked_patterns) {
      try {
        const flags = patternDef.flags ?? '';
        const regex = new RegExp(patternDef.pattern, flags);

        let match: RegExpExecArray | null;
        const checkText = this.normalizeText(text);

        // グローバルフラグがある場合は全マッチを検出
        if (flags.includes('g')) {
          while ((match = regex.exec(checkText)) !== null) {
            if (!this.isInAllowlist(text, match[0])) {
              issues.push({
                type: 'blocked_pattern',
                severity: patternDef.severity,
                message: `禁止パターン検出: ${patternDef.reason}`,
                position: {
                  start: match.index,
                  end: match.index + match[0].length,
                },
                matchedText: match[0],
                details: {
                  pattern: patternDef.pattern,
                  reason: patternDef.reason,
                },
              });
            }
          }
        } else {
          // グローバルフラグがない場合は最初のマッチのみ
          match = regex.exec(checkText);
          if (match && !this.isInAllowlist(text, match[0])) {
            issues.push({
              type: 'blocked_pattern',
              severity: patternDef.severity,
              message: `禁止パターン検出: ${patternDef.reason}`,
              position: {
                start: match.index,
                end: match.index + match[0].length,
              },
              matchedText: match[0],
              details: {
                pattern: patternDef.pattern,
                reason: patternDef.reason,
              },
            });
          }
        }
      } catch (error) {
        // 無効な正規表現の場合は警告として報告
        issues.push({
          type: 'blocked_pattern',
          severity: 'warning',
          message: `無効な正規表現パターン: ${patternDef.pattern}`,
          details: {
            error: (error as Error).message,
          },
        });
      }
    }

    return issues;
  }

  /**
   * required_disclaimer のチェック
   * @param text チェック対象のテキスト
   * @returns 検出された問題リスト
   */
  private checkRequiredDisclaimer(text: string): QaIssue[] {
    const issues: QaIssue[] = [];
    const normalizedText = this.normalizeText(text);

    for (const disclaimer of this.rules.required_disclaimer) {
      const normalizedDisclaimer = this.rules.normalization.case_insensitive
        ? disclaimer.toLowerCase()
        : disclaimer;

      // 免責事項が存在するかチェック
      if (!normalizedText.includes(normalizedDisclaimer)) {
        issues.push({
          type: 'missing_disclaimer',
          severity: 'blocker',
          message: `必須免責事項が見つかりません: 「${disclaimer}」`,
          details: {
            requiredDisclaimer: disclaimer,
          },
        });
      }
    }

    return issues;
  }

  /**
   * claim_requires_evidence のチェック
   * @param text チェック対象のテキスト
   * @returns 検出された問題リスト
   */
  private checkClaimRequiresEvidence(text: string): QaIssue[] {
    const issues: QaIssue[] = [];
    const normalizedText = this.normalizeText(text);

    for (const claimRule of this.rules.claim_requires_evidence) {
      try {
        const regex = new RegExp(claimRule.pattern, 'gi');
        let match: RegExpExecArray | null;

        while ((match = regex.exec(normalizedText)) !== null) {
          // エビデンスが含まれているかチェック
          const hasEvidence = this.checkEvidencePresent(
            text,
            claimRule.evidence_types,
            match.index
          );

          if (!hasEvidence) {
            issues.push({
              type: 'claim_without_evidence',
              severity: claimRule.severity,
              message: `主張「${match[0]}」にエビデンスが必要です`,
              position: {
                start: match.index,
                end: match.index + match[0].length,
              },
              matchedText: match[0],
              details: {
                requiredEvidenceTypes: claimRule.evidence_types,
              },
            });
          }
        }
      } catch (error) {
        issues.push({
          type: 'claim_without_evidence',
          severity: 'warning',
          message: `無効な主張検出パターン: ${claimRule.pattern}`,
          details: {
            error: (error as Error).message,
          },
        });
      }
    }

    return issues;
  }

  /**
   * エビデンスが存在するかチェック
   * @param text テキスト全体
   * @param evidenceTypes 必要なエビデンスタイプ
   * @param claimPosition 主張の位置
   * @returns エビデンスが存在する場合true
   */
  private checkEvidencePresent(
    text: string,
    evidenceTypes: string[],
    claimPosition: number
  ): boolean {
    // 主張の前後500文字を検索範囲とする
    const searchRange = 500;
    const startPos = Math.max(0, claimPosition - searchRange);
    const endPos = Math.min(text.length, claimPosition + searchRange);
    const searchText = text.substring(startPos, endPos).toLowerCase();

    // 各エビデンスタイプを検索
    for (const evidenceType of evidenceTypes) {
      // エビデンスタイプに対応するパターン
      const evidencePatterns: Record<string, RegExp[]> = {
        research: [
          /研究/,
          /調査/,
          /リサーチ/,
          /research/i,
          /study/i,
          /analysis/i,
        ],
        clinical_trial: [
          /臨床試験/,
          /治験/,
          /clinical trial/i,
          /clinical study/i,
        ],
        statistics: [/統計/,  /%/, /パーセント/, /percent/i, /statistics/i],
        citation: [/出典/, /引用/, /参照/, /参考文献/, /citation/i, /source/i],
        expert: [/専門家/, /博士/, /医師/, /教授/, /expert/i, /dr\./i, /ph\.d/i],
      };

      const patterns = evidencePatterns[evidenceType];
      if (patterns) {
        for (const pattern of patterns) {
          if (pattern.test(searchText)) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * ルールを更新
   * @param newRules 新しいルール
   */
  updateRules(newRules: NgRules): void {
    this.rules = newRules;
  }

  /**
   * 現在のルールを取得
   * @returns 現在のルール
   */
  getRules(): NgRules {
    return { ...this.rules };
  }
}

/**
 * デフォルトのNgRulesを作成
 * @returns デフォルトルール
 */
export function createDefaultNgRules(): NgRules {
  return {
    version: '1.0.0',
    blocked_terms: [],
    blocked_patterns: [],
    allowlist_terms: [],
    required_disclaimer: [],
    claim_requires_evidence: [],
    normalization: {
      ignore_whitespace: true,
      ignore_punctuation: false,
      case_insensitive: true,
    },
  };
}

/**
 * NgCheckerインスタンスを作成
 * @param rules ルール（省略時はデフォルト）
 * @returns NgCheckerインスタンス
 */
export function createNgChecker(rules?: NgRules): NgChecker {
  return new NgChecker(rules ?? createDefaultNgRules());
}
