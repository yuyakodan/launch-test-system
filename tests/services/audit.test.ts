/**
 * Audit Service Tests
 */

import { describe, it, expect } from 'vitest';
import { computeHash, computeAuditLogHash, hashIP } from '../../src/services/audit.js';

describe('Audit Service', () => {
  describe('computeHash', () => {
    it('should compute SHA-256 hash', async () => {
      const hash = await computeHash('test');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64); // SHA-256 produces 64 hex characters
    });

    it('should produce consistent hashes', async () => {
      const hash1 = await computeHash('same input');
      const hash2 = await computeHash('same input');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await computeHash('input1');
      const hash2 = await computeHash('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', async () => {
      const hash = await computeHash('');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should handle special characters', async () => {
      const hash = await computeHash('日本語テスト!@#$%^&*()');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });

  describe('computeAuditLogHash', () => {
    const baseInput = {
      id: '01HGXK9J2V8M3N4P5Q6R7S8T9W',
      tenantId: '01HGXK9J2V8M3N4P5Q6R7S8T9X',
      actorUserId: '01HGXK9J2V8M3N4P5Q6R7S8T9Y',
      action: 'create',
      targetType: 'run',
      targetId: '01HGXK9J2V8M3N4P5Q6R7S8T9Z',
      beforeJson: '{}',
      afterJson: '{"name": "Test Run"}',
      prevHash: null,
      requestId: '01HGXK9J2V8M3N4P5Q6R7S8TAA',
      tsMs: 1700000000000,
    };

    it('should compute hash for audit log entry', async () => {
      const hash = await computeAuditLogHash(baseInput);
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should produce consistent hashes', async () => {
      const hash1 = await computeAuditLogHash(baseInput);
      const hash2 = await computeAuditLogHash(baseInput);
      expect(hash1).toBe(hash2);
    });

    it('should change hash when any field changes', async () => {
      const originalHash = await computeAuditLogHash(baseInput);

      // Change each field and verify hash changes
      const changedId = await computeAuditLogHash({
        ...baseInput,
        id: '01HGXK9J2V8M3N4P5Q6R7S8TAB',
      });
      expect(changedId).not.toBe(originalHash);

      const changedAction = await computeAuditLogHash({
        ...baseInput,
        action: 'update',
      });
      expect(changedAction).not.toBe(originalHash);

      const changedTimestamp = await computeAuditLogHash({
        ...baseInput,
        tsMs: 1700000001000,
      });
      expect(changedTimestamp).not.toBe(originalHash);
    });

    it('should handle null actorUserId', async () => {
      const hash = await computeAuditLogHash({
        ...baseInput,
        actorUserId: null,
      });
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should handle null prevHash', async () => {
      const hash1 = await computeAuditLogHash({
        ...baseInput,
        prevHash: null,
      });

      const hash2 = await computeAuditLogHash({
        ...baseInput,
        prevHash: 'somehash123',
      });

      expect(hash1).not.toBe(hash2);
    });

    it('should include prevHash in chain calculation', async () => {
      const hash1 = await computeAuditLogHash({
        ...baseInput,
        prevHash: 'hash1',
      });

      const hash2 = await computeAuditLogHash({
        ...baseInput,
        prevHash: 'hash2',
      });

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('hashIP', () => {
    it('should hash IP address', async () => {
      const hash = await hashIP('192.168.1.1');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should produce consistent hashes for same IP', async () => {
      const hash1 = await hashIP('10.0.0.1');
      const hash2 = await hashIP('10.0.0.1');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different IPs', async () => {
      const hash1 = await hashIP('192.168.1.1');
      const hash2 = await hashIP('192.168.1.2');
      expect(hash1).not.toBe(hash2);
    });

    it('should not produce same hash as direct hash (due to salt)', async () => {
      const ip = '192.168.1.1';
      const directHash = await computeHash(ip);
      const saltedHash = await hashIP(ip);
      expect(directHash).not.toBe(saltedHash);
    });

    it('should handle IPv6 addresses', async () => {
      const hash = await hashIP('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });
  });
});
