/**
 * Authentication Middleware Tests
 */

import { describe, it, expect } from 'vitest';
import {
  extractBearerToken,
  decodeJWT,
  validateJWTPayload,
  generateRequestId,
} from '../../src/middleware/auth.js';
import type { JWTPayload } from '../../src/types/auth.js';

describe('Auth Middleware', () => {
  describe('extractBearerToken', () => {
    it('should extract token from valid Bearer header', () => {
      const token = extractBearerToken('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should return null for missing header', () => {
      const token = extractBearerToken(undefined);
      expect(token).toBeNull();
    });

    it('should return null for non-Bearer header', () => {
      const token = extractBearerToken('Basic abc123');
      expect(token).toBeNull();
    });

    it('should return null for malformed header', () => {
      const token = extractBearerToken('Bearer');
      expect(token).toBeNull();
    });

    it('should handle case-insensitive Bearer prefix', () => {
      const token = extractBearerToken('bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should handle BEARER uppercase', () => {
      const token = extractBearerToken('BEARER abc123');
      expect(token).toBe('abc123');
    });
  });

  describe('decodeJWT', () => {
    it('should decode valid JWT payload', () => {
      // Create a valid JWT structure (header.payload.signature)
      const payload: JWTPayload = {
        sub: '01HGXK9J2V8M3N4P5Q6R7S8T9W',
        email: 'user@example.com',
        name: 'Test User',
        tenantId: '01HGXK9J2V8M3N4P5Q6R7S8T9X',
        role: 'operator',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payloadBase64 = btoa(JSON.stringify(payload));
      const signature = 'test-signature';
      const token = `${header}.${payloadBase64}.${signature}`;

      const decoded = decodeJWT(token);
      expect(decoded).toEqual(payload);
    });

    it('should return null for invalid token format', () => {
      expect(decodeJWT('invalid')).toBeNull();
      expect(decodeJWT('only.two')).toBeNull();
      expect(decodeJWT('')).toBeNull();
    });

    it('should return null for invalid base64', () => {
      expect(decodeJWT('a.!!!invalid!!.c')).toBeNull();
    });
  });

  describe('validateJWTPayload', () => {
    const validPayload: JWTPayload = {
      sub: '01HGXK9J2V8M3N4P5Q6R7S8T9W',
      email: 'user@example.com',
      tenantId: '01HGXK9J2V8M3N4P5Q6R7S8T9X',
      role: 'operator',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    it('should return null for valid payload', () => {
      const error = validateJWTPayload(validPayload);
      expect(error).toBeNull();
    });

    it('should return error for expired token', () => {
      const expiredPayload: JWTPayload = {
        ...validPayload,
        exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      };

      const error = validateJWTPayload(expiredPayload);
      expect(error).not.toBeNull();
      expect(error?.type).toBe('expired_token');
    });

    it('should return error for missing sub', () => {
      const invalidPayload = {
        ...validPayload,
        sub: '',
      } as JWTPayload;

      const error = validateJWTPayload(invalidPayload);
      expect(error).not.toBeNull();
      expect(error?.type).toBe('invalid_token');
    });

    it('should return error for missing tenantId', () => {
      const invalidPayload = {
        ...validPayload,
        tenantId: '',
      } as JWTPayload;

      const error = validateJWTPayload(invalidPayload);
      expect(error).not.toBeNull();
      expect(error?.type).toBe('invalid_token');
    });

    it('should return error for invalid role', () => {
      const invalidPayload = {
        ...validPayload,
        role: 'superadmin' as never,
      };

      const error = validateJWTPayload(invalidPayload);
      expect(error).not.toBeNull();
      expect(error?.type).toBe('invalid_token');
    });

    it('should accept all valid roles', () => {
      const roles = ['owner', 'operator', 'reviewer', 'viewer'] as const;

      for (const role of roles) {
        const payload: JWTPayload = { ...validPayload, role };
        const error = validateJWTPayload(payload);
        expect(error).toBeNull();
      }
    });
  });

  describe('generateRequestId', () => {
    it('should generate a ULID', () => {
      const requestId = generateRequestId();
      expect(requestId).toBeDefined();
      expect(requestId.length).toBe(26);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateRequestId());
      }
      expect(ids.size).toBe(100);
    });
  });
});
