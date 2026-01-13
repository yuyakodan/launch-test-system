/**
 * Run Checklist Service
 * Manages manual mode checklists for Run lifecycle
 */

import type {
  RunChecklist,
  ChecklistItem,
  ChecklistItemStatus,
  ManualModeChecklistItemId,
  OperationMode,
} from '../types/run.js';
import { MANUAL_MODE_CHECKLIST_TEMPLATE } from '../types/run.js';

/**
 * Result of a checklist operation
 */
export interface ChecklistOperationResult {
  success: boolean;
  checklist: RunChecklist;
  errors: string[];
}

/**
 * Summary of checklist completion status
 */
export interface ChecklistSummary {
  totalItems: number;
  completedItems: number;
  requiredItems: number;
  completedRequiredItems: number;
  isComplete: boolean;
  pendingRequiredItems: ChecklistItem[];
}

/**
 * Run Checklist Service
 * Handles checklist creation, validation, and completion tracking
 */
export class RunChecklistService {
  /**
   * Create a new checklist for a run based on operation mode
   */
  static createChecklist(runId: string, operationMode: OperationMode): RunChecklist {
    const now = new Date().toISOString();

    // For auto mode, create an empty checklist (no manual checks required)
    if (operationMode === 'auto') {
      return {
        runId,
        operationMode,
        items: [],
        createdAt: now,
        updatedAt: now,
      };
    }

    // For manual and hybrid modes, use the template
    const items: ChecklistItem[] = MANUAL_MODE_CHECKLIST_TEMPLATE.map(template => ({
      ...template,
      status: 'pending' as ChecklistItemStatus,
    }));

    // For hybrid mode, some items may be optional
    if (operationMode === 'hybrid') {
      // In hybrid mode, only the final confirmation is required
      const hybridItems = items.map(item => ({
        ...item,
        required: item.id === 'confirm_start',
      }));

      return {
        runId,
        operationMode,
        items: hybridItems,
        createdAt: now,
        updatedAt: now,
      };
    }

    return {
      runId,
      operationMode,
      items,
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Mark a checklist item as completed
   */
  static completeItem(
    checklist: RunChecklist,
    itemId: ManualModeChecklistItemId,
    userId?: string
  ): ChecklistOperationResult {
    const errors: string[] = [];
    const itemIndex = checklist.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      errors.push(`Checklist item '${itemId}' not found`);
      return { success: false, checklist, errors };
    }

    const item = checklist.items[itemIndex];
    if (item.status === 'completed') {
      // Already completed, return success
      return { success: true, checklist, errors };
    }

    const now = new Date().toISOString();
    const updatedItems = [...checklist.items];
    updatedItems[itemIndex] = {
      ...item,
      status: 'completed',
      completedAt: now,
      completedByUserId: userId,
    };

    const updatedChecklist: RunChecklist = {
      ...checklist,
      items: updatedItems,
      updatedAt: now,
    };

    return { success: true, checklist: updatedChecklist, errors };
  }

  /**
   * Mark a checklist item as skipped (only for non-required items)
   */
  static skipItem(
    checklist: RunChecklist,
    itemId: ManualModeChecklistItemId
  ): ChecklistOperationResult {
    const errors: string[] = [];
    const itemIndex = checklist.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      errors.push(`Checklist item '${itemId}' not found`);
      return { success: false, checklist, errors };
    }

    const item = checklist.items[itemIndex];
    if (item.required) {
      errors.push(`Cannot skip required item '${itemId}'`);
      return { success: false, checklist, errors };
    }

    if (item.status === 'skipped') {
      return { success: true, checklist, errors };
    }

    const now = new Date().toISOString();
    const updatedItems = [...checklist.items];
    updatedItems[itemIndex] = {
      ...item,
      status: 'skipped',
    };

    const updatedChecklist: RunChecklist = {
      ...checklist,
      items: updatedItems,
      updatedAt: now,
    };

    return { success: true, checklist: updatedChecklist, errors };
  }

  /**
   * Reset a checklist item to pending
   */
  static resetItem(
    checklist: RunChecklist,
    itemId: ManualModeChecklistItemId
  ): ChecklistOperationResult {
    const errors: string[] = [];
    const itemIndex = checklist.items.findIndex(item => item.id === itemId);

    if (itemIndex === -1) {
      errors.push(`Checklist item '${itemId}' not found`);
      return { success: false, checklist, errors };
    }

    const now = new Date().toISOString();
    const updatedItems = [...checklist.items];
    updatedItems[itemIndex] = {
      ...checklist.items[itemIndex],
      status: 'pending',
      completedAt: undefined,
      completedByUserId: undefined,
    };

    const updatedChecklist: RunChecklist = {
      ...checklist,
      items: updatedItems,
      updatedAt: now,
    };

    return { success: true, checklist: updatedChecklist, errors };
  }

