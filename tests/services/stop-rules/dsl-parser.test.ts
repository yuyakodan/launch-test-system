import { describe, it, expect } from 'vitest';
import { DslParser, DslParseError, createDslParser } from '../../../src/services/stop-rules/dsl-parser.js';
import type { StopRulesDsl } from '../../../src/types/stop-rules.js';

describe('DslParser', () => {
  const parser = createDslParser();

  describe('parse', () => {
    it('should parse valid DSL JSON', () => {
      const validDsl: StopRulesDsl = {
        version: '1.0',
        evaluation_interval_sec: 300,
        safe_mode_on_error: true,
        rules: [
          {
            id: 'spend_cap_1',
            type: 'spend_total_cap',
            enabled: true,
            threshold: 100000,
            action: 'pause_run',
            severity: 'high',
          },
        ],
      };

      const result = parser.parse(JSON.stringify(validDsl));
      expect(result.version).toBe('1.0');
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].id).toBe('spend_cap_1');
    });

    it('should throw DslParseError for invalid JSON', () => {
      expect(() => parser.parse('{ invalid json')).toThrow(DslParseError);
      expect(() => parser.parse('{ invalid json')).toThrow('Invalid JSON');
    });

    it('should throw DslParseError for missing required fields', () => {
      const invalidDsl = { rules: [] };
      expect(() => parser.parse(JSON.stringify(invalidDsl))).toThrow(DslParseError);
    });

    it('should apply default values for optional fields', () => {
      const minimalDsl = {
        version: '1.0',
        rules: [],
      };

      const result = parser.parse(JSON.stringify(minimalDsl));
      expect(result.evaluation_interval_sec).toBe(300);
      expect(result.safe_mode_on_error).toBe(true);
    });
  });

  describe('validate', () => {
    it('should return valid for correct DSL', () => {
      const validDsl = {
        version: '1.0',
        evaluation_interval_sec: 300,
        safe_mode_on_error: true,
        rules: [
          {
            id: 'rule1',
            type: 'spend_total_cap',
            enabled: true,
            threshold: 50000,
            action: 'pause_run',
            severity: 'high',
          },
        ],
      };

      const result = parser.validate(validDsl);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return error for invalid root type', () => {
      const result = parser.validate('not an object');
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe('INVALID_ROOT');
    });

    it('should return error for missing version', () => {
      const result = parser.validate({ rules: [] });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_FIELD')).toBe(true);
    });

    it('should return error for invalid evaluation_interval_sec', () => {
      const result = parser.validate({
        version: '1.0',
        evaluation_interval_sec: 30, // too short
        rules: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INTERVAL_TOO_SHORT')).toBe(true);
    });

    it('should return error for unsupported rule type', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [
          {
            id: 'rule1',
            type: 'unknown_type',
            enabled: true,
            action: 'pause_run',
            severity: 'high',
          },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'UNSUPPORTED_RULE_TYPE')).toBe(true);
    });

    it('should return error for duplicate rule IDs', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [
          { id: 'rule1', type: 'spend_total_cap', enabled: true, threshold: 100, action: 'pause_run', severity: 'high' },
          { id: 'rule1', type: 'spend_daily_cap', enabled: true, threshold: 50, action: 'notify_only', severity: 'medium' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'DUPLICATE_RULE_ID')).toBe(true);
    });

    it('should return error for missing threshold in spend_total_cap', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [
          { id: 'rule1', type: 'spend_total_cap', enabled: true, action: 'pause_run', severity: 'high' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_THRESHOLD')).toBe(true);
    });

    it('should return error for missing duration_sec in cv_zero_duration', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [
          { id: 'rule1', type: 'cv_zero_duration', enabled: true, action: 'pause_run', severity: 'high' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_DURATION')).toBe(true);
    });

    it('should return error for missing max_gap_sec in measurement_anomaly', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [
          { id: 'rule1', type: 'measurement_anomaly', enabled: true, action: 'notify_only', severity: 'medium' },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'MISSING_MAX_GAP')).toBe(true);
    });

    it('should validate gating conditions', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [
          {
            id: 'rule1',
            type: 'spend_total_cap',
            enabled: true,
            threshold: 100,
            action: 'pause_run',
            severity: 'high',
            gating: {
              min_elapsed_sec: -1, // invalid
            },
          },
        ],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_GATING_VALUE')).toBe(true);
    });

    it('should return warning for empty rules array', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'EMPTY_RULES')).toBe(true);
    });

    it('should return warning for non-standard version format', () => {
      const result = parser.validate({
        version: 'v1',
        rules: [],
      });
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.code === 'NONSTANDARD_VERSION')).toBe(true);
    });
  });

  describe('serialize', () => {
    it('should serialize DSL to JSON string', () => {
      const dsl: StopRulesDsl = {
        version: '1.0',
        evaluation_interval_sec: 300,
        safe_mode_on_error: true,
        rules: [],
      };

      const result = parser.serialize(dsl);
      expect(JSON.parse(result)).toEqual(dsl);
    });
  });

  describe('createDefault', () => {
    it('should create default DSL', () => {
      const defaultDsl = parser.createDefault();
      expect(defaultDsl.version).toBe('1.0');
      expect(defaultDsl.evaluation_interval_sec).toBe(300);
      expect(defaultDsl.safe_mode_on_error).toBe(true);
      expect(defaultDsl.rules).toEqual([]);
    });
  });

  describe('global_settings validation', () => {
    it('should validate notification channels', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [],
        global_settings: {
          notification_channels: [
            { type: 'invalid_type', min_severity: 'high' },
          ],
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'INVALID_CHANNEL_TYPE')).toBe(true);
    });

    it('should accept valid notification channels', () => {
      const result = parser.validate({
        version: '1.0',
        rules: [],
        global_settings: {
          notification_channels: [
            { type: 'slack', min_severity: 'high' },
            { type: 'email', min_severity: 'critical' },
          ],
        },
      });
      expect(result.valid).toBe(true);
    });
  });
});
