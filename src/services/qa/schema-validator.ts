/**
 * ng_rules JSON Schema バリデーター
 * Ajvを使用してNG表現ルールの構造を検証
 */

import Ajv from 'ajv';
import type { NgRules, SchemaValidationResult } from '../../types/qa.js';

/**
 * ng_rules の JSON Schema 定義
 */
const ngRulesSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  required: [
    'version',
    'blocked_terms',
    'blocked_patterns',
    'allowlist_terms',
    'required_disclaimer',
    'claim_requires_evidence',
    'normalization',
  ],
  properties: {
    version: {
      type: 'string',
      description: 'ルールバージョン',
    },
    blocked_terms: {
      type: 'array',
      items: { type: 'string' },
      description: '禁止用語リスト',
    },
    blocked_patterns: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'reason', 'severity'],
        properties: {
          pattern: {
            type: 'string',
            description: '正規表現パターン',
          },
          flags: {
            type: 'string',
            description: '正規表現フラグ（例: "gi"）',
          },
          reason: {
            type: 'string',
            description: 'ブロック理由',
          },
          severity: {
            type: 'string',
            enum: ['blocker', 'warning'],
            description: '重要度',
          },
        },
        additionalProperties: false,
      },
      description: '禁止パターンリスト',
    },
    allowlist_terms: {
      type: 'array',
      items: { type: 'string' },
      description: '許可リスト',
    },
    required_disclaimer: {
      type: 'array',
      items: { type: 'string' },
      description: '必須免責事項リスト',
    },
    claim_requires_evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['pattern', 'evidence_types', 'severity'],
        properties: {
          pattern: {
            type: 'string',
            description: '主張を検出する正規表現パターン',
          },
          evidence_types: {
            type: 'array',
            items: { type: 'string' },
            description: '許可されるエビデンスの種類',
          },
          severity: {
            type: 'string',
            enum: ['blocker', 'warning'],
            description: '重要度',
          },
        },
        additionalProperties: false,
      },
      description: '主張に対するエビデンス要求ルール',
    },
    normalization: {
      type: 'object',
      required: ['ignore_whitespace', 'ignore_punctuation', 'case_insensitive'],
      properties: {
        ignore_whitespace: {
          type: 'boolean',
          description: '空白を無視するか',
        },
        ignore_punctuation: {
          type: 'boolean',
          description: '句読点を無視するか',
        },
        case_insensitive: {
          type: 'boolean',
          description: '大文字小文字を区別しないか',
        },
      },
      additionalProperties: false,
      description: 'テキスト正規化オプション',
    },
  },
  additionalProperties: false,
};

/**
 * NgRulesスキーマバリデーター
 */
export class NgRulesSchemaValidator {
  private ajv: Ajv;
  private validateFn: ReturnType<Ajv['compile']>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true });
    this.validateFn = this.ajv.compile(ngRulesSchema);
  }

  /**
   * ng_rules オブジェクトをスキーマに対して検証
   * @param data 検証対象のデータ
   * @returns 検証結果
   */
  validate(data: unknown): SchemaValidationResult {
    const valid = this.validateFn(data);

    if (valid) {
      return { valid: true };
    }

    const errors =
      this.validateFn.errors?.map((err) => {
        const path = err.instancePath || '/';
        return `${path}: ${err.message}`;
      }) ?? [];

    return { valid: false, errors };
  }

  /**
   * ng_rules オブジェクトを検証し、型付きで返す
   * @param data 検証対象のデータ
   * @returns 検証済みのNgRulesオブジェクト
   * @throws 検証失敗時にエラー
   */
  validateAndParse(data: unknown): NgRules {
    const result = this.validate(data);

    if (!result.valid) {
      throw new Error(
        `Invalid ng_rules schema: ${result.errors?.join(', ') ?? 'Unknown error'}`
      );
    }

    return data as NgRules;
  }
}

/**
 * デフォルトのバリデーターインスタンス
 */
export const ngRulesValidator = new NgRulesSchemaValidator();

/**
 * ng_rules スキーマを取得
 * @returns JSON Schema定義
 */
export function getNgRulesSchema(): object {
  return { ...ngRulesSchema };
}
