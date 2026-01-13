/**
 * Guardrails Middleware
 * Enforces safety checks before allowing run operations
 */

import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types/env.js';
import type {
  GuardrailCheck,
  GuardrailCheckResult,
  RunGuardrailConfig,
} from '../types/auth.js';
import type { AuthVariables } from './auth.js';

/**
 * Guardrail check function type
 */
type GuardrailCheckFn = (config: RunGuardrailConfig) => GuardrailCheck;

/**
 * Check if budget cap is set
 */
export const checkBudgetCap: GuardrailCheckFn = (config) => {
  const passed = config.budgetCap !== undefined && config.budgetCap > 0;
  return {
    name: 'budget_cap',
    passed,
    message: passed
      ? `Budget cap set to ${config.budgetCap}`
      : 'Budget cap is not set. A budget cap is required to prevent runaway spend.',
    severity: 'error',
  };
};

/**
 * Check if stop rules are defined
 */
export const checkStopRules: GuardrailCheckFn = (config) => {
  let passed = false;
  let message = 'Stop rules are not defined. Stop rules are required for auto/hybrid mode.';

  if (config.stopRulesDsl) {
    try {
      const rules = JSON.parse(config.stopRulesDsl);
      // Check if rules array is not empty
      if (Array.isArray(rules) && rules.length > 0) {
        passed = true;
        message = `${rules.length} stop rule(s) configured`;
      } else if (typeof rules === 'object' && Object.keys(rules).length > 0) {
        passed = true;
        message = 'Stop rules configured';
      }
    } catch {
      message = 'Stop rules DSL is invalid JSON';
    }
  }

  return {
    name: 'stop_rules',
    passed,
    message,
    severity: config.operationMode === 'manual' ? 'warning' : 'error',
  };
};

/**
 * Check if run is approved
 */
export const checkApprovalStatus: GuardrailCheckFn = (config) => {
  const passed = config.approvalStatus === 'approved';
  let message: string;

  switch (config.approvalStatus) {
    case 'approved':
      message = 'Run has been approved';
      break;
    case 'submitted':
      message = 'Run is pending approval';
      break;
    case 'rejected':
      message = 'Run has been rejected and cannot be launched';
      break;
    case 'draft':
    default:
      message = 'Run has not been submitted for approval';
  }

  return {
    name: 'approval_status',
    passed,
    message,
    severity: 'error',
  };
};

/**
 * Check if operation mode is valid for current configuration
 */
export const checkOperationMode: GuardrailCheckFn = (config) => {
  const validModes = ['manual', 'hybrid', 'auto'];
  const passed = validModes.includes(config.operationMode ?? '');

  return {
    name: 'operation_mode',
    passed,
    message: passed
      ? `Operation mode: ${config.operationMode}`
      : `Invalid operation mode: ${config.operationMode}`,
    severity: 'error',
  };
};

/**
 * Default guardrail checks for launching a run
 */
const defaultLaunchChecks: GuardrailCheckFn[] = [
  checkBudgetCap,
  checkStopRules,
  checkApprovalStatus,
  checkOperationMode,
];

/**
 * Run all guardrail checks against a configuration
 */
export function runGuardrailChecks(
  config: RunGuardrailConfig,
  checks: GuardrailCheckFn[] = defaultLaunchChecks
): GuardrailCheckResult {
  const checkResults = checks.map((check) => check(config));
  const hasErrors = checkResults.some(
    (result) => !result.passed && result.severity === 'error'
  );

  return {
    passed: !hasErrors,
    checks: checkResults,
  };
}

/**
 * Guardrails middleware factory for run launch
 * Validates run configuration before allowing launch
 */
export function requireLaunchGuardrails(
  getRunConfig: (c: Parameters<MiddlewareHandler>[0]) => Promise<RunGuardrailConfig | null>
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        {
          status: 'error',
          error: 'authentication_required',
          message: 'Authentication is required',
        },
        401
      );
    }

    const config = await getRunConfig(c);

    if (!config) {
      return c.json(
        {
          status: 'error',
          error: 'run_not_found',
          message: 'Run not found or not accessible',
        },
        404
      );
    }

    const result = runGuardrailChecks(config);

    if (!result.passed) {
      const failedChecks = result.checks.filter(
        (check) => !check.passed && check.severity === 'error'
      );

      return c.json(
        {
          status: 'error',
          error: 'guardrail_check_failed',
          message: 'Run cannot be launched due to failed guardrail checks',
          checks: result.checks,
          failedChecks: failedChecks.map((check) => ({
            name: check.name,
            message: check.message,
          })),
        },
        400
      );
    }

    await next();
  };
}

/**
 * Custom guardrail check middleware
 * Allows defining custom checks for specific routes
 */
export function requireCustomGuardrails(
  checks: GuardrailCheckFn[],
  getConfig: (c: Parameters<MiddlewareHandler>[0]) => Promise<RunGuardrailConfig | null>
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const config = await getConfig(c);

    if (!config) {
      return c.json(
        {
          status: 'error',
          error: 'config_not_found',
          message: 'Configuration not found',
        },
        404
      );
    }

    const result = runGuardrailChecks(config, checks);

    if (!result.passed) {
      const failedChecks = result.checks.filter(
        (check) => !check.passed && check.severity === 'error'
      );

      return c.json(
        {
          status: 'error',
          error: 'guardrail_check_failed',
          message: 'Operation blocked by guardrail checks',
          checks: result.checks,
          failedChecks: failedChecks.map((check) => ({
            name: check.name,
            message: check.message,
          })),
        },
        400
      );
    }

    await next();
  };
}

/**
 * Simple budget cap middleware
 * Quick check without full guardrail evaluation
 */
export function requireBudgetCap(
  getBudgetCap: (c: Parameters<MiddlewareHandler>[0]) => Promise<number | null | undefined>
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const budgetCap = await getBudgetCap(c);

    if (budgetCap === null || budgetCap === undefined || budgetCap <= 0) {
      return c.json(
        {
          status: 'error',
          error: 'budget_cap_required',
          message: 'A budget cap must be set before this operation',
        },
        400
      );
    }

    await next();
  };
}

/**
 * Simple approval check middleware
 * Quick check without full guardrail evaluation
 */
export function requireApproval(
  getApprovalStatus: (c: Parameters<MiddlewareHandler>[0]) => Promise<string | null>
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const status = await getApprovalStatus(c);

    if (status !== 'approved') {
      return c.json(
        {
          status: 'error',
          error: 'approval_required',
          message: `Run must be approved before this operation. Current status: ${status ?? 'unknown'}`,
          currentStatus: status,
        },
        400
      );
    }

    await next();
  };
}

/**
 * Validate stop rules are defined for auto/hybrid mode
 */
export function requireStopRulesForAutoMode(
  getConfig: (c: Parameters<MiddlewareHandler>[0]) => Promise<{
    operationMode?: string;
    stopRulesDsl?: string;
  } | null>
): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const config = await getConfig(c);

    if (!config) {
      return c.json(
        {
          status: 'error',
          error: 'config_not_found',
          message: 'Configuration not found',
        },
        404
      );
    }

    // Only enforce for auto/hybrid mode
    if (config.operationMode === 'manual') {
      await next();
      return;
    }

    const check = checkStopRules({
      stopRulesDsl: config.stopRulesDsl,
      operationMode: config.operationMode as 'auto' | 'hybrid' | 'manual',
    });

    if (!check.passed) {
      return c.json(
        {
          status: 'error',
          error: 'stop_rules_required',
          message: check.message,
          operationMode: config.operationMode,
        },
        400
      );
    }

    await next();
  };
}
