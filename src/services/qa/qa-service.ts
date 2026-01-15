/**
 * QAサービス
 * NG表現チェック、スモークテスト管理を提供
 */

import type {
  NgRules,
  QaCheckResult,
  QaCheckRequest,
  EvidenceInfo,
  SmokeTestJob,
  SmokeTestRequest,
  SmokeTestConfig,
  SmokeTestResult,
  ContentToCheck,
  BulkQaCheckResult,
} from '../../types/qa.js';
import { NgChecker, createDefaultNgRules } from './ng-checker.js';
import ulid from '../../lib/ulid.js';

/**
 * QAサービスオプション
 */
export interface QaServiceOptions {
  /** デフォルトのNGルール */
  defaultNgRules?: NgRules;
}

/**
 * QAサービスクラス
 * NG表現チェックとスモークテスト管理を統合
 */
export class QaService {
  private defaultNgRules: NgRules;

  constructor(options?: QaServiceOptions) {
    this.defaultNgRules = options?.defaultNgRules ?? createDefaultNgRules();
  }

  /**
   * テキストのNG表現チェックを実行
   * @param request チェックリクエスト
   * @returns チェック結果
   */
  check(request: QaCheckRequest): QaCheckResult {
    // NGルールを決定（リクエスト指定 > デフォルト）
    const rules = request.ngRules ?? this.defaultNgRules;
    const checker = new NgChecker(rules);

    // 基本チェック実行
    const result = checker.check(request.text);

    // エビデンス情報がある場合、主張チェック結果をフィルタリング
    if (request.evidence && request.evidence.length > 0) {
      this.filterClaimIssuesWithEvidence(result, request.evidence);
    }

    return result;
  }

  /**
   * エビデンス情報を使って主張問題をフィルタリング
   * @param result チェック結果
   * @param evidence エビデンス情報
   */
  private filterClaimIssuesWithEvidence(
    result: QaCheckResult,
    evidence: EvidenceInfo[]
  ): void {
    // エビデンスが提供されている主張パターンを収集
    const evidencePatterns = new Set(
      evidence
        .filter((e) => e.claimPattern)
        .map((e) => e.claimPattern!.toLowerCase())
    );

    // エビデンスがあればclaim_without_evidenceを除外
    if (evidence.length > 0 && evidencePatterns.size === 0) {
      // パターン指定がない場合は全てのclaim問題を除外
      result.blockers = result.blockers.filter(
        (issue) => issue.type !== 'claim_without_evidence'
      );
      result.warnings = result.warnings.filter(
        (issue) => issue.type !== 'claim_without_evidence'
      );
    } else {
      // パターン指定がある場合は該当するもののみ除外
      const filterClaim = (issue: typeof result.blockers[0]) => {
        if (issue.type !== 'claim_without_evidence') return true;
        const matchedText = issue.matchedText?.toLowerCase() ?? '';
        return !Array.from(evidencePatterns).some((pattern) => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(matchedText);
          } catch {
            return pattern === matchedText;
          }
        });
      };

      result.blockers = result.blockers.filter(filterClaim);
      result.warnings = result.warnings.filter(filterClaim);
    }

    // passedフラグを再計算
    result.passed = result.blockers.length === 0;
  }

  /**
   * 複数コンテンツの一括チェック
   * @param contents チェック対象コンテンツ
   * @param ngRules NGルール
   * @returns 一括チェック結果
   */
  bulkCheck(contents: ContentToCheck[], ngRules?: NgRules): BulkQaCheckResult {
    const results: BulkQaCheckResult['results'] = [];
    let totalBlockers = 0;
    let totalWarnings = 0;

    for (const content of contents) {
      // 全テキストを結合してチェック
      const combinedText = content.texts.map((t) => t.value).join('\n');
      const checkResult = this.check({
        text: combinedText,
        ngRules,
      });

      results.push({
        type: content.type,
        id: content.id,
        result: checkResult,
      });

      totalBlockers += checkResult.blockers.length;
      totalWarnings += checkResult.warnings.length;
    }

    return {
      passed: totalBlockers === 0,
      results,
      totalBlockers,
      totalWarnings,
    };
  }

  /**
   * スモークテストジョブを作成
   * @param tenantId テナントID
   * @param request スモークテストリクエスト
   * @returns 作成されたジョブ
   */
  createSmokeTestJob(tenantId: string, request: SmokeTestRequest): SmokeTestJob {
    const now = new Date().toISOString();
    const config: SmokeTestConfig = {
      timeoutMs: request.config?.timeoutMs ?? 30000,
      ctaSelector: request.config?.ctaSelector ?? '[data-cta], .cta, button[type="submit"]',
      formSelector: request.config?.formSelector ?? 'form',
      additionalChecks: request.config?.additionalChecks ?? [],
    };

    return {
      id: ulid(),
      tenantId,
      runId: request.runId,
      lpVariantId: request.lpVariantId,
      status: 'queued',
      config,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * スモークテスト結果を生成（Webhookから受け取った結果を整形）
   * @param checks 個別チェック結果
   * @param error エラー（あれば）
   * @param durationMs 実行時間
   * @param screenshotR2Key スクリーンショットキー
   * @returns スモークテスト結果
   */
  createSmokeTestResult(
    checks: SmokeTestResult['checks'],
    error?: string,
    durationMs?: number,
    screenshotR2Key?: string
  ): SmokeTestResult {
    const passed = !error && checks.every((c) => c.passed);

    return {
      passed,
      checks,
      error,
      durationMs,
      screenshotR2Key,
      completedAt: new Date().toISOString(),
    };
  }

  /**
   * デフォルトのスモークテストチェック項目を生成
   * 外部ランナーが実行すべきチェック項目のテンプレート
   */
  getDefaultSmokeTestChecks(): string[] {
    return [
      'lp_url_200',           // LP URL が 200 を返す
      'fv_element_exists',     // FV要素が存在
      'cta_element_exists',    // CTA要素が存在
      'cta_click_navigates',   // CTAクリックでフォームに到達
      'form_submit_success',   // フォーム送信で完了画面到達（Internal Form時）
      'utm_preserved',         // UTMパラメータが保持されている
      'pageview_event_sent',   // pageviewイベントが送信される
    ];
  }

  /**
   * デフォルトNGルールを取得
   */
  getDefaultNgRules(): NgRules {
    return { ...this.defaultNgRules };
  }

  /**
   * デフォルトNGルールを更新
   */
  setDefaultNgRules(rules: NgRules): void {
    this.defaultNgRules = rules;
  }
}

/**
 * QAサービスインスタンスを作成
 * @param options オプション
 * @returns QAサービスインスタンス
 */
export function createQaService(options?: QaServiceOptions): QaService {
  return new QaService(options);
}

/**
 * デフォルトのQAサービスインスタンス
 */
export const qaService = createQaService();
