/**
 * Approval Service
 * Implements approval workflow with RBAC and guardrails
 *
 * Requirements (from requirements.md section 4, 5):
 * - Roles: Owner / Operator / Reviewer / Viewer
 * - Guardrails:
 *   - No delivery start without Approved status
 *   - No delivery start without budget_cap
 *   - No delivery start without stop_rules
 * - Approval targets: run, lp_variant, creative_variant, ad_copy, deployment, meta_config
 * - Approval states: submitted, approved, rejected
 * - Hash chain for content verification (target_hash)
 */

import type { Run, Approval, ApprovalTargetType, MembershipRole } from '../types/entities.js';
import type {
  IApprovalRepository,
  IRunRepository,
  ILpVariantRepository,
  ICreativeVariantRepository,
  IAdCopyRepository,
  CreateApprovalInput,
} from '../repositories/interfaces/index.js';
import { computeHash } from './audit.js';
import { hasMinimumRole } from '../middleware/rbac.js';

/**
 * Guardrail check result
 */
export interface GuardrailCheckResult {
  passed: boolean;
  checks: GuardrailCheck[];
}

/**
 * Individual guardrail check
 */
export interface GuardrailCheck {
  name: string;
  passed: boolean;
  message?: string;
  severity: 'error' | 'warning';
}

/**
 * Approval submission result
 */
export interface ApprovalSubmitResult {
  success: boolean;
  approval?: Approval;
  guardrails?: GuardrailCheckResult;
  error?: string;
}

/**
 * Approval action result
 */
export interface ApprovalActionResult {
  success: boolean;
  approval?: Approval;
  error?: string;
}

/**
 * Run launch readiness result
 */
export interface LaunchReadinessResult {
  canLaunch: boolean;
  checks: GuardrailCheck[];
  missingApprovals: Array<{ targetType: ApprovalTargetType; targetId: string }>;
}

/**
 * Context for computing target hash
 */
export interface TargetHashContext {
  targetType: ApprovalTargetType;
  targetId: string;
  content: Record<string, unknown>;
}

/**
 * Approval Service
 */
export class ApprovalService {
  constructor(
    private approvalRepo: IApprovalRepository,
    private runRepo: IRunRepository,
    private lpVariantRepo: ILpVariantRepository,
    private creativeVariantRepo: ICreativeVariantRepository,
    private adCopyRepo: IAdCopyRepository
  ) {}

  /**
   * Compute hash for target content
   * Used to verify content hasn't changed since approval
   */
  async computeTargetHash(context: TargetHashContext): Promise<string> {
    const hashInput = JSON.stringify({
      targetType: context.targetType,
      targetId: context.targetId,
      content: context.content,
    });
    return computeHash(hashInput);
  }

  /**
   * Get content for a target to compute hash
   */
  async getTargetContent(
    targetType: ApprovalTargetType,
    targetId: string
  ): Promise<Record<string, unknown> | null> {
    switch (targetType) {
      case 'run': {
        const run = await this.runRepo.findById(targetId);
        if (!run) return null;
        return {
          id: run.id,
          name: run.name,
          runDesignJson: run.runDesignJson,
          stopDslJson: run.stopDslJson,
          fixedGranularityJson: run.fixedGranularityJson,
        };
      }
      case 'lp_variant': {
        const variant = await this.lpVariantRepo.findById(targetId);
        if (!variant) return null;
        return {
          id: variant.id,
          blocksJson: variant.blocksJson,
          themeJson: variant.themeJson,
        };
      }
      case 'creative_variant': {
        const creative = await this.creativeVariantRepo.findById(targetId);
        if (!creative) return null;
        return {
          id: creative.id,
          textLayersJson: creative.textLayersJson,
          imageR2Key: creative.imageR2Key,
        };
      }
      case 'ad_copy': {
        const adCopy = await this.adCopyRepo.findById(targetId);
        if (!adCopy) return null;
        return {
          id: adCopy.id,
          primaryText: adCopy.primaryText,
          headline: adCopy.headline,
          description: adCopy.description,
        };
      }
      case 'deployment':
      case 'meta_config':
        // These would need their own repositories
        return { id: targetId };
      default:
        return null;
    }
  }

