/**
 * 停止条件DSLパーサー
 * stop_dsl_json の解析とバリデーション
 */

import type {
  StopRulesDsl,
  RuleType,
  ActionType,
  SeverityLevel,
  DslValidationResult,
  DslValidationError,
  DslValidationWarning,
  GatingConditions,
} from '../../types/stop-rules.js';

import {
  SUPPORTED_RULE_TYPES,
  SUPPORTED_ACTION_TYPES,
  SEVERITY_LEVELS,
  DEFAULT_DSL_CONFIG,
} from '../../types/stop-rules.js';

/**
 * DSLパーサークラス
 */
export class DslParser {
  /**
   * JSON文字列をパースしてStopRulesDslオブジェクトを返す
   * @param jsonString JSON文字列
   * @returns パース結果
   * @throws パースエラーの場合
   */
  parse(jsonString: string): StopRulesDsl {
    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonString);
    } catch (error) {
      throw new DslParseError(
        'INVALID_JSON',
        `Invalid JSON: ${(error as Error).message}`
      );
    }

    const validation = this.validate(parsed);
    if (!validation.valid) {
      const errorMessages = validation.errors
        .map((e) => `${e.code}: ${e.message}`)
        .join('; ');
      throw new DslParseError('VALIDATION_FAILED', errorMessages);
    }

    return parsed as StopRulesDsl;
  }

  /**
   * オブジェクトを検証
   * @param data 検証対象のオブジェクト
   * @returns 検証結果
   */
  validate(data: unknown): DslValidationResult {
    const errors: DslValidationError[] = [];
    const warnings: DslValidationWarning[] = [];

    // 1. ルートオブジェクトの検証
    if (!data || typeof data !== 'object') {
      errors.push({
        code: 'INVALID_ROOT',
        message: 'DSL must be an object',
      });
      return { valid: false, errors, warnings };
    }

    const obj = data as Record<string, unknown>;

    // 2. 必須フィールドの検証
    this.validateRequiredFields(obj, errors);

    // 3. バージョンの検証
    if (obj['version'] !== undefined) {
      this.validateVersion(obj['version'], errors, warnings);
    }

    // 4. evaluation_interval_secの検証
    if (obj['evaluation_interval_sec'] !== undefined) {
      this.validateEvaluationInterval(obj['evaluation_interval_sec'], errors);
    }

    // 5. safe_mode_on_errorの検証
    if (obj['safe_mode_on_error'] !== undefined) {
      this.validateSafeMode(obj['safe_mode_on_error'], errors);
    }

    // 6. ルール配列の検証
    if (obj['rules'] !== undefined) {
      this.validateRules(obj['rules'], errors, warnings);
    }

    // 7. global_settingsの検証（オプション）
    if (obj['global_settings'] !== undefined) {
      this.validateGlobalSettings(obj['global_settings'], errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 必須フィールドの検証
   */
  private validateRequiredFields(
    obj: Record<string, unknown>,
    errors: DslValidationError[]
  ): void {
    const requiredFields = ['version', 'rules'];

    for (const field of requiredFields) {
      if (obj[field] === undefined) {
        errors.push({
          code: 'MISSING_FIELD',
          message: `Missing required field: ${field}`,
          path: field,
        });
      }
    }

    // デフォルト値があるフィールドは警告のみ
    if (obj['evaluation_interval_sec'] === undefined) {
      obj['evaluation_interval_sec'] = DEFAULT_DSL_CONFIG.evaluation_interval_sec;
    }

    if (obj['safe_mode_on_error'] === undefined) {
      obj['safe_mode_on_error'] = DEFAULT_DSL_CONFIG.safe_mode_on_error;
    }
  }

  /**
   * バージョンの検証
   */
  private validateVersion(
    version: unknown,
    errors: DslValidationError[],
    warnings: DslValidationWarning[]
  ): void {
    if (typeof version !== 'string') {
      errors.push({
        code: 'INVALID_VERSION',
        message: 'version must be a string',
        path: 'version',
      });
      return;
    }

    // バージョン形式のチェック（セマンティックバージョニング）
    const versionRegex = /^\d+\.\d+(\.\d+)?$/;
    if (!versionRegex.test(version)) {
      warnings.push({
        code: 'NONSTANDARD_VERSION',
        message: `Version "${version}" does not follow semantic versioning`,
        path: 'version',
      });
    }
  }

  /**
   * 評価間隔の検証
   */
  private validateEvaluationInterval(
    interval: unknown,
    errors: DslValidationError[]
  ): void {
    if (typeof interval !== 'number') {
      errors.push({
        code: 'INVALID_INTERVAL',
        message: 'evaluation_interval_sec must be a number',
        path: 'evaluation_interval_sec',
      });
      return;
    }

    if (interval < 60) {
      errors.push({
        code: 'INTERVAL_TOO_SHORT',
        message: 'evaluation_interval_sec must be at least 60 seconds',
        path: 'evaluation_interval_sec',
      });
    }

    if (interval > 86400) {
      errors.push({
        code: 'INTERVAL_TOO_LONG',
        message: 'evaluation_interval_sec must not exceed 86400 seconds (24 hours)',
        path: 'evaluation_interval_sec',
      });
    }
  }

  /**
   * セーフモードの検証
   */
  private validateSafeMode(
    safeMode: unknown,
    errors: DslValidationError[]
  ): void {
    if (typeof safeMode !== 'boolean') {
      errors.push({
        code: 'INVALID_SAFE_MODE',
        message: 'safe_mode_on_error must be a boolean',
        path: 'safe_mode_on_error',
      });
    }
  }

  /**
   * ルール配列の検証
   */
  private validateRules(
    rules: unknown,
    errors: DslValidationError[],
    warnings: DslValidationWarning[]
  ): void {
    if (!Array.isArray(rules)) {
      errors.push({
        code: 'INVALID_RULES',
        message: 'rules must be an array',
        path: 'rules',
      });
      return;
    }

    if (rules.length === 0) {
      warnings.push({
        code: 'EMPTY_RULES',
        message: 'rules array is empty',
        path: 'rules',
      });
    }

    const ruleIds = new Set<string>();

    rules.forEach((rule, index) => {
      this.validateRule(rule, index, errors, warnings, ruleIds);
    });
  }

  /**
   * 単一ルールの検証
   */
  private validateRule(
    rule: unknown,
    index: number,
    errors: DslValidationError[],
    warnings: DslValidationWarning[],
    ruleIds: Set<string>
  ): void {
    const path = `rules[${index}]`;

    if (!rule || typeof rule !== 'object') {
      errors.push({
        code: 'INVALID_RULE',
        message: 'Rule must be an object',
        path,
      });
      return;
    }

    const ruleObj = rule as Record<string, unknown>;

    // 必須フィールドの検証
    const requiredRuleFields = ['id', 'type', 'enabled', 'action', 'severity'];
    for (const field of requiredRuleFields) {
      if (ruleObj[field] === undefined) {
        errors.push({
          code: 'MISSING_RULE_FIELD',
          message: `Missing required field: ${field}`,
          path: `${path}.${field}`,
          ruleId: ruleObj['id'] as string | undefined,
        });
      }
    }

    // IDの検証
    if (ruleObj['id'] !== undefined) {
      if (typeof ruleObj['id'] !== 'string' || ruleObj['id'].length === 0) {
        errors.push({
          code: 'INVALID_RULE_ID',
          message: 'Rule id must be a non-empty string',
          path: `${path}.id`,
        });
      } else if (ruleIds.has(ruleObj['id'] as string)) {
        errors.push({
          code: 'DUPLICATE_RULE_ID',
          message: `Duplicate rule id: ${ruleObj['id']}`,
          path: `${path}.id`,
          ruleId: ruleObj['id'] as string,
        });
      } else {
        ruleIds.add(ruleObj['id'] as string);
      }
    }

    // タイプの検証
    if (ruleObj['type'] !== undefined) {
      if (!SUPPORTED_RULE_TYPES.includes(ruleObj['type'] as RuleType)) {
        errors.push({
          code: 'UNSUPPORTED_RULE_TYPE',
          message: `Unsupported rule type: ${ruleObj['type']}. Supported types: ${SUPPORTED_RULE_TYPES.join(', ')}`,
          path: `${path}.type`,
          ruleId: ruleObj['id'] as string | undefined,
        });
      }
    }

    // enabledの検証
    if (ruleObj['enabled'] !== undefined && typeof ruleObj['enabled'] !== 'boolean') {
      errors.push({
        code: 'INVALID_ENABLED',
        message: 'enabled must be a boolean',
        path: `${path}.enabled`,
        ruleId: ruleObj['id'] as string | undefined,
      });
    }

    // アクションの検証
    if (ruleObj['action'] !== undefined) {
      if (!SUPPORTED_ACTION_TYPES.includes(ruleObj['action'] as ActionType)) {
        errors.push({
          code: 'UNSUPPORTED_ACTION_TYPE',
          message: `Unsupported action type: ${ruleObj['action']}. Supported types: ${SUPPORTED_ACTION_TYPES.join(', ')}`,
          path: `${path}.action`,
          ruleId: ruleObj['id'] as string | undefined,
        });
      }
    }

    // 重要度の検証
    if (ruleObj['severity'] !== undefined) {
      if (!SEVERITY_LEVELS.includes(ruleObj['severity'] as SeverityLevel)) {
        errors.push({
          code: 'INVALID_SEVERITY',
          message: `Invalid severity: ${ruleObj['severity']}. Valid values: ${SEVERITY_LEVELS.join(', ')}`,
          path: `${path}.severity`,
          ruleId: ruleObj['id'] as string | undefined,
        });
      }
    }

    // ゲーティング条件の検証
    if (ruleObj['gating'] !== undefined) {
      this.validateGatingConditions(
        ruleObj['gating'],
        `${path}.gating`,
        errors,
        ruleObj['id'] as string | undefined
      );
    }

    // タイプ固有のフィールド検証
    if (ruleObj['type'] !== undefined && SUPPORTED_RULE_TYPES.includes(ruleObj['type'] as RuleType)) {
      this.validateRuleTypeSpecificFields(
        ruleObj,
        ruleObj['type'] as RuleType,
        path,
        errors,
        warnings
      );
    }
  }

  /**
   * ゲーティング条件の検証
   */
  private validateGatingConditions(
    gating: unknown,
    path: string,
    errors: DslValidationError[],
    ruleId?: string
  ): void {
    if (typeof gating !== 'object' || gating === null) {
      errors.push({
        code: 'INVALID_GATING',
        message: 'gating must be an object',
        path,
        ruleId,
      });
      return;
    }

    const gatingObj = gating as Record<string, unknown>;
    const numericFields: (keyof GatingConditions)[] = [
      'min_elapsed_sec',
      'min_total_clicks',
      'min_total_spend',
      'min_total_impressions',
    ];

    for (const field of numericFields) {
      if (gatingObj[field] !== undefined) {
        if (typeof gatingObj[field] !== 'number' || gatingObj[field] as number < 0) {
          errors.push({
            code: 'INVALID_GATING_VALUE',
            message: `${field} must be a non-negative number`,
            path: `${path}.${field}`,
            ruleId,
          });
        }
      }
    }

    if (gatingObj['required_status'] !== undefined) {
      if (!Array.isArray(gatingObj['required_status'])) {
        errors.push({
          code: 'INVALID_GATING_STATUS',
          message: 'required_status must be an array',
          path: `${path}.required_status`,
          ruleId,
        });
      }
    }
  }

  /**
   * タイプ固有フィールドの検証
   */
  private validateRuleTypeSpecificFields(
    rule: Record<string, unknown>,
    type: RuleType,
    path: string,
    errors: DslValidationError[],
    _warnings: DslValidationWarning[]
  ): void {
    const ruleId = rule['id'] as string | undefined;

    switch (type) {
      case 'spend_total_cap':
      case 'spend_daily_cap':
        if (rule['threshold'] === undefined) {
          errors.push({
            code: 'MISSING_THRESHOLD',
            message: `${type} requires threshold field`,
            path: `${path}.threshold`,
            ruleId,
          });
        } else if (typeof rule['threshold'] !== 'number' || (rule['threshold'] as number) <= 0) {
          errors.push({
            code: 'INVALID_THRESHOLD',
            message: 'threshold must be a positive number',
            path: `${path}.threshold`,
            ruleId,
          });
        }
        break;

      case 'cpa_cap':
        if (rule['threshold'] === undefined) {
          errors.push({
            code: 'MISSING_THRESHOLD',
            message: 'cpa_cap requires threshold field',
            path: `${path}.threshold`,
            ruleId,
          });
        } else if (typeof rule['threshold'] !== 'number' || (rule['threshold'] as number) <= 0) {
          errors.push({
            code: 'INVALID_THRESHOLD',
            message: 'threshold must be a positive number',
            path: `${path}.threshold`,
            ruleId,
          });
        }
        break;

      case 'cv_zero_duration':
        if (rule['duration_sec'] === undefined) {
          errors.push({
            code: 'MISSING_DURATION',
            message: 'cv_zero_duration requires duration_sec field',
            path: `${path}.duration_sec`,
            ruleId,
          });
        } else if (typeof rule['duration_sec'] !== 'number' || (rule['duration_sec'] as number) <= 0) {
          errors.push({
            code: 'INVALID_DURATION',
            message: 'duration_sec must be a positive number',
            path: `${path}.duration_sec`,
            ruleId,
          });
        }
        break;

      case 'measurement_anomaly':
        if (rule['max_gap_sec'] === undefined) {
          errors.push({
            code: 'MISSING_MAX_GAP',
            message: 'measurement_anomaly requires max_gap_sec field',
            path: `${path}.max_gap_sec`,
            ruleId,
          });
        } else if (typeof rule['max_gap_sec'] !== 'number' || (rule['max_gap_sec'] as number) <= 0) {
          errors.push({
            code: 'INVALID_MAX_GAP',
            message: 'max_gap_sec must be a positive number',
            path: `${path}.max_gap_sec`,
            ruleId,
          });
        }
        break;

      case 'meta_rejected':
        // entity_types と max_rejected_count はオプション
        if (rule['entity_types'] !== undefined && !Array.isArray(rule['entity_types'])) {
          errors.push({
            code: 'INVALID_ENTITY_TYPES',
            message: 'entity_types must be an array',
            path: `${path}.entity_types`,
            ruleId,
          });
        }
        break;

      case 'sync_failure_streak':
        if (rule['threshold'] === undefined) {
          errors.push({
            code: 'MISSING_THRESHOLD',
            message: 'sync_failure_streak requires threshold field',
            path: `${path}.threshold`,
            ruleId,
          });
        } else if (typeof rule['threshold'] !== 'number' || (rule['threshold'] as number) < 1) {
          errors.push({
            code: 'INVALID_THRESHOLD',
            message: 'threshold must be a positive integer',
            path: `${path}.threshold`,
            ruleId,
          });
        }
        break;
    }
  }

  /**
   * グローバル設定の検証
   */
  private validateGlobalSettings(
    settings: unknown,
    errors: DslValidationError[],
    _warnings: DslValidationWarning[]
  ): void {
    if (typeof settings !== 'object' || settings === null) {
      errors.push({
        code: 'INVALID_GLOBAL_SETTINGS',
        message: 'global_settings must be an object',
        path: 'global_settings',
      });
      return;
    }

    const settingsObj = settings as Record<string, unknown>;

    // 通知チャンネルの検証
    if (settingsObj['notification_channels'] !== undefined) {
      if (!Array.isArray(settingsObj['notification_channels'])) {
        errors.push({
          code: 'INVALID_NOTIFICATION_CHANNELS',
          message: 'notification_channels must be an array',
          path: 'global_settings.notification_channels',
        });
      } else {
        settingsObj['notification_channels'].forEach((channel, index) => {
          this.validateNotificationChannel(
            channel,
            `global_settings.notification_channels[${index}]`,
            errors
          );
        });
      }
    }
  }

  /**
   * 通知チャンネルの検証
   */
  private validateNotificationChannel(
    channel: unknown,
    path: string,
    errors: DslValidationError[]
  ): void {
    if (typeof channel !== 'object' || channel === null) {
      errors.push({
        code: 'INVALID_CHANNEL',
        message: 'Notification channel must be an object',
        path,
      });
      return;
    }

    const channelObj = channel as Record<string, unknown>;
    const validTypes = ['email', 'slack', 'webhook'];

    if (!validTypes.includes(channelObj['type'] as string)) {
      errors.push({
        code: 'INVALID_CHANNEL_TYPE',
        message: `Invalid channel type: ${channelObj['type']}. Valid types: ${validTypes.join(', ')}`,
        path: `${path}.type`,
      });
    }

    if (!SEVERITY_LEVELS.includes(channelObj['min_severity'] as SeverityLevel)) {
      errors.push({
        code: 'INVALID_MIN_SEVERITY',
        message: `Invalid min_severity: ${channelObj['min_severity']}`,
        path: `${path}.min_severity`,
      });
    }
  }

  /**
   * DSLオブジェクトをJSON文字列にシリアライズ
   * @param dsl DSLオブジェクト
   * @returns JSON文字列
   */
  serialize(dsl: StopRulesDsl): string {
    return JSON.stringify(dsl, null, 2);
  }

  /**
   * デフォルトのDSLを作成
   * @returns デフォルトのStopRulesDsl
   */
  createDefault(): StopRulesDsl {
    return {
      version: DEFAULT_DSL_CONFIG.version,
      evaluation_interval_sec: DEFAULT_DSL_CONFIG.evaluation_interval_sec,
      safe_mode_on_error: DEFAULT_DSL_CONFIG.safe_mode_on_error,
      rules: [],
    };
  }
}

/**
 * DSLパースエラー
 */
export class DslParseError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'DslParseError';
    this.code = code;
  }
}

/**
 * DslParserのファクトリ関数
 * @returns DslParserインスタンス
 */
export function createDslParser(): DslParser {
  return new DslParser();
}
