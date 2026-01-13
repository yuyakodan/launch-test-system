/**
 * Authentication and Authorization Type Definitions
 * Supports JWT-based authentication with RBAC
 */

import type { MembershipRole } from './entities.js';

// Re-export MembershipRole for convenience
export type { MembershipRole };

/**
 * JWT token payload structure
 */
export interface JWTPayload {
  /** Subject - User ID (ULID) */
  sub: string;
  /** Email address */
  email: string;
  /** User display name */
  name?: string;
  /** Tenant ID (ULID) */
  tenantId: string;
  /** User's role in the tenant */
  role: MembershipRole;
  /** Issued at timestamp (Unix seconds) */
  iat: number;
  /** Expiration timestamp (Unix seconds) */
  exp: number;
  /** JWT ID for token tracking */
  jti?: string;
}

/**
 * Authenticated user context
 * Populated by auth middleware and available in request context
 */
export interface AuthContext {
  /** User ID (ULID) */
  userId: string;
  /** User email */
  email: string;
  /** User display name */
  name?: string;
  /** Current tenant ID */
  tenantId: string;
  /** User's role in the current tenant */
  role: MembershipRole;
  /** JWT token ID for audit purposes */
  tokenId?: string;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * Role hierarchy for permission checks
 * Higher index = more permissions
 */
export const ROLE_HIERARCHY: readonly MembershipRole[] = [
  'viewer',
  'reviewer',
  'operator',
  'owner',
] as const;

/**
 * Role capabilities mapping
 * Defines what each role can do
 */
export interface RoleCapabilities {
  /** Can view resources */
  canView: boolean;
  /** Can review and approve/reject */
  canReview: boolean;
  /** Can create and modify resources */
  canOperate: boolean;
  /** Full administrative access */
  canAdmin: boolean;
}

/**
 * Permission definition for an action
 */
export interface Permission {
  /** Resource type (e.g., 'run', 'project', 'variant') */
  resource: string;
  /** Action type (e.g., 'read', 'create', 'update', 'delete', 'approve') */
  action: string;
  /** Minimum role required */
  minRole: MembershipRole;
}

/**
 * Authentication error types
 */
export type AuthErrorType =
  | 'missing_token'
  | 'invalid_token'
  | 'expired_token'
  | 'insufficient_permissions'
  | 'tenant_mismatch'
  | 'user_disabled';

/**
 * Authentication error response
 */
export interface AuthError {
  type: AuthErrorType;
  message: string;
  statusCode: number;
}

/**
 * Guardrail check result
 */
export interface GuardrailCheckResult {
  passed: boolean;
  checks: GuardrailCheck[];
}

/**
 * Individual guardrail check
 */
export interface GuardrailCheck {
  name: string;
  passed: boolean;
  message?: string;
  severity: 'error' | 'warning';
}

/**
 * Run configuration for guardrail validation
 */
export interface RunGuardrailConfig {
  /** Budget cap in currency units */
  budgetCap?: number;
  /** Stop rules DSL (JSON string) */
  stopRulesDsl?: string;
  /** Approval status */
  approvalStatus?: 'draft' | 'submitted' | 'approved' | 'rejected';
  /** Operation mode */
  operationMode?: 'manual' | 'hybrid' | 'auto';
}

/**
 * Audit action types for logging
 */
export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'publish'
  | 'archive'
  | 'launch'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'complete'
  | 'login'
  | 'logout';

/**
 * Audit log entry input
 */
export interface AuditLogInput {
  tenantId: string;
  actorUserId: string;
  action: AuditAction;
  targetType: string;
  targetId: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId: string;
  ipHash?: string;
  userAgent?: string;
}
