import { describe, it, expect } from 'vitest';
import {
  RunStateMachine,
  createValidationContext,
} from '../../src/services/run-state-machine.js';
import type { Run, RunStatus, RunChecklist } from '../../src/types/run.js';

/**
 * Helper to create a mock Run object
 */
function createMockRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run_01ABCDEF',
    projectId: 'proj_01ABCDEF',
    name: 'Test Run',
    status: 'Draft',
    operationMode: 'manual',
    startAt: null,
    endAt: null,
    runDesignJson: '{}',
    stopDslJson: '{}',
    fixedGranularityJson: '{}',
    decisionRulesJson: '{}',
    createdByUserId: 'user_01ABCDEF',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    approvedAt: null,
    publishedAt: null,
    launchedAt: null,
    completedAt: null,
    ...overrides,
  };
}

/**
 * Helper to create a complete mock checklist
 */
function createCompleteChecklist(runId: string): RunChecklist {
  return {
    runId,
    operationMode: 'manual',
    items: [
      { id: 'review_run_design', label: 'Review Run Design', description: '', required: true, status: 'completed', completedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'review_stop_rules', label: 'Review Stop Rules', description: '', required: true, status: 'completed', completedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'review_budget', label: 'Review Budget', description: '', required: true, status: 'completed', completedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'review_variants', label: 'Review Variants', description: '', required: true, status: 'completed', completedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'confirm_meta_connection', label: 'Confirm Meta', description: '', required: true, status: 'completed', completedAt: '2025-01-01T00:00:00.000Z' },
      { id: 'confirm_start', label: 'Confirm Start', description: '', required: true, status: 'completed', completedAt: '2025-01-01T00:00:00.000Z' },
    ],
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

describe('RunStateMachine', () => {
  describe('isValidTransition', () => {
    it('should allow valid transitions from Draft', () => {
      expect(RunStateMachine.isValidTransition('Draft', 'Designing')).toBe(true);
      expect(RunStateMachine.isValidTransition('Draft', 'Archived')).toBe(true);
    });

    it('should reject invalid transitions from Draft', () => {
      expect(RunStateMachine.isValidTransition('Draft', 'Running')).toBe(false);
      expect(RunStateMachine.isValidTransition('Draft', 'Completed')).toBe(false);
      expect(RunStateMachine.isValidTransition('Draft', 'Approved')).toBe(false);
    });

    it('should allow valid workflow progression', () => {
      expect(RunStateMachine.isValidTransition('Designing', 'Generating')).toBe(true);
      expect(RunStateMachine.isValidTransition('Generating', 'ReadyForReview')).toBe(true);
      expect(RunStateMachine.isValidTransition('ReadyForReview', 'Approved')).toBe(true);
      expect(RunStateMachine.isValidTransition('Approved', 'Publishing')).toBe(true);
      expect(RunStateMachine.isValidTransition('Publishing', 'Live')).toBe(true);
      expect(RunStateMachine.isValidTransition('Live', 'Running')).toBe(true);
      expect(RunStateMachine.isValidTransition('Running', 'Completed')).toBe(true);
    });

    it('should allow pausing and resuming', () => {
      expect(RunStateMachine.isValidTransition('Running', 'Paused')).toBe(true);
      expect(RunStateMachine.isValidTransition('Paused', 'Running')).toBe(true);
      expect(RunStateMachine.isValidTransition('Paused', 'Completed')).toBe(true);
    });

    it('should allow archiving from most states', () => {
      const archivableStates: RunStatus[] = [
        'Draft', 'Designing', 'Generating', 'ReadyForReview',
        'Approved', 'Publishing', 'Live', 'Running', 'Paused', 'Completed'
      ];

      for (const status of archivableStates) {
        expect(RunStateMachine.isValidTransition(status, 'Archived')).toBe(true);
      }
    });

    it('should not allow any transitions from Archived', () => {
      expect(RunStateMachine.isValidTransition('Archived', 'Draft')).toBe(false);
      expect(RunStateMachine.isValidTransition('Archived', 'Running')).toBe(false);
    });
  });

  describe('getValidNextStatuses', () => {
    it('should return correct next statuses for Draft', () => {
      const nextStatuses = RunStateMachine.getValidNextStatuses('Draft');
      expect(nextStatuses).toContain('Designing');
      expect(nextStatuses).toContain('Archived');
      expect(nextStatuses).toHaveLength(2);
    });

    it('should return correct next statuses for Running', () => {
      const nextStatuses = RunStateMachine.getValidNextStatuses('Running');
      expect(nextStatuses).toContain('Paused');
      expect(nextStatuses).toContain('Completed');
      expect(nextStatuses).toContain('Archived');
      expect(nextStatuses).toHaveLength(3);
    });

    it('should return empty array for Archived', () => {
      const nextStatuses = RunStateMachine.getValidNextStatuses('Archived');
      expect(nextStatuses).toHaveLength(0);
    });
  });

  describe('getValidPreviousStatuses', () => {
    it('should return statuses that can transition to Running', () => {
      const prevStatuses = RunStateMachine.getValidPreviousStatuses('Running');
      expect(prevStatuses).toContain('Live');
      expect(prevStatuses).toContain('Paused');
    });

    it('should return statuses that can transition to Archived', () => {
      const prevStatuses = RunStateMachine.getValidPreviousStatuses('Archived');
      expect(prevStatuses.length).toBeGreaterThan(5);
    });
  });

  describe('validateTransition', () => {
    it('should reject transition without approval for Publishing', () => {
      const run = createMockRun({ status: 'Approved' });
      const context = createValidationContext(run);

      const result = RunStateMachine.validateTransition(context, 'Publishing');

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'NOT_APPROVED' })
      );
    });

    it('should reject Running without stop rules', () => {
      const run = createMockRun({
        status: 'Live',
        approvedAt: '2025-01-01T00:00:00.000Z',
        runDesignJson: JSON.stringify({ budget: { dailyBudget: 100 } }),
        stopDslJson: '{}',
        operationMode: 'auto',
      });
      const context = createValidationContext(run);

      const result = RunStateMachine.validateTransition(context, 'Running');

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'STOP_RULES_NOT_SET' })
      );
    });

    it('should reject Running without budget', () => {
      const run = createMockRun({
        status: 'Live',
        approvedAt: '2025-01-01T00:00:00.000Z',
        stopDslJson: JSON.stringify({ maxDays: 14 }),
        runDesignJson: '{}',
        operationMode: 'auto',
      });
      const context = createValidationContext(run);

      const result = RunStateMachine.validateTransition(context, 'Running');

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'BUDGET_NOT_SET' })
      );
    });

    it('should reject manual mode Running without checklist', () => {
      const run = createMockRun({
        status: 'Live',
        approvedAt: '2025-01-01T00:00:00.000Z',
        stopDslJson: JSON.stringify({ maxDays: 14 }),
        runDesignJson: JSON.stringify({ budget: { dailyBudget: 100 } }),
        operationMode: 'manual',
      });
      const context = createValidationContext(run);

      const result = RunStateMachine.validateTransition(context, 'Running');

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'CHECKLIST_INCOMPLETE' })
      );
    });

    it('should allow Running with complete checklist in manual mode', () => {
      const run = createMockRun({
        status: 'Live',
        approvedAt: '2025-01-01T00:00:00.000Z',
        stopDslJson: JSON.stringify({ maxDays: 14 }),
        runDesignJson: JSON.stringify({ budget: { dailyBudget: 100 } }),
        operationMode: 'manual',
      });
      const checklist = createCompleteChecklist(run.id);
      const context = createValidationContext(run, checklist);

      const result = RunStateMachine.validateTransition(context, 'Running');

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should allow Running in auto mode without checklist', () => {
      const run = createMockRun({
        status: 'Live',
        approvedAt: '2025-01-01T00:00:00.000Z',
        stopDslJson: JSON.stringify({ maxDays: 14 }),
        runDesignJson: JSON.stringify({ budget: { dailyBudget: 100 } }),
        operationMode: 'auto',
      });
      const context = createValidationContext(run);

      const result = RunStateMachine.validateTransition(context, 'Running');

      expect(result.success).toBe(true);
    });

    it('should reject invalid transition paths', () => {
      const run = createMockRun({ status: 'Draft' });
      const context = createValidationContext(run);

      const result = RunStateMachine.validateTransition(context, 'Running');

      expect(result.success).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ code: 'INVALID_TRANSITION' })
      );
    });
  });

  describe('status helper methods', () => {
    it('should identify active statuses', () => {
      expect(RunStateMachine.isActiveStatus('Live')).toBe(true);
      expect(RunStateMachine.isActiveStatus('Running')).toBe(true);
      expect(RunStateMachine.isActiveStatus('Draft')).toBe(false);
      expect(RunStateMachine.isActiveStatus('Paused')).toBe(false);
    });

    it('should identify terminal statuses', () => {
      expect(RunStateMachine.isTerminalStatus('Completed')).toBe(true);
      expect(RunStateMachine.isTerminalStatus('Archived')).toBe(true);
      expect(RunStateMachine.isTerminalStatus('Running')).toBe(false);
    });

    it('should identify editable statuses', () => {
      expect(RunStateMachine.isEditableStatus('Draft')).toBe(true);
      expect(RunStateMachine.isEditableStatus('Designing')).toBe(true);
      expect(RunStateMachine.isEditableStatus('Running')).toBe(false);
      expect(RunStateMachine.isEditableStatus('Completed')).toBe(false);
    });

    it('should identify status requiring approval', () => {
      expect(RunStateMachine.requiresApproval('ReadyForReview')).toBe(true);
      expect(RunStateMachine.requiresApproval('Draft')).toBe(false);
    });
  });

  describe('getNextWorkflowStatus', () => {
    it('should return next workflow status in sequence', () => {
      expect(RunStateMachine.getNextWorkflowStatus('Draft', 'manual')).toBe('Designing');
      expect(RunStateMachine.getNextWorkflowStatus('Designing', 'manual')).toBe('Generating');
      expect(RunStateMachine.getNextWorkflowStatus('ReadyForReview', 'manual')).toBe('Approved');
    });

    it('should return undefined for Completed status', () => {
      expect(RunStateMachine.getNextWorkflowStatus('Completed', 'manual')).toBeUndefined();
    });

    it('should return Running for Live in auto mode', () => {
      expect(RunStateMachine.getNextWorkflowStatus('Live', 'auto')).toBe('Running');
    });
  });

  describe('getStatusInfo', () => {
    it('should return correct status info', () => {
      const draftInfo = RunStateMachine.getStatusInfo('Draft');
      expect(draftInfo.label).toBe('Draft');
      expect(draftInfo.category).toBe('setup');

      const runningInfo = RunStateMachine.getStatusInfo('Running');
      expect(runningInfo.label).toBe('Running');
      expect(runningInfo.category).toBe('active');

      const completedInfo = RunStateMachine.getStatusInfo('Completed');
      expect(completedInfo.label).toBe('Completed');
      expect(completedInfo.category).toBe('terminal');
    });
  });

  describe('createStateChangeEvent', () => {
    it('should create a state change event', () => {
      const run = createMockRun({ status: 'Live' });
      const event = RunStateMachine.createStateChangeEvent(
        run,
        'Running',
        'user_01ABCDEF',
        { reason: 'test' }
      );

      expect(event.runId).toBe(run.id);
      expect(event.fromStatus).toBe('Live');
      expect(event.toStatus).toBe('Running');
      expect(event.operationMode).toBe('manual');
      expect(event.triggeredByUserId).toBe('user_01ABCDEF');
      expect(event.metadata).toEqual({ reason: 'test' });
      expect(event.timestamp).toBeDefined();
    });
  });
});

