/**
 * Run State Machine Types
 * Defines state transition rules and checklist mechanisms for Run lifecycle management
 */

import type { RunStatus, OperationMode, Run } from './entities.js';

// ================================
// Re-export base types
// ================================
export type { RunStatus, OperationMode, Run };

// ================================
// State Transition Types
// ================================

/**
 * Valid state transitions map
 * Key: current status, Value: array of allowed next statuses
 */
export const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  Draft: ['Designing', 'Archived'],
  Designing: ['Draft', 'Generating', 'Archived'],
  Generating: ['Designing', 'ReadyForReview', 'Archived'],
  ReadyForReview: ['Generating', 'Approved', 'Archived'],
  Approved: ['ReadyForReview', 'Publishing', 'Archived'],
  Publishing: ['Approved', 'Live', 'Archived'],
  Live: ['Publishing', 'Running', 'Paused', 'Archived'],
  Running: ['Paused', 'Completed', 'Archived'],
  Paused: ['Running', 'Completed', 'Archived'],
  Completed: ['Archived'],
  Archived: [],
} as const;

/**
 * Result of a state transition attempt
 */
export interface TransitionResult {
  success: boolean;
  fromStatus: RunStatus;
  toStatus: RunStatus;
  errors: TransitionError[];
}

/**
 * Error types for transition validation
 */
export type TransitionErrorCode =
  | 'INVALID_TRANSITION'
  | 'NOT_APPROVED'
  | 'STOP_RULES_NOT_SET'
  | 'BUDGET_NOT_SET'
  | 'CHECKLIST_INCOMPLETE'
  | 'DESIGN_NOT_SET';

/**
 * Transition error with code and message
 */
export interface TransitionError {
  code: TransitionErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

// ================================
// Checklist Types
// ================================

/**
 * Checklist item status
 */
export type ChecklistItemStatus = 'pending' | 'completed' | 'skipped';

/**
 * A single checklist item
 */
export interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  required: boolean;
  status: ChecklistItemStatus;
  completedAt?: string;
  completedByUserId?: string;
}

/**
 * Pre-defined checklist item IDs for Manual Mode
 */
export type ManualModeChecklistItemId =
  | 'review_run_design'
  | 'review_stop_rules'
  | 'review_budget'
  | 'review_variants'
  | 'confirm_meta_connection'
  | 'confirm_start';

/**
 * Manual Mode checklist template
 */
export const MANUAL_MODE_CHECKLIST_TEMPLATE: ReadonlyArray<Omit<ChecklistItem, 'status' | 'completedAt' | 'completedByUserId'>> = [
  {
    id: 'review_run_design',
    label: 'Review Run Design',
    description: 'Confirm the run design configuration is correct',
    required: true,
  },
  {
    id: 'review_stop_rules',
    label: 'Review Stop Rules',
    description: 'Verify stop conditions are properly configured',
    required: true,
  },
  {
    id: 'review_budget',
    label: 'Review Budget Settings',
    description: 'Confirm budget allocation and limits',
    required: true,
  },
  {
    id: 'review_variants',
    label: 'Review All Variants',
    description: 'Review and approve all LP variants, creatives, and ad copies',
    required: true,
  },
  {
    id: 'confirm_meta_connection',
    label: 'Confirm Meta Connection',
    description: 'Verify Meta API connection is active and properly configured',
    required: true,
  },
  {
    id: 'confirm_start',
    label: 'Confirm Start',
    description: 'Final confirmation to start the run',
    required: true,
  },
] as const;

/**
 * Run checklist state
 */
export interface RunChecklist {
  runId: string;
  operationMode: OperationMode;
  items: ChecklistItem[];
  createdAt: string;
  updatedAt: string;
}

// ================================
// Run Configuration Types
// ================================

/**
 * Stop rules configuration parsed from stopDslJson
 */
export interface StopRulesConfig {
  maxDays?: number;
  maxSpend?: number;
  minSampleSize?: number;
  confidenceLevel?: number;
  rules?: StopRule[];
}

/**
 * A single stop rule
 */
export interface StopRule {
  type: 'time' | 'spend' | 'sample' | 'confidence' | 'custom';
  condition: string;
  value: number | string;
}

/**
 * Budget configuration
 */
export interface BudgetConfig {
  dailyBudget?: number;
  totalBudget?: number;
  currency?: string;
}

/**
 * Run design configuration parsed from runDesignJson
 */
export interface RunDesignConfig {
  hypothesis?: string;
  targetMetric?: string;
  variants?: string[];
  budget?: BudgetConfig;
}

// ================================
// Validation Types
// ================================

/**
 * Run validation result
 */
export interface RunValidationResult {
  valid: boolean;
  errors: TransitionError[];
  warnings: string[];
}

/**
 * Context required for run validation
 */
export interface RunValidationContext {
  run: Run;
  checklist?: RunChecklist;
  hasStopRules: boolean;
  hasBudget: boolean;
  hasDesign: boolean;
  isApproved: boolean;
}

// ================================
// Event Types
// ================================

/**
 * Run state change event
 */
export interface RunStateChangeEvent {
  runId: string;
  fromStatus: RunStatus;
  toStatus: RunStatus;
  operationMode: OperationMode;
  triggeredByUserId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
