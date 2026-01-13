/**
 * Guardrails Middleware Tests
 */

import { describe, it, expect } from 'vitest';
import {
  checkBudgetCap,
  checkStopRules,
  checkApprovalStatus,
  checkOperationMode,
  runGuardrailChecks,
} from '../../src/middleware/guardrails.js';
import type { RunGuardrailConfig } from '../../src/types/auth.js';

describe('Guardrails Middleware', () => {
  describe('checkBudgetCap', () => {
    it('should pass when budget cap is set', () => {
      const result = checkBudgetCap({ budgetCap: 1000 });
      expect(result.passed).toBe(true);
      expect(result.name).toBe('budget_cap');
    });

    it('should fail when budget cap is not set', () => {
      const result = checkBudgetCap({});
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
    });

    it('should fail when budget cap is zero', () => {
      const result = checkBudgetCap({ budgetCap: 0 });
      expect(result.passed).toBe(false);
    });

    it('should fail when budget cap is negative', () => {
      const result = checkBudgetCap({ budgetCap: -100 });
      expect(result.passed).toBe(false);
    });
  });

  describe('checkStopRules', () => {
    it('should pass when stop rules array is defined', () => {
      const result = checkStopRules({
        stopRulesDsl: JSON.stringify([{ rule: 'cpa > 50' }]),
      });
      expect(result.passed).toBe(true);
      expect(result.name).toBe('stop_rules');
    });

    it('should pass when stop rules object is defined', () => {
      const result = checkStopRules({
        stopRulesDsl: JSON.stringify({ maxCPA: 50, minConversions: 10 }),
      });
      expect(result.passed).toBe(true);
    });

    it('should fail when stop rules is not set', () => {
      const result = checkStopRules({});
      expect(result.passed).toBe(false);
    });

    it('should fail when stop rules is empty array', () => {
      const result = checkStopRules({
        stopRulesDsl: JSON.stringify([]),
      });
      expect(result.passed).toBe(false);
    });

    it('should fail when stop rules is invalid JSON', () => {
      const result = checkStopRules({
        stopRulesDsl: 'invalid json',
      });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('invalid JSON');
    });

    it('should be warning severity for manual mode', () => {
      const result = checkStopRules({
        operationMode: 'manual',
      });
      expect(result.severity).toBe('warning');
    });

    it('should be error severity for auto mode', () => {
      const result = checkStopRules({
        operationMode: 'auto',
      });
      expect(result.severity).toBe('error');
    });

    it('should be error severity for hybrid mode', () => {
      const result = checkStopRules({
        operationMode: 'hybrid',
      });
      expect(result.severity).toBe('error');
    });
  });

  describe('checkApprovalStatus', () => {
    it('should pass when approved', () => {
      const result = checkApprovalStatus({ approvalStatus: 'approved' });
      expect(result.passed).toBe(true);
      expect(result.message).toContain('approved');
    });

    it('should fail when draft', () => {
      const result = checkApprovalStatus({ approvalStatus: 'draft' });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('not been submitted');
    });

    it('should fail when submitted', () => {
      const result = checkApprovalStatus({ approvalStatus: 'submitted' });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('pending');
    });

    it('should fail when rejected', () => {
      const result = checkApprovalStatus({ approvalStatus: 'rejected' });
      expect(result.passed).toBe(false);
      expect(result.message).toContain('rejected');
    });

    it('should fail when undefined', () => {
      const result = checkApprovalStatus({});
      expect(result.passed).toBe(false);
    });
  });

  describe('checkOperationMode', () => {
    it('should pass for manual mode', () => {
      const result = checkOperationMode({ operationMode: 'manual' });
      expect(result.passed).toBe(true);
    });

    it('should pass for hybrid mode', () => {
      const result = checkOperationMode({ operationMode: 'hybrid' });
      expect(result.passed).toBe(true);
    });

    it('should pass for auto mode', () => {
      const result = checkOperationMode({ operationMode: 'auto' });
      expect(result.passed).toBe(true);
    });

    it('should fail for invalid mode', () => {
      const result = checkOperationMode({ operationMode: 'invalid' as never });
      expect(result.passed).toBe(false);
      expect(result.severity).toBe('error');
    });

    it('should fail when mode is not set', () => {
      const result = checkOperationMode({});
      expect(result.passed).toBe(false);
    });
  });

  describe('runGuardrailChecks', () => {
    const validConfig: RunGuardrailConfig = {
      budgetCap: 1000,
      stopRulesDsl: JSON.stringify([{ rule: 'cpa > 50' }]),
      approvalStatus: 'approved',
      operationMode: 'auto',
    };

    it('should pass when all checks pass', () => {
      const result = runGuardrailChecks(validConfig);
      expect(result.passed).toBe(true);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it('should fail when budget cap is missing', () => {
      const config = { ...validConfig, budgetCap: undefined };
      const result = runGuardrailChecks(config);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === 'budget_cap')?.passed).toBe(false);
    });

    it('should fail when approval is missing', () => {
      const config = { ...validConfig, approvalStatus: 'draft' as const };
      const result = runGuardrailChecks(config);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === 'approval_status')?.passed).toBe(
        false
      );
    });

    it('should fail when stop rules are missing for auto mode', () => {
      const config = { ...validConfig, stopRulesDsl: undefined };
      const result = runGuardrailChecks(config);
      expect(result.passed).toBe(false);
      expect(result.checks.find((c) => c.name === 'stop_rules')?.passed).toBe(false);
    });

    it('should return all check results', () => {
      const result = runGuardrailChecks(validConfig);
      expect(result.checks.length).toBe(4);
      expect(result.checks.map((c) => c.name)).toContain('budget_cap');
      expect(result.checks.map((c) => c.name)).toContain('stop_rules');
      expect(result.checks.map((c) => c.name)).toContain('approval_status');
      expect(result.checks.map((c) => c.name)).toContain('operation_mode');
    });

    it('should allow custom checks', () => {
      const customCheck = () => ({
        name: 'custom_check',
        passed: false,
        message: 'Custom check failed',
        severity: 'error' as const,
      });

      const result = runGuardrailChecks({}, [customCheck]);
      expect(result.passed).toBe(false);
      expect(result.checks.length).toBe(1);
      expect(result.checks[0].name).toBe('custom_check');
    });
  });
});