  /**
   * Complete multiple items at once
   */
  static completeItems(
    checklist: RunChecklist,
    itemIds: ManualModeChecklistItemId[],
    userId?: string
  ): ChecklistOperationResult {
    let currentChecklist = checklist;
    const allErrors: string[] = [];

    for (const itemId of itemIds) {
      const result = this.completeItem(currentChecklist, itemId, userId);
      if (!result.success) {
        allErrors.push(...result.errors);
      } else {
        currentChecklist = result.checklist;
      }
    }

    return {
      success: allErrors.length === 0,
      checklist: currentChecklist,
      errors: allErrors,
    };
  }

  /**
   * Get checklist summary
   */
  static getSummary(checklist: RunChecklist): ChecklistSummary {
    const totalItems = checklist.items.length;
    const completedItems = checklist.items.filter(
      item => item.status === 'completed'
    ).length;
    const requiredItems = checklist.items.filter(item => item.required).length;
    const completedRequiredItems = checklist.items.filter(
      item => item.required && item.status === 'completed'
    ).length;
    const pendingRequiredItems = checklist.items.filter(
      item => item.required && item.status === 'pending'
    );
    const isComplete = completedRequiredItems === requiredItems;

    return {
      totalItems,
      completedItems,
      requiredItems,
      completedRequiredItems,
      isComplete,
      pendingRequiredItems,
    };
  }

  /**
   * Check if checklist is complete (all required items done)
   */
  static isComplete(checklist: RunChecklist): boolean {
    return this.getSummary(checklist).isComplete;
  }

  /**
   * Check if a specific item is completed
   */
  static isItemCompleted(
    checklist: RunChecklist,
    itemId: ManualModeChecklistItemId
  ): boolean {
    const item = checklist.items.find(i => i.id === itemId);
    return item?.status === 'completed';
  }

  /**
   * Get a specific checklist item
   */
  static getItem(
    checklist: RunChecklist,
    itemId: ManualModeChecklistItemId
  ): ChecklistItem | undefined {
    return checklist.items.find(item => item.id === itemId);
  }

  /**
   * Get all pending required items
   */
  static getPendingRequiredItems(checklist: RunChecklist): ChecklistItem[] {
    return checklist.items.filter(
      item => item.required && item.status === 'pending'
    );
  }

  /**
   * Validate checklist state
   */
  static validate(checklist: RunChecklist): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // Check for duplicate item IDs
    const ids = checklist.items.map(item => item.id);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate checklist item IDs: ${duplicates.join(', ')}`);
    }

    // Check for invalid statuses
    const validStatuses: ChecklistItemStatus[] = ['pending', 'completed', 'skipped'];
    for (const item of checklist.items) {
      if (!validStatuses.includes(item.status)) {
        errors.push(`Invalid status '${item.status}' for item '${item.id}'`);
      }
    }

    // Check for skipped required items
    const skippedRequired = checklist.items.filter(
      item => item.required && item.status === 'skipped'
    );
    if (skippedRequired.length > 0) {
      errors.push(
        `Required items cannot be skipped: ${skippedRequired.map(i => i.id).join(', ')}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create checklist from JSON (e.g., from database storage)
   */
  static fromJSON(json: string): RunChecklist | null {
    try {
      const parsed = JSON.parse(json) as RunChecklist;
      return parsed;
    } catch {
      return null;
    }
  }

  /**
   * Convert checklist to JSON for storage
   */
  static toJSON(checklist: RunChecklist): string {
    return JSON.stringify(checklist);
  }

  /**
   * Merge an existing checklist with template updates
   * Preserves completion status of existing items
   */
  static mergeWithTemplate(
    existingChecklist: RunChecklist,
    operationMode: OperationMode
  ): RunChecklist {
    const newChecklist = this.createChecklist(existingChecklist.runId, operationMode);

    // Preserve completion status from existing items
    const mergedItems = newChecklist.items.map(newItem => {
      const existingItem = existingChecklist.items.find(e => e.id === newItem.id);
      if (existingItem && existingItem.status === 'completed') {
        return {
          ...newItem,
          status: existingItem.status,
          completedAt: existingItem.completedAt,
          completedByUserId: existingItem.completedByUserId,
        };
      }
      return newItem;
    });

    return {
      ...newChecklist,
      items: mergedItems,
      updatedAt: new Date().toISOString(),
    };
  }
}
