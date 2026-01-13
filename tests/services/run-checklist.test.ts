import { describe, it, expect } from 'vitest';
import { RunChecklistService } from '../../src/services/run-checklist.js';
import type { RunChecklist, ManualModeChecklistItemId } from '../../src/types/run.js';

describe('RunChecklistService', () => {
  describe('createChecklist', () => {
    it('should create a checklist with all items for manual mode', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');

      expect(checklist.runId).toBe('run_01');
      expect(checklist.operationMode).toBe('manual');
      expect(checklist.items.length).toBe(6);
      expect(checklist.items.every(item => item.status === 'pending')).toBe(true);
      expect(checklist.items.every(item => item.required === true)).toBe(true);
    });

    it('should create an empty checklist for auto mode', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'auto');

      expect(checklist.runId).toBe('run_01');
      expect(checklist.operationMode).toBe('auto');
      expect(checklist.items.length).toBe(0);
    });

    it('should create a checklist with optional items for hybrid mode', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'hybrid');

      expect(checklist.runId).toBe('run_01');
      expect(checklist.operationMode).toBe('hybrid');
      expect(checklist.items.length).toBe(6);

      // Only confirm_start should be required in hybrid mode
      const requiredItems = checklist.items.filter(item => item.required);
      expect(requiredItems.length).toBe(1);
      expect(requiredItems[0].id).toBe('confirm_start');
    });
  });

  describe('completeItem', () => {
    it('should mark an item as completed', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result = RunChecklistService.completeItem(
        checklist,
        'review_run_design',
        'user_01'
      );

      expect(result.success).toBe(true);
      const item = result.checklist.items.find(i => i.id === 'review_run_design');
      expect(item?.status).toBe('completed');
      expect(item?.completedByUserId).toBe('user_01');
      expect(item?.completedAt).toBeDefined();
    });

    it('should return error for non-existent item', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result = RunChecklistService.completeItem(
        checklist,
        'non_existent' as ManualModeChecklistItemId,
        'user_01'
      );

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Checklist item 'non_existent' not found");
    });

    it('should handle already completed items gracefully', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result1 = RunChecklistService.completeItem(checklist, 'review_run_design');
      const result2 = RunChecklistService.completeItem(result1.checklist, 'review_run_design');

      expect(result2.success).toBe(true);
      expect(result2.errors).toHaveLength(0);
    });
  });

  describe('skipItem', () => {
    it('should allow skipping non-required items in hybrid mode', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'hybrid');
      const result = RunChecklistService.skipItem(checklist, 'review_run_design');

      expect(result.success).toBe(true);
      const item = result.checklist.items.find(i => i.id === 'review_run_design');
      expect(item?.status).toBe('skipped');
    });

    it('should reject skipping required items', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result = RunChecklistService.skipItem(checklist, 'review_run_design');

      expect(result.success).toBe(false);
      expect(result.errors).toContain("Cannot skip required item 'review_run_design'");
    });
  });

  describe('resetItem', () => {
    it('should reset a completed item to pending', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const completed = RunChecklistService.completeItem(checklist, 'review_run_design');
      const result = RunChecklistService.resetItem(completed.checklist, 'review_run_design');

      expect(result.success).toBe(true);
      const item = result.checklist.items.find(i => i.id === 'review_run_design');
      expect(item?.status).toBe('pending');
      expect(item?.completedAt).toBeUndefined();
      expect(item?.completedByUserId).toBeUndefined();
    });
  });

  describe('completeItems', () => {
    it('should complete multiple items at once', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result = RunChecklistService.completeItems(
        checklist,
        ['review_run_design', 'review_stop_rules', 'review_budget'],
        'user_01'
      );

      expect(result.success).toBe(true);
      expect(result.checklist.items.filter(i => i.status === 'completed').length).toBe(3);
    });

    it('should report errors for invalid items', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result = RunChecklistService.completeItems(
        checklist,
        ['review_run_design', 'invalid_item' as ManualModeChecklistItemId],
        'user_01'
      );

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // First item should still be completed
      const completedItem = result.checklist.items.find(i => i.id === 'review_run_design');
      expect(completedItem?.status).toBe('completed');
    });
  });

  describe('getSummary', () => {
    it('should return correct summary for empty checklist', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'auto');
      const summary = RunChecklistService.getSummary(checklist);

      expect(summary.totalItems).toBe(0);
      expect(summary.completedItems).toBe(0);
      expect(summary.isComplete).toBe(true);
    });

    it('should return correct summary for partial completion', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const updated = RunChecklistService.completeItems(
        checklist,
        ['review_run_design', 'review_stop_rules'],
      );
      const summary = RunChecklistService.getSummary(updated.checklist);

      expect(summary.totalItems).toBe(6);
      expect(summary.completedItems).toBe(2);
      expect(summary.requiredItems).toBe(6);
      expect(summary.completedRequiredItems).toBe(2);
      expect(summary.isComplete).toBe(false);
      expect(summary.pendingRequiredItems.length).toBe(4);
    });

    it('should return correct summary for complete checklist', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const allItems: ManualModeChecklistItemId[] = [
        'review_run_design',
        'review_stop_rules',
        'review_budget',
        'review_variants',
        'confirm_meta_connection',
        'confirm_start',
      ];
      const updated = RunChecklistService.completeItems(checklist, allItems);
      const summary = RunChecklistService.getSummary(updated.checklist);

      expect(summary.totalItems).toBe(6);
      expect(summary.completedItems).toBe(6);
      expect(summary.isComplete).toBe(true);
      expect(summary.pendingRequiredItems.length).toBe(0);
    });
  });

  describe('isComplete', () => {
    it('should return true when all required items are completed', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'hybrid');
      // Only confirm_start is required in hybrid mode
      const updated = RunChecklistService.completeItem(checklist, 'confirm_start');

      expect(RunChecklistService.isComplete(updated.checklist)).toBe(true);
    });

    it('should return false when required items are pending', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');

      expect(RunChecklistService.isComplete(checklist)).toBe(false);
    });
  });

  describe('isItemCompleted', () => {
    it('should return true for completed items', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const updated = RunChecklistService.completeItem(checklist, 'review_run_design');

      expect(RunChecklistService.isItemCompleted(updated.checklist, 'review_run_design')).toBe(true);
      expect(RunChecklistService.isItemCompleted(updated.checklist, 'review_stop_rules')).toBe(false);
    });
  });

  describe('getItem', () => {
    it('should return the requested item', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const item = RunChecklistService.getItem(checklist, 'review_run_design');

      expect(item).toBeDefined();
      expect(item?.id).toBe('review_run_design');
      expect(item?.label).toBe('Review Run Design');
    });

    it('should return undefined for non-existent item', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const item = RunChecklistService.getItem(checklist, 'invalid' as ManualModeChecklistItemId);

      expect(item).toBeUndefined();
    });
  });

  describe('getPendingRequiredItems', () => {
    it('should return all required pending items', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const updated = RunChecklistService.completeItem(checklist, 'review_run_design');
      const pending = RunChecklistService.getPendingRequiredItems(updated.checklist);

      expect(pending.length).toBe(5);
      expect(pending.every(item => item.status === 'pending')).toBe(true);
      expect(pending.every(item => item.required === true)).toBe(true);
    });
  });

  describe('validate', () => {
    it('should validate a correct checklist', () => {
      const checklist = RunChecklistService.createChecklist('run_01', 'manual');
      const result = RunChecklistService.validate(checklist);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect duplicate item IDs', () => {
      const checklist: RunChecklist = {
        runId: 'run_01',
        operationMode: 'manual',
        items: [
          { id: 'review_run_design', label: 'Test', description: '', required: true, status: 'pending' },
          { id: 'review_run_design', label: 'Duplicate', description: '', required: true, status: 'pending' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = RunChecklistService.validate(checklist);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
    });

    it('should detect skipped required items', () => {
      const checklist: RunChecklist = {
        runId: 'run_01',
        operationMode: 'manual',
        items: [
          { id: 'review_run_design', label: 'Test', description: '', required: true, status: 'skipped' },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const result = RunChecklistService.validate(checklist);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('cannot be skipped'))).toBe(true);
    });
  });

  describe('JSON serialization', () => {
    it('should serialize and deserialize checklist correctly', () => {
      const original = RunChecklistService.createChecklist('run_01', 'manual');
      const json = RunChecklistService.toJSON(original);
      const restored = RunChecklistService.fromJSON(json);

      expect(restored).not.toBeNull();
      expect(restored?.runId).toBe(original.runId);
      expect(restored?.items.length).toBe(original.items.length);
    });

    it('should return null for invalid JSON', () => {
      const result = RunChecklistService.fromJSON('invalid json');

      expect(result).toBeNull();
    });
  });

  describe('mergeWithTemplate', () => {
    it('should preserve completed items when merging', () => {
      const original = RunChecklistService.createChecklist('run_01', 'manual');
      const completed = RunChecklistService.completeItem(original, 'review_run_design', 'user_01');

      const merged = RunChecklistService.mergeWithTemplate(completed.checklist, 'manual');

      const item = merged.items.find(i => i.id === 'review_run_design');
      expect(item?.status).toBe('completed');
      expect(item?.completedByUserId).toBe('user_01');
    });

    it('should update required flags when changing operation mode', () => {
      const original = RunChecklistService.createChecklist('run_01', 'manual');
      const completed = RunChecklistService.completeItem(original, 'review_run_design');

      const merged = RunChecklistService.mergeWithTemplate(completed.checklist, 'hybrid');

      // In hybrid mode, only confirm_start is required
      const reviewItem = merged.items.find(i => i.id === 'review_run_design');
      expect(reviewItem?.required).toBe(false);
      expect(reviewItem?.status).toBe('completed'); // Status preserved

      const confirmItem = merged.items.find(i => i.id === 'confirm_start');
      expect(confirmItem?.required).toBe(true);
    });
  });
});