describe('createValidationContext', () => {
  it('should detect stop rules from JSON', () => {
    const run = createMockRun({
      stopDslJson: JSON.stringify({ maxDays: 14, maxSpend: 1000 }),
    });
    const context = createValidationContext(run);

    expect(context.hasStopRules).toBe(true);
  });

  it('should detect missing stop rules', () => {
    const run = createMockRun({ stopDslJson: '{}' });
    const context = createValidationContext(run);

    expect(context.hasStopRules).toBe(false);
  });

  it('should detect budget from design JSON', () => {
    const run = createMockRun({
      runDesignJson: JSON.stringify({ budget: { dailyBudget: 100 } }),
    });
    const context = createValidationContext(run);

    expect(context.hasBudget).toBe(true);
    expect(context.hasDesign).toBe(true);
  });

  it('should detect missing budget', () => {
    const run = createMockRun({
      runDesignJson: JSON.stringify({ hypothesis: 'test' }),
    });
    const context = createValidationContext(run);

    expect(context.hasBudget).toBe(false);
    expect(context.hasDesign).toBe(true);
  });

  it('should detect approval status', () => {
    const approvedRun = createMockRun({
      approvedAt: '2025-01-01T00:00:00.000Z',
    });
    const unapprovedRun = createMockRun({ approvedAt: null });

    expect(createValidationContext(approvedRun).isApproved).toBe(true);
    expect(createValidationContext(unapprovedRun).isApproved).toBe(false);
  });

  it('should handle invalid JSON gracefully', () => {
    const run = createMockRun({
      stopDslJson: 'invalid json',
      runDesignJson: 'also invalid',
    });
    const context = createValidationContext(run);

    expect(context.hasStopRules).toBe(false);
    expect(context.hasBudget).toBe(false);
    expect(context.hasDesign).toBe(false);
  });
});