  /**
   * Submit an item for review
   * Creates an approval record with status 'submitted'
   */
  async submitForReview(
    tenantId: string,
    targetType: ApprovalTargetType,
    targetId: string,
    comment?: string
  ): Promise<ApprovalSubmitResult> {
    // Check if already has pending approval
    const hasPending = await this.approvalRepo.hasPendingApproval(targetType, targetId);
    if (hasPending) {
      return {
        success: false,
        error: 'Target already has a pending approval request',
      };
    }

    // Get target content for hash
    const content = await this.getTargetContent(targetType, targetId);
    if (!content) {
      return {
        success: false,
        error: `Target not found: ${targetType}/${targetId}`,
      };
    }

    // Compute content hash
    const targetHash = await this.computeTargetHash({
      targetType,
      targetId,
      content,
    });

    // Create approval request
    const input: CreateApprovalInput = {
      tenantId,
      targetType,
      targetId,
      targetHash,
      comment,
    };

    const approval = await this.approvalRepo.create(input);

    return {
      success: true,
      approval,
    };
  }

  /**
   * Approve an approval request
   * Requires reviewer role or higher
   */
  async approve(
    approvalId: string,
    reviewerUserId: string,
    reviewerRole: MembershipRole,
    comment?: string
  ): Promise<ApprovalActionResult> {
    // Check role
    if (!hasMinimumRole(reviewerRole, 'reviewer')) {
      return {
        success: false,
        error: 'Insufficient permissions: reviewer role required',
      };
    }

    // Get approval
    const approval = await this.approvalRepo.findById(approvalId);
    if (!approval) {
      return {
        success: false,
        error: 'Approval not found',
      };
    }

    if (approval.status !== 'submitted') {
      return {
        success: false,
        error: `Cannot approve: approval is in ${approval.status} status`,
      };
    }

    // Verify content hasn't changed
    const content = await this.getTargetContent(approval.targetType, approval.targetId);
    if (content) {
      const currentHash = await this.computeTargetHash({
        targetType: approval.targetType,
        targetId: approval.targetId,
        content,
      });

      if (currentHash !== approval.targetHash) {
        return {
          success: false,
          error: 'Content has changed since submission. Please re-submit for review.',
        };
      }
    }

    // Approve
    const updated = await this.approvalRepo.approve(approvalId, {
      reviewerUserId,
      comment,
    });

    if (!updated) {
      return {
        success: false,
        error: 'Failed to approve',
      };
    }

    return {
      success: true,
      approval: updated,
    };
  }

  /**
   * Reject an approval request
   * Requires reviewer role or higher
   */
  async reject(
    approvalId: string,
    reviewerUserId: string,
    reviewerRole: MembershipRole,
    comment: string
  ): Promise<ApprovalActionResult> {
    // Check role
    if (!hasMinimumRole(reviewerRole, 'reviewer')) {
      return {
        success: false,
        error: 'Insufficient permissions: reviewer role required',
      };
    }

    if (!comment || comment.trim() === '') {
      return {
        success: false,
        error: 'Comment is required when rejecting',
      };
    }

    // Get approval
    const approval = await this.approvalRepo.findById(approvalId);
    if (!approval) {
      return {
        success: false,
        error: 'Approval not found',
      };
    }

    if (approval.status !== 'submitted') {
      return {
        success: false,
        error: `Cannot reject: approval is in ${approval.status} status`,
      };
    }

    // Reject
    const updated = await this.approvalRepo.reject(approvalId, {
      reviewerUserId,
      comment,
    });

    if (!updated) {
      return {
        success: false,
        error: 'Failed to reject',
      };
    }

    return {
      success: true,
      approval: updated,
    };
  }

