import { describe, it, expect } from 'vitest';
import {
  NgRulesSchemaValidator,
  ngRulesValidator,
  getNgRulesSchema,
} from '../../../src/services/qa/schema-validator.js';
import type { NgRules } from '../../../src/types/qa.js';

describe('NgRulesSchemaValidator', () => {
  describe('validate メソッド', () => {
    it('有効なNgRulesを検証成功する', () => {
      const validRules: NgRules = {
        version: '1.0.0',
        blocked_terms: ['禁止用語'],
        blocked_patterns: [
          {
            pattern: 'テスト.*パターン',
            flags: 'gi',
            reason: 'テスト理由',
            severity: 'blocker',
          },
        ],
        allowlist_terms: ['許可用語'],
        required_disclaimer: ['免責事項'],
        claim_requires_evidence: [
          {
            pattern: '主張パターン',
            evidence_types: ['research', 'statistics'],
            severity: 'warning',
          },
        ],
        normalization: {
          ignore_whitespace: true,
          ignore_punctuation: false,
          case_insensitive: true,
        },
      };

      const result = ngRulesValidator.validate(validRules);
      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('必須フィールドがない場合は検証失敗する', () => {
      const invalidRules = {
        version: '1.0.0',
        // blocked_terms がない
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

      const result = ngRulesValidator.validate(invalidRules);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors?.some((e) => e.includes('blocked_terms'))).toBe(
        true
      );
    });

    it('blocked_patterns の severity が不正な場合は検証失敗する', () => {
      const invalidRules = {
        version: '1.0.0',
        blocked_terms: [],
        blocked_patterns: [
          {
            pattern: 'test',
            reason: 'test reason',
            severity: 'invalid', // blocker または warning 以外
          },
        ],
        allowlist_terms: [],
        required_disclaimer: [],
        claim_requires_evidence: [],
        normalization: {
          ignore_whitespace: true,
          ignore_punctuation: false,
          case_insensitive: true,
        },
      };

      const result = ngRulesValidator.validate(invalidRules);
      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('normalization フィールドが不完全な場合は検証失敗する', () => {
      const invalidRules = {
        version: '1.0.0',
        blocked_terms: [],
        blocked_patterns: [],
        allowlist_terms: [],
        required_disclaimer: [],
        claim_requires_evidence: [],
        normalization: {
          ignore_whitespace: true,
          // ignore_punctuation がない
          case_insensitive: true,
        },
      };

      const result = ngRulesValidator.validate(invalidRules);
      expect(result.valid).toBe(false);
    });

    it('追加プロパティがある場合は検証失敗する', () => {
      const invalidRules = {
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
        extraField: 'should not be here',
      };

      const result = ngRulesValidator.validate(invalidRules);
      expect(result.valid).toBe(false);
    });

    it('空のオブジェクトは検証失敗する', () => {
      const result = ngRulesValidator.validate({});
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(0);
    });

    it('nullは検証失敗する', () => {
      const result = ngRulesValidator.validate(null);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateAndParse メソッド', () => {
    it('有効なデータを検証してNgRulesとして返す', () => {
      const validRules: NgRules = {
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

      const result = ngRulesValidator.validateAndParse(validRules);
      expect(result).toEqual(validRules);
    });

    it('無効なデータの場合はエラーをスローする', () => {
      const invalidRules = {
        version: '1.0.0',
        // 必須フィールドが不足
      };

      expect(() => ngRulesValidator.validateAndParse(invalidRules)).toThrow(
        'Invalid ng_rules schema'
      );
    });
  });

  describe('NgRulesSchemaValidator クラス', () => {
    it('新しいインスタンスを作成できる', () => {
      const validator = new NgRulesSchemaValidator();
      expect(validator).toBeInstanceOf(NgRulesSchemaValidator);
    });

    it('複数のインスタンスが独立して動作する', () => {
      const validator1 = new NgRulesSchemaValidator();
      const validator2 = new NgRulesSchemaValidator();

      const validRules: NgRules = {
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

      expect(validator1.validate(validRules).valid).toBe(true);
      expect(validator2.validate(validRules).valid).toBe(true);
    });
  });
});

describe('getNgRulesSchema', () => {
  it('JSON Schemaオブジェクトを返す', () => {
    const schema = getNgRulesSchema();
    expect(schema).toHaveProperty('$schema');
    expect(schema).toHaveProperty('type', 'object');
    expect(schema).toHaveProperty('required');
    expect(schema).toHaveProperty('properties');
  });

  it('返されたスキーマは独立したコピーである', () => {
    const schema1 = getNgRulesSchema();
    const schema2 = getNgRulesSchema();

    // 変更が他に影響しないことを確認
    (schema1 as Record<string, unknown>).customField = 'test';
    expect(schema2).not.toHaveProperty('customField');
  });
});

describe('blocked_patterns の詳細検証', () => {
  it('flags フィールドはオプショナル', () => {
    const rules = {
      version: '1.0.0',
      blocked_terms: [],
      blocked_patterns: [
        {
          pattern: 'test',
          // flags がない
          reason: 'test reason',
          severity: 'blocker',
        },
      ],
      allowlist_terms: [],
      required_disclaimer: [],
      claim_requires_evidence: [],
      normalization: {
        ignore_whitespace: true,
        ignore_punctuation: false,
        case_insensitive: true,
      },
    };

    const result = ngRulesValidator.validate(rules);
    expect(result.valid).toBe(true);
  });

  it('pattern フィールドは必須', () => {
    const rules = {
      version: '1.0.0',
      blocked_terms: [],
      blocked_patterns: [
        {
          // pattern がない
          flags: 'gi',
          reason: 'test reason',
          severity: 'blocker',
        },
      ],
      allowlist_terms: [],
      required_disclaimer: [],
      claim_requires_evidence: [],
      normalization: {
        ignore_whitespace: true,
        ignore_punctuation: false,
        case_insensitive: true,
      },
    };

    const result = ngRulesValidator.validate(rules);
    expect(result.valid).toBe(false);
  });
});

describe('claim_requires_evidence の詳細検証', () => {
  it('evidence_types は配列であること', () => {
    const rules = {
      version: '1.0.0',
      blocked_terms: [],
      blocked_patterns: [],
      allowlist_terms: [],
      required_disclaimer: [],
      claim_requires_evidence: [
        {
          pattern: 'test',
          evidence_types: 'not_an_array', // 配列でない
          severity: 'blocker',
        },
      ],
      normalization: {
        ignore_whitespace: true,
        ignore_punctuation: false,
        case_insensitive: true,
      },
    };

    const result = ngRulesValidator.validate(rules);
    expect(result.valid).toBe(false);
  });

  it('severity は blocker または warning のみ', () => {
    const rulesWithBlocker = {
      version: '1.0.0',
      blocked_terms: [],
      blocked_patterns: [],
      allowlist_terms: [],
      required_disclaimer: [],
      claim_requires_evidence: [
        {
          pattern: 'test',
          evidence_types: [],
          severity: 'blocker',
        },
      ],
      normalization: {
        ignore_whitespace: true,
        ignore_punctuation: false,
        case_insensitive: true,
      },
    };

    const rulesWithWarning = {
      ...rulesWithBlocker,
      claim_requires_evidence: [
        {
          pattern: 'test',
          evidence_types: [],
          severity: 'warning',
        },
      ],
    };

    expect(ngRulesValidator.validate(rulesWithBlocker).valid).toBe(true);
    expect(ngRulesValidator.validate(rulesWithWarning).valid).toBe(true);
  });
});
