/**
 * Authentication Middleware
 * Handles Bearer token verification, JWT decoding, and user context setup
 */

import type { Context, MiddlewareHandler } from 'hono';
import type { Env } from '../types/env.js';
import type {
  AuthContext,
  AuthError,
  AuthErrorType,
  JWTPayload,
} from '../types/auth.js';
import { ulid } from '../lib/ulid.js';

/**
 * Variables stored in Hono context
 */
export interface AuthVariables {
  auth: AuthContext;
}

/**
 * Create an authentication error response
 */
function createAuthError(type: AuthErrorType, message: string): AuthError {
  const statusCodes: Record<AuthErrorType, number> = {
    missing_token: 401,
    invalid_token: 401,
    expired_token: 401,
    insufficient_permissions: 403,
    tenant_mismatch: 403,
    user_disabled: 403,
  };

  return {
    type,
    message,
    statusCode: statusCodes[type],
  };
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Decode JWT token without verification (for development/testing)
 * In production, use proper JWT verification with secret key
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (second part)
    const payloadBase64 = parts[1];
    // Handle base64url encoding
    const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = atob(base64);
    const payload = JSON.parse(jsonPayload) as JWTPayload;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Verify JWT token signature (placeholder for production implementation)
 * In production, implement proper HMAC-SHA256 or RSA signature verification
 */
export function verifyJWTSignature(
  _token: string,
  _secret: string
): boolean {
  // TODO: Implement proper signature verification
  // For now, return true for development
  return true;
}

/**
 * Validate JWT payload
 */
export function validateJWTPayload(payload: JWTPayload): AuthError | null {
  const now = Math.floor(Date.now() / 1000);

  // Check expiration
  if (payload.exp && payload.exp < now) {
    return createAuthError('expired_token', 'Token has expired');
  }

  // Validate required fields
  if (!payload.sub || !payload.tenantId || !payload.role) {
    return createAuthError('invalid_token', 'Token is missing required fields');
  }

  // Validate role
  const validRoles = ['owner', 'operator', 'reviewer', 'viewer'];
  if (!validRoles.includes(payload.role)) {
    return createAuthError('invalid_token', 'Invalid role in token');
  }

  return null;
}

/**
 * Generate a request ID for tracing
 */
export function generateRequestId(): string {
  return ulid();
}

/**
 * Authentication middleware factory
 * Creates a middleware that verifies Bearer tokens and populates auth context
 */
export function authMiddleware(): MiddlewareHandler<{
  Bindings: Env;
  Variables: AuthVariables;
}> {
  return async (c, next) => {
    const requestId = generateRequestId();

    // Extract Bearer token
    const authHeader = c.req.header('Authorization');
    const token = extractBearerToken(authHeader);

    if (!token) {
      const error = createAuthError('missing_token', 'Authorization header with Bearer token is required');
      return c.json(
        {
          status: 'error',
          error: error.type,
          message: error.message,
          requestId,
        },
        error.statusCode as 401 | 403
      );
    }

    // Decode JWT
    const payload = decodeJWT(token);
    if (!payload) {
      const error = createAuthError('invalid_token', 'Invalid token format');
      return c.json(
        {
          status: 'error',
          error: error.type,
          message: error.message,
          requestId,
        },
        error.statusCode as 401 | 403
      );
    }

    // Validate payload
    const validationError = validateJWTPayload(payload);
    if (validationError) {
      return c.json(
        {
          status: 'error',
          error: validationError.type,
          message: validationError.message,
          requestId,
        },
        validationError.statusCode as 401 | 403
      );
    }

    // Create auth context
    const authContext: AuthContext = {
      userId: payload.sub,
      email: payload.email,
      name: payload.name,
      tenantId: payload.tenantId,
      role: payload.role,
      tokenId: payload.jti,
      requestId,
    };

    // Store in context
    c.set('auth', authContext);

    await next();
  };
}

/**
 * Optional authentication middleware
 * Attempts to authenticate but allows unauthenticated requests
 */
export function optionalAuthMiddleware(): MiddlewareHandler<{
  Bindings: Env;
  Variables: Partial<AuthVariables>;
}> {
  return async (c, next) => {
    const requestId = generateRequestId();

    // Extract Bearer token
    const authHeader = c.req.header('Authorization');
    const token = extractBearerToken(authHeader);

    if (token) {
      const payload = decodeJWT(token);
      if (payload) {
        const validationError = validateJWTPayload(payload);
        if (!validationError) {
          const authContext: AuthContext = {
            userId: payload.sub,
            email: payload.email,
            name: payload.name,
            tenantId: payload.tenantId,
            role: payload.role,
            tokenId: payload.jti,
            requestId,
          };
          c.set('auth', authContext);
        }
      }
    }

    await next();
  };
}

/**
 * Get auth context from Hono context
 * Throws if not authenticated
 */
export function getAuthContext(c: Context<{ Variables: AuthVariables }>): AuthContext {
  const auth = c.get('auth');
  if (!auth) {
    throw new Error('Authentication required but no auth context found');
  }
  return auth;
}

/**
 * Check if request is authenticated
 */
export function isAuthenticated(c: Context<{ Variables: Partial<AuthVariables> }>): boolean {
  return c.get('auth') !== undefined;
}
