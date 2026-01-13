/**
 * Run State Machine Service
 * Manages Run lifecycle state transitions with validation
 */

import type {
  Run,
  RunStatus,
  OperationMode,
  TransitionResult,
  TransitionError,
  RunValidationContext,
  RunValidationResult,
  RunStateChangeEvent,
  RunChecklist,
} from '../types/run.js';
import { RUN_STATUS_TRANSITIONS } from '../types/run.js';

/**
 * Run State Machine
 * Handles state transitions and validation for Runs
 */
export class RunStateMachine {
  /**
   * Check if a transition from one status to another is valid
   */
  static isValidTransition(from: RunStatus, to: RunStatus): boolean {
    const allowedTransitions = RUN_STATUS_TRANSITIONS[from];
    return allowedTransitions.includes(to);
  }

  /**
   * Get all valid next statuses from the current status
   */
  static getValidNextStatuses(currentStatus: RunStatus): RunStatus[] {
    return [...RUN_STATUS_TRANSITIONS[currentStatus]];
  }

  /**
   * Get all statuses that can transition to the given status
   */
  static getValidPreviousStatuses(targetStatus: RunStatus): RunStatus[] {
    const previousStatuses: RunStatus[] = [];

    for (const [from, toList] of Object.entries(RUN_STATUS_TRANSITIONS)) {
      if (toList.includes(targetStatus)) {
        previousStatuses.push(from as RunStatus);
      }
    }

    return previousStatuses;
  }

  /**
   * Validate and attempt a state transition
   */
  static validateTransition(
    context: RunValidationContext,
    toStatus: RunStatus
  ): TransitionResult {
    const { run } = context;
    const errors: TransitionError[] = [];

    // Check if basic transition is allowed
    if (!this.isValidTransition(run.status, toStatus)) {
      errors.push({
        code: 'INVALID_TRANSITION',
        message: `Cannot transition from ${run.status} to ${toStatus}`,
        details: {
          currentStatus: run.status,
          targetStatus: toStatus,
          allowedStatuses: this.getValidNextStatuses(run.status),
        },
      });
    }

    // Additional validations based on target status
    if (errors.length === 0) {
      const additionalErrors = this.validateTransitionRequirements(context, toStatus);
      errors.push(...additionalErrors);
    }

    return {
      success: errors.length === 0,
      fromStatus: run.status,
      toStatus,
      errors,
    };
  }

  /**
   * Validate additional requirements for specific transitions
   */
  private static validateTransitionRequirements(
    context: RunValidationContext,
    toStatus: RunStatus
  ): TransitionError[] {
    const errors: TransitionError[] = [];
    const { run, checklist, hasStopRules, hasBudget, isApproved, hasDesign } = context;

    // Publishing/Running requires Approved status to have been reached
    if ((toStatus === 'Publishing' || toStatus === 'Running') && !isApproved) {
      errors.push({
        code: 'NOT_APPROVED',
        message: 'Run must be approved before publishing or running',
        details: { currentStatus: run.status, approvedAt: run.approvedAt },
      });
    }

    // Running requires stop rules
    if (toStatus === 'Running' && !hasStopRules) {
      errors.push({
        code: 'STOP_RULES_NOT_SET',
        message: 'Stop rules must be configured before running',
        details: { stopDslJson: run.stopDslJson },
      });
    }

    // Running requires budget
    if (toStatus === 'Running' && !hasBudget) {
      errors.push({
        code: 'BUDGET_NOT_SET',
        message: 'Budget must be configured before running',
        details: { runDesignJson: run.runDesignJson },
      });
    }

    // Manual mode requires checklist completion for Running
    if (toStatus === 'Running' && run.operationMode === 'manual') {
      if (!checklist || !this.isChecklistComplete(checklist)) {
        errors.push({
          code: 'CHECKLIST_INCOMPLETE',
          message: 'Manual mode checklist must be completed before running',
          details: {
            checklistProvided: !!checklist,
            checklistComplete: checklist ? this.isChecklistComplete(checklist) : false,
          },
        });
      }
    }

    // Generating requires design
    if (toStatus === 'Generating' && !hasDesign) {
      errors.push({
        code: 'DESIGN_NOT_SET',
        message: 'Run design must be configured before generating',
        details: { runDesignJson: run.runDesignJson },
      });
    }

    return errors;
  }

  /**
   * Check if a checklist is complete
   */
  private static isChecklistComplete(checklist: RunChecklist): boolean {
    return checklist.items
      .filter(item => item.required)
      .every(item => item.status === 'completed');
  }

