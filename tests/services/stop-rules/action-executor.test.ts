import { describe, it, expect, vi } from 'vitest';
import {
  ActionExecutor,
  createActionExecutor,
  createMockDependencies,
  type ActionExecutorDependencies,
  type ActionExecutorContext,
} from '../../../src/services/stop-rules/action-executor.js';
import type { ActionToExecute } from '../../../src/types/stop-rules.js';

describe('ActionExecutor', () => {
  const createContext = (overrides: Partial<ActionExecutorContext> = {}): ActionExecutorContext => ({
    tenantId: 'tenant_123',
    runId: 'run_456',
    evaluatedAt: new Date().toISOString(),
    ...overrides,
  });

  describe('executeAll', () => {
    it('should execute all actions', async () => {
      const deps = createMockDependencies();
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'notify_only', triggeredByRuleId: 'rule1', severity: 'medium', reason: 'Test notification' },
        { type: 'create_incident', triggeredByRuleId: 'rule2', severity: 'high', reason: 'Test incident' },
      ];

      const context = createContext();
      const results = await executor.executeAll(actions, context);

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    it('should log audit for each action', async () => {
      const logAudit = vi.fn();
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        logAudit,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'notify_only', triggeredByRuleId: 'rule1', severity: 'low', reason: 'Test' },
      ];

      await executor.executeAll(actions, createContext());

      expect(logAudit).toHaveBeenCalledTimes(1);
    });
  });

  describe('pause_run', () => {
    it('should pause run and send notification', async () => {
      const pauseRun = vi.fn().mockResolvedValue(true);
      const sendNotification = vi.fn().mockResolvedValue(true);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        pauseRun,
        sendNotification,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'pause_run', triggeredByRuleId: 'rule1', severity: 'high', reason: 'Spend cap exceeded' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(true);
      expect(results[0].actionType).toBe('pause_run');
      expect(pauseRun).toHaveBeenCalledWith('run_456');
      expect(sendNotification).toHaveBeenCalled();
      expect(results[0].affectedEntities).toHaveLength(1);
      expect(results[0].affectedEntities?.[0].type).toBe('run');
    });

    it('should return failure when pause fails', async () => {
      const pauseRun = vi.fn().mockResolvedValue(false);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        pauseRun,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'pause_run', triggeredByRuleId: 'rule1', severity: 'high', reason: 'Test' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(false);
      expect(results[0].errorMessage).toBe('Failed to pause run');
    });
  });

  describe('pause_bundle', () => {
    it('should pause bundles and send notification', async () => {
      const pauseBundles = vi.fn().mockResolvedValue(['bundle1', 'bundle2']);
      const sendNotification = vi.fn().mockResolvedValue(true);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        pauseBundles,
        sendNotification,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        {
          type: 'pause_bundle',
          triggeredByRuleId: 'rule1',
          severity: 'medium',
          reason: 'CPA cap exceeded',
          targetBundleIds: ['bundle1', 'bundle2'],
        },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(true);
      expect(pauseBundles).toHaveBeenCalledWith(['bundle1', 'bundle2']);
      expect(results[0].affectedEntities).toHaveLength(2);
    });

    it('should fail when no bundle IDs specified', async () => {
      const deps = createMockDependencies();
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'pause_bundle', triggeredByRuleId: 'rule1', severity: 'medium', reason: 'Test' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(false);
      expect(results[0].errorMessage).toContain('No bundle IDs');
    });
  });

  describe('notify_only', () => {
    it('should send notification', async () => {
      const sendNotification = vi.fn().mockResolvedValue(true);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        sendNotification,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'notify_only', triggeredByRuleId: 'rule1', severity: 'low', reason: 'Warning alert' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(true);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          channel: 'slack',
          severity: 'low',
          title: 'Stop Rule Alert',
        })
      );
    });

    it('should return failure when notification fails', async () => {
      const sendNotification = vi.fn().mockResolvedValue(false);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        sendNotification,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'notify_only', triggeredByRuleId: 'rule1', severity: 'low', reason: 'Test' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(false);
      expect(results[0].errorMessage).toBe('Failed to send notification');
    });
  });

  describe('create_incident', () => {
    it('should create incident and send notification', async () => {
      const createIncident = vi.fn().mockResolvedValue('incident_789');
      const sendNotification = vi.fn().mockResolvedValue(true);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        createIncident,
        sendNotification,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        {
          type: 'create_incident',
          triggeredByRuleId: 'rule1',
          severity: 'critical',
          reason: 'Meta rejected ads',
          metadata: { rejectedCount: 5 },
        },
      ];

      const context = createContext();
      const results = await executor.executeAll(actions, context);

      expect(results[0].success).toBe(true);
      expect(createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant_123',
          runId: 'run_456',
          type: 'meta_rejected',
          severity: 'critical',
        })
      );
      expect(results[0].affectedEntities?.[0].id).toBe('incident_789');
    });

    it('should return failure when incident creation fails', async () => {
      const createIncident = vi.fn().mockResolvedValue(null);
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        createIncident,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'create_incident', triggeredByRuleId: 'rule1', severity: 'high', reason: 'Test' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(false);
      expect(results[0].errorMessage).toBe('Failed to create incident');
    });

    it('should map incident type based on metadata', async () => {
      const createIncident = vi.fn().mockResolvedValue('incident_123');
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        createIncident,
      };
      const executor = createActionExecutor(deps);

      // Test measurement_issue mapping
      const actions1: ActionToExecute[] = [
        {
          type: 'create_incident',
          triggeredByRuleId: 'rule1',
          severity: 'high',
          reason: 'Measurement gap',
          metadata: { eventGapSec: 3600 },
        },
      ];

      await executor.executeAll(actions1, createContext());

      expect(createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'measurement_issue',
        })
      );

      // Test api_outage mapping
      createIncident.mockClear();
      const actions2: ActionToExecute[] = [
        {
          type: 'create_incident',
          triggeredByRuleId: 'rule1',
          severity: 'high',
          reason: 'Sync failures',
          metadata: { currentStreak: 5 },
        },
      ];

      await executor.executeAll(actions2, createContext());

      expect(createIncident).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'api_outage',
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle exceptions gracefully', async () => {
      const pauseRun = vi.fn().mockRejectedValue(new Error('Database error'));
      const deps: ActionExecutorDependencies = {
        ...createMockDependencies(),
        pauseRun,
      };
      const executor = createActionExecutor(deps);

      const actions: ActionToExecute[] = [
        { type: 'pause_run', triggeredByRuleId: 'rule1', severity: 'high', reason: 'Test' },
      ];

      const results = await executor.executeAll(actions, createContext());

      expect(results[0].success).toBe(false);
      expect(results[0].errorMessage).toBe('Database error');
    });
  });

  describe('createMockDependencies', () => {
    it('should create working mock dependencies', async () => {
      const deps = createMockDependencies();

      expect(await deps.pauseRun('run_123')).toBe(true);
      expect(await deps.pauseBundles(['b1', 'b2'])).toEqual(['b1', 'b2']);
      expect(await deps.sendNotification({ channel: 'slack', severity: 'low', title: 'Test', message: 'Test' })).toBe(true);
      expect(await deps.createIncident({ tenantId: 't', runId: 'r', type: 'other', severity: 'low', reason: 'Test' })).toMatch(/^incident_/);
    });
  });
});
