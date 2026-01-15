/**
 * DB Migration Utility
 * Supports staged D1 to Neon migration per requirements.md section 12
 *
 * Migration phases:
 * 1. Create Neon schema
 * 2. D1 -> Neon batch transfer
 * 3. Dual-write (optional) or Run-level switch
 * 4. Read from Neon
 * 5. Write to Neon
 * 6. D1 becomes cache/fallback
 *
 * Requirements:
 * - tenant-level or run-level switching via Feature Flags
 * - Running runs should complete before switch (integrity)
 */

import type { DbBackend, TenantMigrationStatus } from '../types/feature-flags.js';
import type { FeatureFlagsService } from '../services/feature-flags.js';

/**
 * Migration batch result
 */
export interface MigrationBatchResult {
  tableName: string;
  recordsProcessed: number;
  recordsFailed: number;
  errors: string[];
  durationMs: number;
}

/**
 * Migration plan for a tenant
 */
export interface TenantMigrationPlan {
  tenantId: string;
  tables: string[];
  estimatedRecords: number;
  runningRuns: string[];
  canProceed: boolean;
  blockingReasons: string[];
}

/**
 * Run migration status
 */
export interface RunMigrationStatus {
  runId: string;
  currentBackend: DbBackend;
  migrated: boolean;
  migratedAt: string | null;
}

/**
 * Migration configuration
 */
export interface MigrationConfig {
  /** Batch size for data transfer */
  batchSize: number;
  /** Tables to migrate in order */
  tableOrder: string[];
  /** Whether to use dual-write mode */
  dualWriteEnabled: boolean;
  /** Whether to allow run-level switching */
  runLevelSwitchEnabled: boolean;
}

/**
 * Default migration configuration
 */
export const DEFAULT_MIGRATION_CONFIG: MigrationConfig = {
  batchSize: 1000,
  tableOrder: [
    'tenants',
    'users',
    'memberships',
    'projects',
    'project_assets',
    'runs',
    'intents',
    'lp_variants',
    'creative_variants',
    'ad_copies',
    'approvals',
    'deployments',
    'meta_connections',
    'meta_entities',
    'ad_bundles',
    'events',
    'insights_hourly',
    'insights_daily',
    'manual_imports',
    'decisions',
    'incidents',
    'audit_logs',
    'jobs',
    'notifications',
    'tenant_flags',
  ],
  dualWriteEnabled: false,
  runLevelSwitchEnabled: true,
};

/**
 * DB Migration Service
 * Handles staged migration from D1 to Neon
 */
export class DbMigrationService {
  private d1: D1Database;
  private featureFlagsService: FeatureFlagsService;
  private config: MigrationConfig;

  constructor(
    d1: D1Database,
    featureFlagsService: FeatureFlagsService,
    config: Partial<MigrationConfig> = {}
  ) {
    this.d1 = d1;
    this.featureFlagsService = featureFlagsService;
    this.config = { ...DEFAULT_MIGRATION_CONFIG, ...config };
  }

  /**
   * Get migration plan for a tenant
   */
  async getMigrationPlan(tenantId: string): Promise<TenantMigrationPlan> {
    const blockingReasons: string[] = [];

    // Check for running runs
    const runningRuns = await this.getRunningRuns(tenantId);
    if (runningRuns.length > 0) {
      blockingReasons.push(
        `${runningRuns.length} running run(s) must complete before migration`
      );
    }

    // Estimate total records
    const estimatedRecords = await this.estimateTenantRecords(tenantId);

    return {
      tenantId,
      tables: this.config.tableOrder,
      estimatedRecords,
      runningRuns,
      canProceed: blockingReasons.length === 0,
      blockingReasons,
    };
  }

  /**
   * Get running runs for a tenant
   */
  private async getRunningRuns(tenantId: string): Promise<string[]> {
    const result = await this.d1
      .prepare(
        `
        SELECT r.id
        FROM runs r
        JOIN projects p ON r.project_id = p.id
        WHERE p.tenant_id = ?
        AND r.status IN ('Running', 'Live', 'Publishing')
      `
      )
      .bind(tenantId)
      .all<{ id: string }>();

    return (result.results ?? []).map((row) => row.id);
  }

  /**
   * Estimate total records for a tenant
   */
  private async estimateTenantRecords(tenantId: string): Promise<number> {
    // Count records in main tables related to tenant
    const counts = await Promise.all([
      this.countTableRecords('projects', 'tenant_id', tenantId),
      this.countTableRecords('memberships', 'tenant_id', tenantId),
      this.countTableRecords('events', 'tenant_id', tenantId),
      this.countTableRecords('audit_logs', 'tenant_id', tenantId),
      this.countTableRecords('jobs', 'tenant_id', tenantId),
    ]);

    return counts.reduce((sum, count) => sum + count, 0);
  }

  /**
   * Count records in a table for a tenant
   */
  private async countTableRecords(
    table: string,
    tenantColumn: string,
    tenantId: string
  ): Promise<number> {
    try {
      const result = await this.d1
        .prepare(`SELECT COUNT(*) as count FROM ${table} WHERE ${tenantColumn} = ?`)
        .bind(tenantId)
        .first<{ count: number }>();

      return result?.count ?? 0;
    } catch {
      // Table might not have tenant_id column
      return 0;
    }
  }

