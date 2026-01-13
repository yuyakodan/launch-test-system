import { describe, it, expect } from 'vitest';
import { RuleEvaluator, createRuleEvaluator } from '../../../src/services/stop-rules/rule-evaluator.js';
import type { StopRulesDsl, EvaluationContext } from '../../../src/types/stop-rules.js';

describe('RuleEvaluator', () => {
  const createBasicDsl = (rules: StopRulesDsl['rules']): StopRulesDsl => ({
    version: '1.0',
    evaluation_interval_sec: 300,
    safe_mode_on_error: true,
    rules,
  });

  const createBasicContext = (overrides: Partial<EvaluationContext> = {}): EvaluationContext => ({
    runId: 'run_123',
    runStartedAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    currentTime: new Date().toISOString(),
    totalSpend: 50000,
    dailySpend: 10000,
    totalConversions: 10,
    totalClicks: 500,
    totalImpressions: 10000,
    syncFailureStreak: 0,
    rejectedAdCount: 0,
    runStatus: 'Running',
    ...overrides,
  });

  describe('spend_total_cap', () => {
    it('should trigger when total spend exceeds threshold', () => {
      const dsl = createBasicDsl([
        {
          id: 'spend_cap',
          type: 'spend_total_cap',
          enabled: true,
          threshold: 40000,
          action: 'pause_run',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
      expect(result.actions[0].type).toBe('pause_run');
    });

    it('should not trigger when total spend is below threshold', () => {
      const dsl = createBasicDsl([
        {
          id: 'spend_cap',
          type: 'spend_total_cap',
          enabled: true,
          threshold: 100000,
          action: 'pause_run',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(0);
      expect(result.results[0].triggered).toBe(false);
    });
  });

  describe('spend_daily_cap', () => {
    it('should trigger when daily spend exceeds threshold', () => {
      const dsl = createBasicDsl([
        {
          id: 'daily_cap',
          type: 'spend_daily_cap',
          enabled: true,
          threshold: 5000,
          action: 'pause_run',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ dailySpend: 10000 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
    });
  });

  describe('cpa_cap', () => {
    it('should trigger when CPA exceeds threshold', () => {
      const dsl = createBasicDsl([
        {
          id: 'cpa_cap',
          type: 'cpa_cap',
          enabled: true,
          threshold: 3000,
          action: 'pause_run',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      // CPA = 50000 / 10 = 5000
      const context = createBasicContext({ totalSpend: 50000, totalConversions: 10 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
    });

    it('should skip when no conversions', () => {
      const dsl = createBasicDsl([
        {
          id: 'cpa_cap',
          type: 'cpa_cap',
          enabled: true,
          threshold: 3000,
          action: 'pause_run',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalConversions: 0 });
      const result = evaluator.evaluate(context);

      expect(result.rulesSkipped).toBe(1);
      expect(result.results[0].skipped).toBe(true);
    });
  });

  describe('cv_zero_duration', () => {
    it('should trigger when no conversion for duration', () => {
      const dsl = createBasicDsl([
        {
          id: 'cv_zero',
          type: 'cv_zero_duration',
          enabled: true,
          duration_sec: 3600, // 1 hour
          action: 'notify_only',
          severity: 'medium',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const twoHoursAgo = new Date(Date.now() - 7200000).toISOString();
      const context = createBasicContext({
        lastConversionAt: twoHoursAgo,
      });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
      expect(result.results[0].triggered).toBe(true);
    });

    it('should skip when min_spend not met', () => {
      const dsl = createBasicDsl([
        {
          id: 'cv_zero',
          type: 'cv_zero_duration',
          enabled: true,
          duration_sec: 3600,
          min_spend: 100000,
          action: 'notify_only',
          severity: 'medium',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000 });
      const result = evaluator.evaluate(context);

      expect(result.rulesSkipped).toBe(1);
    });
  });

  describe('measurement_anomaly', () => {
    it('should trigger when no events for max_gap', () => {
      const dsl = createBasicDsl([
        {
          id: 'measurement',
          type: 'measurement_anomaly',
          enabled: true,
          max_gap_sec: 1800, // 30 minutes
          action: 'create_incident',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const context = createBasicContext({
        lastEventAt: oneHourAgo,
      });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
      expect(result.actions[0].type).toBe('create_incident');
    });

    it('should skip when no events recorded', () => {
      const dsl = createBasicDsl([
        {
          id: 'measurement',
          type: 'measurement_anomaly',
          enabled: true,
          max_gap_sec: 1800,
          action: 'notify_only',
          severity: 'medium',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ lastEventAt: undefined });
      const result = evaluator.evaluate(context);

      expect(result.rulesSkipped).toBe(1);
    });
  });

  describe('meta_rejected', () => {
    it('should trigger when rejected count exceeds threshold', () => {
      const dsl = createBasicDsl([
        {
          id: 'rejected',
          type: 'meta_rejected',
          enabled: true,
          max_rejected_count: 0,
          action: 'create_incident',
          severity: 'critical',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ rejectedAdCount: 3 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
    });

    it('should not trigger when no rejections', () => {
      const dsl = createBasicDsl([
        {
          id: 'rejected',
          type: 'meta_rejected',
          enabled: true,
          max_rejected_count: 0,
          action: 'create_incident',
          severity: 'critical',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ rejectedAdCount: 0 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(0);
    });
  });

  describe('sync_failure_streak', () => {
    it('should trigger when streak reaches threshold', () => {
      const dsl = createBasicDsl([
        {
          id: 'sync_fail',
          type: 'sync_failure_streak',
          enabled: true,
          threshold: 3,
          action: 'notify_only',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ syncFailureStreak: 5 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(1);
    });
  });

  describe('gating conditions', () => {
    it('should skip rule when min_elapsed_sec not met', () => {
      const dsl = createBasicDsl([
        {
          id: 'spend_cap',
          type: 'spend_total_cap',
          enabled: true,
          threshold: 40000,
          action: 'pause_run',
          severity: 'high',
          gating: {
            min_elapsed_sec: 86400, // 24 hours
          },
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000 });
      const result = evaluator.evaluate(context);

      expect(result.rulesSkipped).toBe(1);
      expect(result.results[0].skipReason).toContain('Elapsed time');
    });

    it('should skip rule when min_total_clicks not met', () => {
      const dsl = createBasicDsl([
        {
          id: 'cpa_cap',
          type: 'cpa_cap',
          enabled: true,
          threshold: 5000,
          action: 'pause_run',
          severity: 'high',
          gating: {
            min_total_clicks: 1000,
          },
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalClicks: 500 });
      const result = evaluator.evaluate(context);

      expect(result.rulesSkipped).toBe(1);
      expect(result.results[0].skipReason).toContain('Total clicks');
    });

    it('should skip rule when required_status not met', () => {
      const dsl = createBasicDsl([
        {
          id: 'spend_cap',
          type: 'spend_total_cap',
          enabled: true,
          threshold: 40000,
          action: 'pause_run',
          severity: 'high',
          gating: {
            required_status: ['Live'],
          },
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ runStatus: 'Running' });
      const result = evaluator.evaluate(context);

      expect(result.rulesSkipped).toBe(1);
      expect(result.results[0].skipReason).toContain('Run status');
    });
  });

  describe('disabled rules', () => {
    it('should not evaluate disabled rules', () => {
      const dsl = createBasicDsl([
        {
          id: 'disabled_rule',
          type: 'spend_total_cap',
          enabled: false,
          threshold: 10,
          action: 'pause_run',
          severity: 'high',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000 });
      const result = evaluator.evaluate(context);

      expect(result.rulesEvaluated).toBe(0);
      expect(result.results).toHaveLength(0);
    });
  });

  describe('action deduplication', () => {
    it('should remove pause_bundle when pause_run is present', () => {
      const dsl = createBasicDsl([
        {
          id: 'spend_cap',
          type: 'spend_total_cap',
          enabled: true,
          threshold: 40000,
          action: 'pause_run',
          severity: 'high',
        },
        {
          id: 'cpa_cap',
          type: 'cpa_cap',
          enabled: true,
          threshold: 3000,
          action: 'pause_bundle',
          severity: 'medium',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000, totalConversions: 10 });
      const result = evaluator.evaluate(context);

      expect(result.rulesTriggered).toBe(2);
      expect(result.actions).toHaveLength(1);
      expect(result.actions[0].type).toBe('pause_run');
    });

    it('should prioritize by severity', () => {
      const dsl = createBasicDsl([
        {
          id: 'rule1',
          type: 'spend_total_cap',
          enabled: true,
          threshold: 40000,
          action: 'notify_only',
          severity: 'low',
        },
        {
          id: 'rule2',
          type: 'spend_daily_cap',
          enabled: true,
          threshold: 5000,
          action: 'notify_only',
          severity: 'critical',
        },
      ]);

      const evaluator = createRuleEvaluator(dsl);
      const context = createBasicContext({ totalSpend: 50000, dailySpend: 10000 });
      const result = evaluator.evaluate(context);

      expect(result.actions[0].severity).toBe('critical');
    });
  });

  describe('safe_mode_on_error', () => {
    it('should include safe_mode_on_error flag in DSL', () => {
      const dslWithSafeMode = createBasicDsl([]);
      dslWithSafeMode.safe_mode_on_error = true;

      const evaluator = createRuleEvaluator(dslWithSafeMode);
      const retrievedDsl = evaluator.getDsl();

      expect(retrievedDsl.safe_mode_on_error).toBe(true);
    });

    it('should handle DSL without safe_mode_on_error', () => {
      const dslWithoutSafeMode = createBasicDsl([]);
      dslWithoutSafeMode.safe_mode_on_error = false;

      const evaluator = createRuleEvaluator(dslWithoutSafeMode);
      const retrievedDsl = evaluator.getDsl();

      expect(retrievedDsl.safe_mode_on_error).toBe(false);
    });
  });

  describe('updateDsl', () => {
    it('should update the DSL', () => {
      const dsl1 = createBasicDsl([]);
      const dsl2 = createBasicDsl([
        { id: 'rule1', type: 'spend_total_cap', enabled: true, threshold: 100, action: 'pause_run', severity: 'high' },
      ]);

      const evaluator = createRuleEvaluator(dsl1);
      expect(evaluator.getDsl().rules).toHaveLength(0);

      evaluator.updateDsl(dsl2);
      expect(evaluator.getDsl().rules).toHaveLength(1);
    });
  });
});
