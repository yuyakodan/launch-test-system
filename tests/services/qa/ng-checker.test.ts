import { describe, it, expect, beforeEach } from 'vitest';
import {
  NgChecker,
  createNgChecker,
  createDefaultNgRules,
} from '../../../src/services/qa/ng-checker.js';
import type { NgRules } from '../../../src/types/qa.js';

describe('NgChecker', () => {
  let checker: NgChecker;
  let testRules: NgRules;

  beforeEach(() => {
    testRules = {
      version: '1.0.0',
      blocked_terms: ['禁止ワード', '違法'],
      blocked_patterns: [
        {
          pattern: '絶対に.*効果',
          flags: 'gi',
          reason: '効果の過剰表現',
          severity: 'blocker',
        },
        {
          pattern: '100%.*保証',
          flags: 'gi',
          reason: '保証の過剰表現',
          severity: 'warning',
        },
      ],
      allowlist_terms: ['違法性なし', '禁止ワード例外'],
      required_disclaimer: ['個人差があります', '医師にご相談ください'],
      claim_requires_evidence: [
        {
          pattern: '売上No\\.?1',
          evidence_types: ['statistics', 'citation'],
          severity: 'blocker',
        },
      ],
      normalization: {
        ignore_whitespace: true,
        ignore_punctuation: false,
        case_insensitive: true,
      },
    };
    checker = new NgChecker(testRules);
  });

  describe('blocked_terms チェック', () => {
    it('禁止用語を検出する', () => {
      const result = checker.check('この商品は禁止ワードを含みます');
      expect(result.passed).toBe(false);
      const blockedTermIssues = result.blockers.filter(
        (b) => b.type === 'blocked_term'
      );
      expect(blockedTermIssues).toHaveLength(1);
      expect(blockedTermIssues[0].matchedText).toBe('禁止ワード');
    });

    it('複数の禁止用語を検出する', () => {
      const result = checker.check('禁止ワードと違法な内容があります');
      expect(result.blockers.length).toBeGreaterThanOrEqual(2);
    });

    it('禁止用語がない場合はパスする', () => {
      const result = checker.check('正常なテキストです');
      expect(
        result.blockers.filter((b) => b.type === 'blocked_term')
      ).toHaveLength(0);
    });

    it('allowlist_terms に含まれる場合は除外される', () => {
      const result = checker.check('この商品は違法性なしです');
      const blockedTermIssues = result.blockers.filter(
        (b) => b.type === 'blocked_term' && b.matchedText === '違法'
      );
      expect(blockedTermIssues).toHaveLength(0);
    });
  });

  describe('blocked_patterns チェック', () => {
    it('禁止パターンを検出する（blocker）', () => {
      const result = checker.check('絶対に効果があります');
      const patternIssues = result.blockers.filter(
        (b) => b.type === 'blocked_pattern'
      );
      expect(patternIssues.length).toBeGreaterThanOrEqual(1);
      expect(patternIssues[0].details?.reason).toBe('効果の過剰表現');
    });

    it('禁止パターンを検出する（warning）', () => {
      const result = checker.check('100%返金保証します');
      const patternIssues = result.warnings.filter(
        (w) => w.type === 'blocked_pattern'
      );
      expect(patternIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('パターンに一致しない場合は問題なし', () => {
      const result = checker.check('効果が期待できます');
      const blockerPatternIssues = result.blockers.filter(
        (b) =>
          b.type === 'blocked_pattern' &&
          b.details?.reason === '効果の過剰表現'
      );
      expect(blockerPatternIssues).toHaveLength(0);
    });
  });

  describe('required_disclaimer チェック', () => {
    it('必須免責事項がない場合は検出する', () => {
      const result = checker.check('商品説明文です');
      const disclaimerIssues = result.blockers.filter(
        (b) => b.type === 'missing_disclaimer'
      );
      expect(disclaimerIssues).toHaveLength(2);
    });

    it('一部の免責事項のみある場合は残りを検出する', () => {
      const result = checker.check(
        '個人差があります。商品説明文です。'
      );
      const disclaimerIssues = result.blockers.filter(
        (b) => b.type === 'missing_disclaimer'
      );
      expect(disclaimerIssues).toHaveLength(1);
      expect(disclaimerIssues[0].details?.requiredDisclaimer).toBe(
        '医師にご相談ください'
      );
    });

    it('全ての免責事項がある場合は問題なし', () => {
      const result = checker.check(
        '個人差があります。医師にご相談ください。商品説明文です。'
      );
      const disclaimerIssues = result.blockers.filter(
        (b) => b.type === 'missing_disclaimer'
      );
      expect(disclaimerIssues).toHaveLength(0);
    });
  });

  describe('claim_requires_evidence チェック', () => {
    it('エビデンスなしの主張を検出する', () => {
      const result = checker.check('売上No.1の商品です');
      const claimIssues = result.blockers.filter(
        (b) => b.type === 'claim_without_evidence'
      );
      expect(claimIssues.length).toBeGreaterThanOrEqual(1);
    });

    it('エビデンスありの主張は問題なし', () => {
      const result = checker.check(
        '統計データによると、売上No.1の商品です。出典: 調査会社'
      );
      const claimIssues = result.blockers.filter(
        (b) => b.type === 'claim_without_evidence'
      );
      expect(claimIssues).toHaveLength(0);
    });
  });

  describe('正規化オプション', () => {
    it('case_insensitive が有効な場合、大文字小文字を区別しない', () => {
      const rules: NgRules = {
        ...createDefaultNgRules(),
        blocked_terms: ['test'],
        normalization: {
          ignore_whitespace: false,
          ignore_punctuation: false,
          case_insensitive: true,
        },
      };
      const checkerWithOptions = new NgChecker(rules);
      const result = checkerWithOptions.check('TEST is blocked');
      expect(result.blockers).toHaveLength(1);
    });

    it('ignore_whitespace が有効な場合、空白を正規化する', () => {
      const rules: NgRules = {
        ...createDefaultNgRules(),
        blocked_terms: ['禁止 用語'],
        normalization: {
          ignore_whitespace: true,
          ignore_punctuation: false,
          case_insensitive: true,
        },
      };
      const checkerWithOptions = new NgChecker(rules);
      const result = checkerWithOptions.check('禁止  用語があります');
      expect(result.blockers).toHaveLength(1);
    });
  });

  describe('QaCheckResult の構造', () => {
    it('結果に必要なプロパティが含まれる', () => {
      const result = checker.check('テストテキスト');
      expect(result).toHaveProperty('passed');
      expect(result).toHaveProperty('blockers');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('checkedText');
      expect(result).toHaveProperty('rulesVersion');
      expect(result).toHaveProperty('timestamp');
    });

    it('blockerがない場合はpassedがtrue', () => {
      const rules: NgRules = {
        ...createDefaultNgRules(),
        version: '1.0.0',
      };
      const checkerNoRules = new NgChecker(rules);
      const result = checkerNoRules.check('普通のテキスト');
      expect(result.passed).toBe(true);
      expect(result.blockers).toHaveLength(0);
    });

    it('blockerがある場合はpassedがfalse', () => {
      const result = checker.check('禁止ワードを含むテキスト');
      expect(result.passed).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });
  });

  describe('createNgChecker ファクトリー関数', () => {
    it('ルールなしでデフォルトルールを使用', () => {
      const defaultChecker = createNgChecker();
      const result = defaultChecker.check('テスト');
      expect(result.rulesVersion).toBe('1.0.0');
    });

    it('カスタムルールで作成', () => {
      const customRules: NgRules = {
        ...createDefaultNgRules(),
        version: '2.0.0',
        blocked_terms: ['カスタム禁止'],
      };
      const customChecker = createNgChecker(customRules);
      const result = customChecker.check('カスタム禁止ワード');
      expect(result.rulesVersion).toBe('2.0.0');
      expect(result.blockers).toHaveLength(1);
    });
  });

  describe('updateRules メソッド', () => {
    it('ルールを更新できる', () => {
      const newRules: NgRules = {
        ...createDefaultNgRules(),
        version: '2.0.0',
        blocked_terms: ['新禁止'],
      };
      checker.updateRules(newRules);
      expect(checker.getRules().version).toBe('2.0.0');

      const result = checker.check('新禁止ワード');
      expect(result.blockers).toHaveLength(1);
    });
  });
});

describe('createDefaultNgRules', () => {
  it('デフォルトルールを作成する', () => {
    const rules = createDefaultNgRules();
    expect(rules.version).toBe('1.0.0');
    expect(rules.blocked_terms).toEqual([]);
    expect(rules.blocked_patterns).toEqual([]);
    expect(rules.allowlist_terms).toEqual([]);
    expect(rules.required_disclaimer).toEqual([]);
    expect(rules.claim_requires_evidence).toEqual([]);
    expect(rules.normalization).toEqual({
      ignore_whitespace: true,
      ignore_punctuation: false,
      case_insensitive: true,
    });
  });
});