  /**
   * Check run guardrails for launch readiness
   * Implements requirements from section 4:
   * - Approved なしで配信開始不可
   * - budget_cap 未設定は開始不可
   * - stop_rules 未設定は開始不可
   */
  async checkRunGuardrails(run: Run): Promise<GuardrailCheckResult> {
    const checks: GuardrailCheck[] = [];

    // Check 1: Run must be approved
    const isApproved = await this.approvalRepo.isApproved('run', run.id);
    checks.push({
      name: 'run_approved',
      passed: isApproved,
      message: isApproved ? 'Run is approved' : 'Run must be approved before launch',
      severity: 'error',
    });

    // Check 2: budget_cap must be set
    let hasBudgetCap = false;
    try {
      const runDesign = JSON.parse(run.runDesignJson || '{}');
      hasBudgetCap =
        runDesign.budget?.total_cap !== undefined && runDesign.budget?.total_cap !== null;
    } catch {
      // Invalid JSON
    }
    checks.push({
      name: 'budget_cap_set',
      passed: hasBudgetCap,
      message: hasBudgetCap ? 'Budget cap is configured' : 'Budget cap (budget.total_cap) must be set',
      severity: 'error',
    });

    // Check 3: stop_rules must be set
    let hasStopRules = false;
    try {
      const stopDsl = JSON.parse(run.stopDslJson || '{}');
      hasStopRules = stopDsl.rules !== undefined && Array.isArray(stopDsl.rules) && stopDsl.rules.length > 0;
    } catch {
      // Invalid JSON
    }
    checks.push({
      name: 'stop_rules_set',
      passed: hasStopRules,
      message: hasStopRules ? 'Stop rules are configured' : 'Stop rules must be configured',
      severity: 'error',
    });

    // All checks must pass for guardrails to pass
    const passed = checks.every((c) => c.passed || c.severity === 'warning');

    return { passed, checks };
  }

  /**
   * Check if a run is ready to launch
   * Combines guardrails and approval checks
   */
  async checkLaunchReadiness(run: Run): Promise<LaunchReadinessResult> {
    // Check guardrails
    const guardrails = await this.checkRunGuardrails(run);

    // Check run approval
    const missingApprovals: Array<{ targetType: ApprovalTargetType; targetId: string }> = [];

    if (!(await this.approvalRepo.isApproved('run', run.id))) {
      missingApprovals.push({ targetType: 'run', targetId: run.id });
    }

    const canLaunch = guardrails.passed && missingApprovals.length === 0;

    return {
      canLaunch,
      checks: guardrails.checks,
      missingApprovals,
    };
  }

  /**
   * Get approval status for a target
   */
  async getApprovalStatus(
    targetType: ApprovalTargetType,
    targetId: string
  ): Promise<{
    isApproved: boolean;
    hasPending: boolean;
    latest: Approval | null;
  }> {
    const [isApproved, hasPending, latest] = await Promise.all([
      this.approvalRepo.isApproved(targetType, targetId),
      this.approvalRepo.hasPendingApproval(targetType, targetId),
      this.approvalRepo.findLatestByTarget(targetType, targetId),
    ]);

    return { isApproved, hasPending, latest };
  }

  /**
   * Submit a run for review
   * Convenience method that handles all run-related approvals
   */
  async submitRunForReview(
    tenantId: string,
    runId: string,
    comment?: string
  ): Promise<ApprovalSubmitResult> {
    // Check that run exists
    const run = await this.runRepo.findById(runId);
    if (!run) {
      return {
        success: false,
        error: 'Run not found',
      };
    }

    // Check guardrails before submission (as warnings)
    const guardrails = await this.checkRunGuardrails(run);

    // Submit run for review
    const result = await this.submitForReview(tenantId, 'run', runId, comment);

    return {
      ...result,
      guardrails,
    };
  }

  /**
   * Get all approvals for a run (run + variants)
   */
  async getRunApprovals(runId: string): Promise<Approval[]> {
    // Get run approval
    const runApprovals = await this.approvalRepo.findByTarget('run', runId);

    // TODO: Get all variant approvals for the run
    // This would require getting all intents for the run, then all variants for each intent

    return runApprovals;
  }
}

/**
 * Role permissions for approval actions
 */
export const APPROVAL_PERMISSIONS = {
  /** Who can submit for review */
  submit: ['operator', 'owner'] as MembershipRole[],
  /** Who can approve */
  approve: ['reviewer', 'operator', 'owner'] as MembershipRole[],
  /** Who can reject */
  reject: ['reviewer', 'operator', 'owner'] as MembershipRole[],
  /** Who can view approvals */
  view: ['viewer', 'reviewer', 'operator', 'owner'] as MembershipRole[],
};

/**
 * Check if a role can perform an approval action
 */
export function canPerformApprovalAction(
  role: MembershipRole,
  action: keyof typeof APPROVAL_PERMISSIONS
): boolean {
  return APPROVAL_PERMISSIONS[action].includes(role);
}
