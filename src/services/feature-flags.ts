/**
 * Feature Flags Service
 * Business logic for feature flag management and evaluation
 *
 * Based on requirements.md section 12:
 * - tenant_flags table with tenant_id, flag_key, value_json
 * - Support for db_backend, operation_mode_default, meta_api_enabled, features.*
 */

import type {
  TenantFlag,
  TenantFeatureFlags,
  FeatureFlagKey,
  FeatureFlagValues,
  DbBackend,
  OperationModeDefault,
  FeatureFlagUpdateInput,
  TenantMigrationStatus,
} from '../types/feature-flags.js';
import { FeatureFlagKeys, DEFAULT_FEATURE_FLAGS } from '../types/feature-flags.js';
import type { IFeatureFlagRepository } from '../repositories/interfaces/feature-flags.js';

/**
 * Feature Flags Service
 * Handles feature flag evaluation and management
 */
export class FeatureFlagsService {
  private repository: IFeatureFlagRepository;

  constructor(repository: IFeatureFlagRepository) {
    this.repository = repository;
  }

  /**
   * Get all feature flags for a tenant with defaults applied
   */
  async getAllFlags(tenantId: string): Promise<TenantFeatureFlags> {
    const flags = await this.repository.findAllByTenant(tenantId);

    // Start with defaults
    const result: Partial<FeatureFlagValues> = { ...DEFAULT_FEATURE_FLAGS };

    // Override with tenant-specific values
    let latestUpdatedAt = new Date(0).toISOString();
    for (const flag of flags) {
      try {
        const value = JSON.parse(flag.valueJson);
        result[flag.flagKey as FeatureFlagKey] = value;
        if (flag.updatedAt > latestUpdatedAt) {
          latestUpdatedAt = flag.updatedAt;
        }
      } catch {
        // Skip invalid JSON, use default
      }
    }

    return {
      tenantId,
      flags: result,
      updatedAt: latestUpdatedAt,
    };
  }

  /**
   * Get a single feature flag value with default fallback
   */
  async getFlag<K extends FeatureFlagKey>(
    tenantId: string,
    flagKey: K
  ): Promise<FeatureFlagValues[K]> {
    const flag = await this.repository.findByTenantAndKey(tenantId, flagKey);

    if (flag) {
      try {
        return JSON.parse(flag.valueJson) as FeatureFlagValues[K];
      } catch {
        // Fall through to default
      }
    }

    return DEFAULT_FEATURE_FLAGS[flagKey] as FeatureFlagValues[K];
  }

  /**
   * Get database backend for a tenant
   */
  async getDbBackend(tenantId: string): Promise<DbBackend> {
    return this.getFlag(tenantId, FeatureFlagKeys.DB_BACKEND);
  }

  /**
   * Get default operation mode for a tenant
   */
  async getOperationModeDefault(tenantId: string): Promise<OperationModeDefault> {
    return this.getFlag(tenantId, FeatureFlagKeys.OPERATION_MODE_DEFAULT);
  }

  /**
   * Check if Meta API is enabled for a tenant
   */
  async isMetaApiEnabled(tenantId: string): Promise<boolean> {
    return this.getFlag(tenantId, FeatureFlagKeys.META_API_ENABLED);
  }

  /**
   * Check if generation feature is enabled
   */
  async isGenerationEnabled(tenantId: string): Promise<boolean> {
    return this.getFlag(tenantId, FeatureFlagKeys.FEATURES_GENERATION);
  }

  /**
   * Check if QA feature is enabled
   */
  async isQaEnabled(tenantId: string): Promise<boolean> {
    return this.getFlag(tenantId, FeatureFlagKeys.FEATURES_QA);
  }

  /**
   * Update a feature flag
   */
  async updateFlag<K extends FeatureFlagKey>(
    tenantId: string,
    input: FeatureFlagUpdateInput<K>
  ): Promise<TenantFlag> {
    const valueJson = JSON.stringify(input.value);
    return this.repository.upsert({
      tenantId,
      flagKey: input.flagKey,
      valueJson,
    });
  }

  /**
   * Set database backend for a tenant (for migration)
   */
  async setDbBackend(tenantId: string, backend: DbBackend): Promise<TenantFlag> {
    return this.updateFlag(tenantId, {
      flagKey: FeatureFlagKeys.DB_BACKEND,
      value: backend,
    });
  }

  /**
   * Set default operation mode for a tenant
   */
  async setOperationModeDefault(
    tenantId: string,
    mode: OperationModeDefault
  ): Promise<TenantFlag> {
    return this.updateFlag(tenantId, {
      flagKey: FeatureFlagKeys.OPERATION_MODE_DEFAULT,
      value: mode,
    });
  }

  /**
   * Enable/disable Meta API for a tenant
   */
  async setMetaApiEnabled(tenantId: string, enabled: boolean): Promise<TenantFlag> {
    return this.updateFlag(tenantId, {
      flagKey: FeatureFlagKeys.META_API_ENABLED,
      value: enabled,
    });
  }

  /**
   * Enable/disable generation feature
   */
  async setGenerationEnabled(tenantId: string, enabled: boolean): Promise<TenantFlag> {
    return this.updateFlag(tenantId, {
      flagKey: FeatureFlagKeys.FEATURES_GENERATION,
      value: enabled,
    });
  }

  /**
   * Enable/disable QA feature
   */
  async setQaEnabled(tenantId: string, enabled: boolean): Promise<TenantFlag> {
    return this.updateFlag(tenantId, {
      flagKey: FeatureFlagKeys.FEATURES_QA,
      value: enabled,
    });
  }

  /**
   * Delete a specific flag (revert to default)
   */
  async deleteFlag(tenantId: string, flagKey: FeatureFlagKey): Promise<boolean> {
    return this.repository.delete(tenantId, flagKey);
  }

  /**
   * Reset all flags to defaults for a tenant
   */
  async resetAllFlags(tenantId: string): Promise<number> {
    return this.repository.deleteAllByTenant(tenantId);
  }

  /**
   * Get all tenants using a specific database backend
   */
  async getTenantsByDbBackend(backend: DbBackend): Promise<string[]> {
    return this.repository.findTenantsByFlagValue(
      FeatureFlagKeys.DB_BACKEND,
      JSON.stringify(backend)
    );
  }

  /**
   * Validate feature flag key
   */
  isValidFlagKey(key: string): key is FeatureFlagKey {
    return Object.values(FeatureFlagKeys).includes(key as FeatureFlagKey);
  }

  /**
   * Get migration status for a tenant (placeholder for actual migration tracking)
   */
  async getMigrationStatus(tenantId: string): Promise<TenantMigrationStatus> {
    const currentBackend = await this.getDbBackend(tenantId);

    // This is a simplified status - actual implementation would query migration tables
    return {
      tenantId,
      currentBackend,
      migrationPhase: currentBackend === 'neon' ? 'completed' : 'not_started',
      runsMigrated: 0,
      totalRuns: 0,
      lastMigratedAt: null,
    };
  }
}

/**
 * Create feature flags service from D1 database
 * Note: Import D1FeatureFlagRepository at call site to avoid circular dependency
 */
export function createFeatureFlagsService(
  db: D1Database,
  RepositoryClass: new (db: D1Database) => IFeatureFlagRepository
): FeatureFlagsService {
  const repository = new RepositoryClass(db);
  return new FeatureFlagsService(repository);
}