  /**
   * Check if a run can be switched to new backend
   */
  async canSwitchRun(runId: string): Promise<{ canSwitch: boolean; reason?: string }> {
    if (!this.config.runLevelSwitchEnabled) {
      return { canSwitch: false, reason: 'Run-level switching is disabled' };
    }

    const run = await this.d1
      .prepare('SELECT status FROM runs WHERE id = ?')
      .bind(runId)
      .first<{ status: string }>();

    if (!run) {
      return { canSwitch: false, reason: 'Run not found' };
    }

    // Only allow switching for completed or not-yet-started runs
    const allowedStatuses = ['Draft', 'Designing', 'Completed', 'Archived'];
    if (!allowedStatuses.includes(run.status)) {
      return {
        canSwitch: false,
        reason: `Run is in ${run.status} status. Wait for completion before switching.`,
      };
    }

    return { canSwitch: true };
  }

  /**
   * Get current backend for a run
   * Uses tenant flag with run-level override support
   */
  async getRunBackend(tenantId: string, runId: string): Promise<DbBackend> {
    // First check run-level override (stored in run metadata or separate table)
    // For now, fall back to tenant-level flag
    return this.featureFlagsService.getDbBackend(tenantId);
  }

  /**
   * Set backend for a specific run
   */
  async setRunBackend(
    _tenantId: string,
    runId: string,
    backend: DbBackend
  ): Promise<void> {
    // Check if run can be switched
    const { canSwitch, reason } = await this.canSwitchRun(runId);
    if (!canSwitch) {
      throw new Error(`Cannot switch run backend: ${reason}`);
    }

    // Store run-level backend preference
    // This could be stored in run_design_json or a separate run_flags table
    // For now, this is a placeholder for the actual implementation
    console.log(`[Migration] Setting backend for run ${runId} to ${backend}`);
  }

  /**
   * Get migration status for tenant
   */
  async getTenantMigrationStatus(tenantId: string): Promise<TenantMigrationStatus> {
    return this.featureFlagsService.getMigrationStatus(tenantId);
  }

  /**
   * Start migration for a tenant
   * This is a placeholder - actual implementation would:
   * 1. Validate migration plan
   * 2. Create Neon schema if needed
   * 3. Start batch data transfer
   * 4. Update feature flags on completion
   */
  async startMigration(tenantId: string): Promise<{
    started: boolean;
    message: string;
  }> {
    const plan = await this.getMigrationPlan(tenantId);

    if (!plan.canProceed) {
      return {
        started: false,
        message: `Cannot start migration: ${plan.blockingReasons.join(', ')}`,
      };
    }

    // In a real implementation, this would:
    // 1. Queue a migration job
    // 2. Return job ID for tracking
    console.log(`[Migration] Starting migration for tenant ${tenantId}`);
    console.log(`[Migration] Tables: ${plan.tables.join(', ')}`);
    console.log(`[Migration] Estimated records: ${plan.estimatedRecords}`);

    return {
      started: true,
      message: `Migration initiated for ${plan.estimatedRecords} estimated records`,
    };
  }

  /**
   * Complete migration for a tenant
   * Updates feature flag to use Neon
   */
  async completeMigration(tenantId: string): Promise<void> {
    // Verify no running runs
    const runningRuns = await this.getRunningRuns(tenantId);
    if (runningRuns.length > 0) {
      throw new Error('Cannot complete migration with running runs');
    }

    // Switch tenant to Neon
    await this.featureFlagsService.setDbBackend(tenantId, 'neon');
    console.log(`[Migration] Tenant ${tenantId} switched to Neon`);
  }

  /**
   * Rollback migration for a tenant
   * Switches back to D1
   */
  async rollbackMigration(tenantId: string): Promise<void> {
    await this.featureFlagsService.setDbBackend(tenantId, 'd1');
    console.log(`[Migration] Tenant ${tenantId} rolled back to D1`);
  }
}

/**
 * Migration batch processor
 * Handles actual data transfer between D1 and Neon
 */
export class MigrationBatchProcessor {
  private d1: D1Database;
  private batchSize: number;

  constructor(d1: D1Database, batchSize = 1000) {
    this.d1 = d1;
    this.batchSize = batchSize;
  }

  /**
   * Export table data for migration
   * Returns data in batches for streaming to Neon
   */
  async *exportTable(
    tableName: string,
    whereClause?: { column: string; value: string }
  ): AsyncGenerator<Record<string, unknown>[], void, unknown> {
    let offset = 0;

    while (true) {
      let sql = `SELECT * FROM ${tableName}`;
      const params: unknown[] = [];

      if (whereClause) {
        sql += ` WHERE ${whereClause.column} = ?`;
        params.push(whereClause.value);
      }

      sql += ` LIMIT ? OFFSET ?`;
      params.push(this.batchSize, offset);

      const stmt = this.d1.prepare(sql).bind(...params);
      const result = await stmt.all<Record<string, unknown>>();
      const rows = result.results ?? [];

      if (rows.length === 0) {
        break;
      }

      yield rows;
      offset += rows.length;

      if (rows.length < this.batchSize) {
        break;
      }
    }
  }

  /**
   * Count records in a table
   */
  async countRecords(
    tableName: string,
    whereClause?: { column: string; value: string }
  ): Promise<number> {
    let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
    const params: unknown[] = [];

    if (whereClause) {
      sql += ` WHERE ${whereClause.column} = ?`;
      params.push(whereClause.value);
    }

    const stmt = this.d1.prepare(sql).bind(...params);
    const result = await stmt.first<{ count: number }>();
    return result?.count ?? 0;
  }
}
