/**
 * RBAC Middleware Tests
 */

import { describe, it, expect } from 'vitest';
import {
  roleHierarchy,
  getRoleIndex,
  hasMinimumRole,
  getRoleCapabilities,
  hasPermission,
  getPermissionsForRole,
  canAccessTenant,
} from '../../src/middleware/rbac.js';
import type { MembershipRole } from '../../src/types/auth.js';

describe('RBAC Middleware', () => {
  describe('roleHierarchy', () => {
    it('should have correct order', () => {
      expect(roleHierarchy).toEqual(['viewer', 'reviewer', 'operator', 'owner']);
    });
  });

  describe('getRoleIndex', () => {
    it('should return correct index for each role', () => {
      expect(getRoleIndex('viewer')).toBe(0);
      expect(getRoleIndex('reviewer')).toBe(1);
      expect(getRoleIndex('operator')).toBe(2);
      expect(getRoleIndex('owner')).toBe(3);
    });

    it('should return -1 for invalid role', () => {
      expect(getRoleIndex('invalid' as MembershipRole)).toBe(-1);
    });
  });

  describe('hasMinimumRole', () => {
    it('should return true when user role equals minimum role', () => {
      expect(hasMinimumRole('viewer', 'viewer')).toBe(true);
      expect(hasMinimumRole('reviewer', 'reviewer')).toBe(true);
      expect(hasMinimumRole('operator', 'operator')).toBe(true);
      expect(hasMinimumRole('owner', 'owner')).toBe(true);
    });

    it('should return true when user role exceeds minimum role', () => {
      expect(hasMinimumRole('owner', 'viewer')).toBe(true);
      expect(hasMinimumRole('owner', 'reviewer')).toBe(true);
      expect(hasMinimumRole('owner', 'operator')).toBe(true);
      expect(hasMinimumRole('operator', 'viewer')).toBe(true);
      expect(hasMinimumRole('operator', 'reviewer')).toBe(true);
      expect(hasMinimumRole('reviewer', 'viewer')).toBe(true);
    });

    it('should return false when user role is below minimum role', () => {
      expect(hasMinimumRole('viewer', 'owner')).toBe(false);
      expect(hasMinimumRole('viewer', 'operator')).toBe(false);
      expect(hasMinimumRole('viewer', 'reviewer')).toBe(false);
      expect(hasMinimumRole('reviewer', 'owner')).toBe(false);
      expect(hasMinimumRole('reviewer', 'operator')).toBe(false);
      expect(hasMinimumRole('operator', 'owner')).toBe(false);
    });

    it('should return false for invalid roles', () => {
      expect(hasMinimumRole('invalid' as MembershipRole, 'viewer')).toBe(false);
      expect(hasMinimumRole('viewer', 'invalid' as MembershipRole)).toBe(false);
    });
  });

  describe('getRoleCapabilities', () => {
    it('should return correct capabilities for owner', () => {
      const caps = getRoleCapabilities('owner');
      expect(caps).toEqual({
        canView: true,
        canReview: true,
        canOperate: true,
        canAdmin: true,
      });
    });

    it('should return correct capabilities for operator', () => {
      const caps = getRoleCapabilities('operator');
      expect(caps).toEqual({
        canView: true,
        canReview: true,
        canOperate: true,
        canAdmin: false,
      });
    });

    it('should return correct capabilities for reviewer', () => {
      const caps = getRoleCapabilities('reviewer');
      expect(caps).toEqual({
        canView: true,
        canReview: true,
        canOperate: false,
        canAdmin: false,
      });
    });

    it('should return correct capabilities for viewer', () => {
      const caps = getRoleCapabilities('viewer');
      expect(caps).toEqual({
        canView: true,
        canReview: false,
        canOperate: false,
        canAdmin: false,
      });
    });
  });

  describe('hasPermission', () => {
    describe('project permissions', () => {
      it('should allow viewer to read projects', () => {
        expect(hasPermission('viewer', 'project', 'read')).toBe(true);
      });

      it('should allow operator to create projects', () => {
        expect(hasPermission('operator', 'project', 'create')).toBe(true);
      });

      it('should not allow viewer to create projects', () => {
        expect(hasPermission('viewer', 'project', 'create')).toBe(false);
      });

      it('should only allow owner to delete projects', () => {
        expect(hasPermission('owner', 'project', 'delete')).toBe(true);
        expect(hasPermission('operator', 'project', 'delete')).toBe(false);
        expect(hasPermission('reviewer', 'project', 'delete')).toBe(false);
        expect(hasPermission('viewer', 'project', 'delete')).toBe(false);
      });
    });

    describe('run permissions', () => {
      it('should allow reviewer to approve runs', () => {
        expect(hasPermission('reviewer', 'run', 'approve')).toBe(true);
        expect(hasPermission('operator', 'run', 'approve')).toBe(true);
        expect(hasPermission('owner', 'run', 'approve')).toBe(true);
      });

      it('should not allow viewer to approve runs', () => {
        expect(hasPermission('viewer', 'run', 'approve')).toBe(false);
      });

      it('should allow operator to launch runs', () => {
        expect(hasPermission('operator', 'run', 'launch')).toBe(true);
        expect(hasPermission('owner', 'run', 'launch')).toBe(true);
      });

      it('should not allow reviewer to launch runs', () => {
        expect(hasPermission('reviewer', 'run', 'launch')).toBe(false);
      });
    });

    describe('variant permissions', () => {
      it('should allow reviewer to approve variants', () => {
        expect(hasPermission('reviewer', 'variant', 'approve')).toBe(true);
      });

      it('should allow reviewer to reject variants', () => {
        expect(hasPermission('reviewer', 'variant', 'reject')).toBe(true);
      });

      it('should not allow viewer to approve variants', () => {
        expect(hasPermission('viewer', 'variant', 'approve')).toBe(false);
      });
    });

    describe('meta connection permissions', () => {
      it('should only allow owner to manage meta connections', () => {
        expect(hasPermission('owner', 'meta_connection', 'create')).toBe(true);
        expect(hasPermission('owner', 'meta_connection', 'update')).toBe(true);
        expect(hasPermission('owner', 'meta_connection', 'delete')).toBe(true);

        expect(hasPermission('operator', 'meta_connection', 'create')).toBe(false);
        expect(hasPermission('operator', 'meta_connection', 'update')).toBe(false);
        expect(hasPermission('reviewer', 'meta_connection', 'delete')).toBe(false);
      });

      it('should allow all roles to read meta connections', () => {
        expect(hasPermission('viewer', 'meta_connection', 'read')).toBe(true);
      });
    });

    describe('audit log permissions', () => {
      it('should only allow owner to read audit logs', () => {
        expect(hasPermission('owner', 'audit_log', 'read')).toBe(true);
        expect(hasPermission('operator', 'audit_log', 'read')).toBe(false);
        expect(hasPermission('reviewer', 'audit_log', 'read')).toBe(false);
        expect(hasPermission('viewer', 'audit_log', 'read')).toBe(false);
      });
    });

    describe('unknown permissions', () => {
      it('should default to owner-only for unknown resources', () => {
        expect(hasPermission('owner', 'unknown', 'unknown')).toBe(true);
        expect(hasPermission('operator', 'unknown', 'unknown')).toBe(false);
      });
    });
  });

  describe('getPermissionsForRole', () => {
    it('should return more permissions for higher roles', () => {
      const viewerPerms = getPermissionsForRole('viewer');
      const reviewerPerms = getPermissionsForRole('reviewer');
      const operatorPerms = getPermissionsForRole('operator');
      const ownerPerms = getPermissionsForRole('owner');

      expect(viewerPerms.length).toBeLessThanOrEqual(reviewerPerms.length);
      expect(reviewerPerms.length).toBeLessThanOrEqual(operatorPerms.length);
      expect(operatorPerms.length).toBeLessThanOrEqual(ownerPerms.length);
    });

    it('should include read permissions for viewer', () => {
      const perms = getPermissionsForRole('viewer');
      const hasRead = perms.some(
        (p) => p.action === 'read' && p.resource === 'project'
      );
      expect(hasRead).toBe(true);
    });
  });

  describe('canAccessTenant', () => {
    it('should return true for matching tenant IDs', () => {
      const tenantId = '01HGXK9J2V8M3N4P5Q6R7S8T9X';
      expect(canAccessTenant(tenantId, tenantId)).toBe(true);
    });

    it('should return false for different tenant IDs', () => {
      expect(
        canAccessTenant(
          '01HGXK9J2V8M3N4P5Q6R7S8T9X',
          '01HGXK9J2V8M3N4P5Q6R7S8T9Y'
        )
      ).toBe(false);
    });
  });
});