  /**
   * Validate a run's current state
   */
  static validateRun(context: RunValidationContext): RunValidationResult {
    const errors: TransitionError[] = [];
    const warnings: string[] = [];
    const { run, hasStopRules, hasBudget, hasDesign } = context;

    // Check if run has necessary configurations for its status
    if (run.status === 'Running' || run.status === 'Live') {
      if (!hasStopRules) {
        errors.push({
          code: 'STOP_RULES_NOT_SET',
          message: 'Active run must have stop rules configured',
        });
      }
      if (!hasBudget) {
        errors.push({
          code: 'BUDGET_NOT_SET',
          message: 'Active run must have budget configured',
        });
      }
    }

    if (run.status === 'Generating' || run.status === 'ReadyForReview') {
      if (!hasDesign) {
        warnings.push('Run design may need to be configured');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Create a state change event
   */
  static createStateChangeEvent(
    run: Run,
    toStatus: RunStatus,
    triggeredByUserId?: string,
    metadata?: Record<string, unknown>
  ): RunStateChangeEvent {
    return {
      runId: run.id,
      fromStatus: run.status,
      toStatus,
      operationMode: run.operationMode,
      triggeredByUserId,
      timestamp: new Date().toISOString(),
      metadata,
    };
  }

  /**
   * Check if run is in an active state (can be running ads)
   */
  static isActiveStatus(status: RunStatus): boolean {
    return status === 'Live' || status === 'Running';
  }

  /**
   * Check if run is in a terminal state
   */
  static isTerminalStatus(status: RunStatus): boolean {
    return status === 'Completed' || status === 'Archived';
  }

  /**
   * Check if run can be edited (design, variants, etc.)
   */
  static isEditableStatus(status: RunStatus): boolean {
    return ['Draft', 'Designing', 'Generating', 'ReadyForReview'].includes(status);
  }

  /**
   * Check if run requires approval before proceeding
   */
  static requiresApproval(status: RunStatus): boolean {
    return status === 'ReadyForReview';
  }

  /**
   * Get the next logical status in the workflow
   * Returns undefined if there's no clear next step
   */
  static getNextWorkflowStatus(
    currentStatus: RunStatus,
    operationMode: OperationMode
  ): RunStatus | undefined {
    const workflowOrder: RunStatus[] = [
      'Draft',
      'Designing',
      'Generating',
      'ReadyForReview',
      'Approved',
      'Publishing',
      'Live',
      'Running',
      'Completed',
    ];

    const currentIndex = workflowOrder.indexOf(currentStatus);
    if (currentIndex === -1 || currentIndex === workflowOrder.length - 1) {
      return undefined;
    }

    const nextStatus = workflowOrder[currentIndex + 1];

    // In auto mode, some steps may be skipped
    if (operationMode === 'auto') {
      // Auto mode can skip from Approved directly to Running after Publishing
      if (currentStatus === 'Live') {
        return 'Running';
      }
    }

    return nextStatus;
  }

  /**
   * Get status display information
   */
  static getStatusInfo(status: RunStatus): {
    label: string;
    description: string;
    category: 'setup' | 'review' | 'active' | 'terminal';
  } {
    const statusInfo: Record<RunStatus, { label: string; description: string; category: 'setup' | 'review' | 'active' | 'terminal' }> = {
      Draft: {
        label: 'Draft',
        description: 'Initial state, run is being configured',
        category: 'setup',
      },
      Designing: {
        label: 'Designing',
        description: 'Run design is being created',
        category: 'setup',
      },
      Generating: {
        label: 'Generating',
        description: 'Variants are being generated',
        category: 'setup',
      },
      ReadyForReview: {
        label: 'Ready for Review',
        description: 'Run is ready for approval',
        category: 'review',
      },
      Approved: {
        label: 'Approved',
        description: 'Run has been approved',
        category: 'review',
      },
      Publishing: {
        label: 'Publishing',
        description: 'Assets are being published',
        category: 'active',
      },
      Live: {
        label: 'Live',
        description: 'Run is live but not yet collecting data',
        category: 'active',
      },
      Running: {
        label: 'Running',
        description: 'Run is actively collecting data',
        category: 'active',
      },
      Paused: {
        label: 'Paused',
        description: 'Run is temporarily paused',
        category: 'active',
      },
      Completed: {
        label: 'Completed',
        description: 'Run has finished',
        category: 'terminal',
      },
      Archived: {
        label: 'Archived',
        description: 'Run has been archived',
        category: 'terminal',
      },
    };

    return statusInfo[status];
  }
}

/**
 * Helper function to create validation context from run data
 */
export function createValidationContext(
  run: Run,
  checklist?: RunChecklist
): RunValidationContext {
  // Parse JSON fields to check for required configurations
  let hasStopRules = false;
  let hasBudget = false;
  let hasDesign = false;

  try {
    if (run.stopDslJson && run.stopDslJson !== '{}') {
      const stopRules = JSON.parse(run.stopDslJson);
      hasStopRules = Object.keys(stopRules).length > 0 &&
        (stopRules.maxDays !== undefined ||
         stopRules.maxSpend !== undefined ||
         (stopRules.rules && stopRules.rules.length > 0));
    }
  } catch {
    hasStopRules = false;
  }

  try {
    if (run.runDesignJson && run.runDesignJson !== '{}') {
      const design = JSON.parse(run.runDesignJson);
      hasDesign = Object.keys(design).length > 0;
      hasBudget = design.budget !== undefined &&
        (design.budget.dailyBudget !== undefined || design.budget.totalBudget !== undefined);
    }
  } catch {
    hasDesign = false;
    hasBudget = false;
  }

  const isApproved = run.approvedAt !== null;

  return {
    run,
    checklist,
    hasStopRules,
    hasBudget,
    hasDesign,
    isApproved,
  };
}
