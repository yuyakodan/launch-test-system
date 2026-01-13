/**
 * Audit Logging Service
 * Provides tamper-evident audit logging with hash chain verification
 */

import type { AuditLog } from '../types/entities.js';
import type { AuditAction, AuditLogInput } from '../types/auth.js';
import { ulid } from '../lib/ulid.js';

/**
 * Audit log entry for storage
 */
export interface AuditLogEntry {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: string;
  afterJson: string;
  prevHash: string | null;
  hash: string;
  requestId: string;
  tsMs: number;
  ipHash: string | null;
  userAgent: string | null;
}

/**
 * Hash input data for audit log entry
 */
interface HashInput {
  id: string;
  tenantId: string;
  actorUserId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  beforeJson: string;
  afterJson: string;
  prevHash: string | null;
  requestId: string;
  tsMs: number;
}

/**
 * Convert string to ArrayBuffer for Web Crypto API
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  // Create a new ArrayBuffer to ensure type compatibility
  const buffer = new ArrayBuffer(encoded.length);
  new Uint8Array(buffer).set(encoded);
  return buffer;
}

/**
 * Convert ArrayBuffer to hex string
 */
function arrayBufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash using Web Crypto API
 * Compatible with Cloudflare Workers
 */
export async function computeHash(data: string): Promise<string> {
  const buffer = stringToArrayBuffer(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return arrayBufferToHex(hashBuffer);
}

/**
 * Compute hash for an audit log entry
 * Creates a deterministic hash of all significant fields
 */
export async function computeAuditLogHash(input: HashInput): Promise<string> {
  const hashData = [
    input.id,
    input.tenantId,
    input.actorUserId ?? '',
    input.action,
    input.targetType,
    input.targetId,
    input.beforeJson,
    input.afterJson,
    input.prevHash ?? '',
    input.requestId,
    input.tsMs.toString(),
  ].join('|');

  return computeHash(hashData);
}

/**
 * Hash IP address for privacy (one-way hash)
 */
export async function hashIP(ip: string): Promise<string> {
  // Add a salt to prevent rainbow table attacks
  const salted = `audit-ip-salt:${ip}`;
  return computeHash(salted);
}

/**
 * Audit Service class for managing audit logs
 */
export class AuditService {
  private db: D1Database;
  private lastHash: string | null = null;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Get the hash of the last audit log entry for a tenant
   */
  async getLastHash(tenantId: string): Promise<string | null> {
    const result = await this.db
      .prepare(
        `SELECT hash FROM audit_logs
         WHERE tenant_id = ?
         ORDER BY ts_ms DESC
         LIMIT 1`
      )
      .bind(tenantId)
      .first<{ hash: string }>();

    return result?.hash ?? null;
  }

  /**
   * Create a new audit log entry
   */
  async log(input: AuditLogInput): Promise<AuditLogEntry> {
    const id = ulid();
    const tsMs = Date.now();

    // Get previous hash for chain
    const prevHash = await this.getLastHash(input.tenantId);

    // Serialize before/after JSON
    const beforeJson = input.before ? JSON.stringify(input.before) : '{}';
    const afterJson = input.after ? JSON.stringify(input.after) : '{}';

    // Compute hash
    const hash = await computeAuditLogHash({
      id,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeJson,
      afterJson,
      prevHash,
      requestId: input.requestId,
      tsMs,
    });

    const entry: AuditLogEntry = {
      id,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeJson,
      afterJson,
      prevHash,
      hash,
      requestId: input.requestId,
      tsMs,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent ?? null,
    };

    // Insert into database
    await this.db
      .prepare(
        `INSERT INTO audit_logs
         (id, tenant_id, actor_user_id, action, target_type, target_id,
          before_json, after_json, prev_hash, hash, request_id, ts_ms,
          ip_hash, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        entry.id,
        entry.tenantId,
        entry.actorUserId,
        entry.action,
        entry.targetType,
        entry.targetId,
        entry.beforeJson,
        entry.afterJson,
        entry.prevHash,
        entry.hash,
        entry.requestId,
        entry.tsMs,
        entry.ipHash,
        entry.userAgent
      )
      .run();

    // Update local cache
    this.lastHash = hash;

    return entry;
  }

  /**
   * Verify the integrity of the audit log chain for a tenant
   * Returns true if all hashes are valid
   */
  async verifyChain(tenantId: string, limit = 1000): Promise<{
    valid: boolean;
    errors: Array<{ id: string; error: string }>;
    entriesChecked: number;
  }> {
    const entries = await this.db
      .prepare(
        `SELECT * FROM audit_logs
         WHERE tenant_id = ?
         ORDER BY ts_ms ASC
         LIMIT ?`
      )
      .bind(tenantId, limit)
      .all<AuditLogEntry>();

    const errors: Array<{ id: string; error: string }> = [];
    let prevHash: string | null = null;

    for (const entry of entries.results) {
      // Check prev_hash chain
      if (entry.prevHash !== prevHash) {
        errors.push({
          id: entry.id,
          error: `Chain broken: expected prev_hash ${prevHash}, got ${entry.prevHash}`,
        });
      }

      // Recompute hash and verify
      const expectedHash = await computeAuditLogHash({
        id: entry.id,
        tenantId: entry.tenantId,
        actorUserId: entry.actorUserId,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        beforeJson: entry.beforeJson,
        afterJson: entry.afterJson,
        prevHash: entry.prevHash,
        requestId: entry.requestId,
        tsMs: entry.tsMs,
      });

      if (entry.hash !== expectedHash) {
        errors.push({
          id: entry.id,
          error: `Hash mismatch: expected ${expectedHash}, got ${entry.hash}`,
        });
      }

      prevHash = entry.hash;
    }

    return {
      valid: errors.length === 0,
      errors,
      entriesChecked: entries.results.length,
    };
  }

  /**
   * Get audit logs for a tenant with pagination
   */
  async getLogs(
    tenantId: string,
    options: {
      limit?: number;
      offset?: number;
      targetType?: string;
      targetId?: string;
      actorUserId?: string;
      action?: AuditAction;
      startTime?: number;
      endTime?: number;
    } = {}
  ): Promise<{ logs: AuditLogEntry[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    let whereClause = 'WHERE tenant_id = ?';
    const params: (string | number)[] = [tenantId];

    if (options.targetType) {
      whereClause += ' AND target_type = ?';
      params.push(options.targetType);
    }

    if (options.targetId) {
      whereClause += ' AND target_id = ?';
      params.push(options.targetId);
    }

    if (options.actorUserId) {
      whereClause += ' AND actor_user_id = ?';
      params.push(options.actorUserId);
    }

    if (options.action) {
      whereClause += ' AND action = ?';
      params.push(options.action);
    }

    if (options.startTime) {
      whereClause += ' AND ts_ms >= ?';
      params.push(options.startTime);
    }

    if (options.endTime) {
      whereClause += ' AND ts_ms <= ?';
      params.push(options.endTime);
    }

    // Get total count
    const countResult = await this.db
      .prepare(`SELECT COUNT(*) as count FROM audit_logs ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const total = countResult?.count ?? 0;

    // Get paginated results
    const logs = await this.db
      .prepare(
        `SELECT * FROM audit_logs
         ${whereClause}
         ORDER BY ts_ms DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all<AuditLogEntry>();

    return {
      logs: logs.results,
      total,
    };
  }

  /**
   * Get audit logs for a specific target
   */
  async getLogsForTarget(
    tenantId: string,
    targetType: string,
    targetId: string
  ): Promise<AuditLogEntry[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM audit_logs
         WHERE tenant_id = ? AND target_type = ? AND target_id = ?
         ORDER BY ts_ms DESC`
      )
      .bind(tenantId, targetType, targetId)
      .all<AuditLogEntry>();

    return result.results;
  }

  /**
   * Get audit logs by request ID (for debugging)
   */
  async getLogsByRequestId(requestId: string): Promise<AuditLogEntry[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM audit_logs
         WHERE request_id = ?
         ORDER BY ts_ms ASC`
      )
      .bind(requestId)
      .all<AuditLogEntry>();

    return result.results;
  }
}

/**
 * Create audit log helper for use in route handlers
 * Extracts common fields from auth context and request
 */
export function createAuditLogHelper(
  auditService: AuditService,
  authContext: {
    userId: string;
    tenantId: string;
    requestId: string;
  },
  request?: {
    ipHash?: string;
    userAgent?: string;
  }
) {
  return {
    /**
     * Log an action
     */
    log: async (
      action: AuditAction,
      targetType: string,
      targetId: string,
      options: {
        before?: Record<string, unknown>;
        after?: Record<string, unknown>;
      } = {}
    ): Promise<AuditLogEntry> => {
      return auditService.log({
        tenantId: authContext.tenantId,
        actorUserId: authContext.userId,
        action,
        targetType,
        targetId,
        before: options.before,
        after: options.after,
        requestId: authContext.requestId,
        ipHash: request?.ipHash,
        userAgent: request?.userAgent,
      });
    },
  };
}
