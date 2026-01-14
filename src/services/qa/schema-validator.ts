/**
 * ng_rules Zod スキーマバリデーター
 * Zodを使用してNG表現ルールの構造を検証
 *
 * Note: AjvからZodへ移行（Cloudflare Workers互換性のため）
 * Ajvはeval()を使用するためCloudflare Workersでは動作しない
 */

import { z } from 'zod';
import type { NgRules, SchemaValidationResult } from '../../types/qa.js';

/**
 * severity スキーマ（blocker または warning）
 */
const severitySchema = z.enum(['blocker', 'warning']);

/**
 * blocked_patterns 項目のスキーマ
 */
const blockedPatternSchema = z
  .object({
    pattern: z.string().describe('正規表現パターン'),
    flags: z.string().optional().describe('正規表現フラグ（例: "gi"）'),
    reason: z.string().describe('ブロック理由'),
    severity: severitySchema.describe('重要度'),
  })
  .strict();

/**
 * claim_requires_evidence 項目のスキーマ
 */
const claimRequiresEvidenceSchema = z
  .object({
    pattern: z.string().describe('主張を検出する正規表現パターン'),
    evidence_types: z.array(z.string()).describe('許可されるエビデンスの種類'),
    severity: severitySchema.describe('重要度'),
  })
  .strict();

/**
 * normalization オプションのスキーマ
 */
const normalizationSchema = z
  .object({
    ignore_whitespace: z.boolean().describe('空白を無視するか'),
    ignore_punctuation: z.boolean().describe('句読点を無視するか'),
    case_insensitive: z.boolean().describe('大文字小文字を区別しないか'),
  })
  .strict();

/**
 * ng_rules の Zod スキーマ定義
 */
export const ngRulesZodSchema = z
  .object({
    version: z.string().describe('ルールバージョン'),
    blocked_terms: z.array(z.string()).describe('禁止用語リスト'),
    blocked_patterns: z.array(blockedPatternSchema).describe('禁止パターンリスト'),
    allowlist_terms: z.array(z.string()).describe('許可リスト'),
    required_disclaimer: z.array(z.string()).describe('必須免責事項リスト'),
    claim_requires_evidence: z
      .array(claimRequiresEvidenceSchema)
      .describe('主張に対するエビデンス要求ルール'),
    normalization: normalizationSchema.describe('テキスト正規化オプション'),
  })
  .strict();

/**
 * Zodスキーマから推論される型
 */
export type NgRulesFromSchema = z.infer<typeof ngRulesZodSchema>;

/**
 * NgRulesスキーマバリデーター
 * Zodを使用してCloudflare Workers互換のバリデーションを提供
 */
export class NgRulesSchemaValidator {
  /**
   * ng_rules オブジェクトをスキーマに対して検証
   * @param data 検証対象のデータ
   * @returns 検証結果
   */
  validate(data: unknown): SchemaValidationResult {
    const result = ngRulesZodSchema.safeParse(data);

    if (result.success) {
      return { valid: true };
    }

    const errors = result.error.errors.map((err) => {
      const path = err.path.length > 0 ? `/${err.path.join('/')}` : '/';
      return `${path}: ${err.message}`;
    });

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
 * ng_rules スキーマを取得（JSON Schema形式に変換）
 * @returns JSON Schema風の定義オブジェクト
 */
export function getNgRulesSchema(): object {
  // Zodスキーマの構造を反映したJSON Schema風のオブジェクトを返す
  // 後方互換性のため、元のJSON Schema形式を維持
  return {
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
}
