/**
 * Feature Flags Type Definitions
 * Based on requirements.md section 12 - DB migration and feature flags
 */

/**
 * Database backend type
 */
export type DbBackend = 'd1' | 'neon';

/**
 * Default operation mode
 */
export type OperationModeDefault = 'manual' | 'hybrid' | 'auto';

/**
 * Feature flag keys enum
 */
export const FeatureFlagKeys = {
  /** Database backend selection */
  DB_BACKEND: 'db_backend',
  /** Default operation mode for new runs */
  OPERATION_MODE_DEFAULT: 'operation_mode_default',
  /** Meta API enabled */
  META_API_ENABLED: 'meta_api_enabled',
  /** Generation feature enabled */
  FEATURES_GENERATION: 'features.generation',
  /** QA feature enabled */
  FEATURES_QA: 'features.qa',
} as const;

export type FeatureFlagKey = (typeof FeatureFlagKeys)[keyof typeof FeatureFlagKeys];

/**
 * Feature flag value types mapped by key
 */
export interface FeatureFlagValues {
  [FeatureFlagKeys.DB_BACKEND]: DbBackend;
  [FeatureFlagKeys.OPERATION_MODE_DEFAULT]: OperationModeDefault;
  [FeatureFlagKeys.META_API_ENABLED]: boolean;
  [FeatureFlagKeys.FEATURES_GENERATION]: boolean;
  [FeatureFlagKeys.FEATURES_QA]: boolean;
}

/**
 * Default feature flag values
 */
export const DEFAULT_FEATURE_FLAGS: FeatureFlagValues = {
  [FeatureFlagKeys.DB_BACKEND]: 'd1',
  [FeatureFlagKeys.OPERATION_MODE_DEFAULT]: 'manual',
  [FeatureFlagKeys.META_API_ENABLED]: false,
  [FeatureFlagKeys.FEATURES_GENERATION]: true,
  [FeatureFlagKeys.FEATURES_QA]: true,
};

/**
 * Tenant feature flag record
 */
export interface TenantFlag {
  tenantId: string;
  flagKey: string;
  valueJson: string;
  updatedAt: string;
}

/**
 * Parsed tenant flag with typed value
 */
export interface ParsedTenantFlag<K extends FeatureFlagKey = FeatureFlagKey> {
  tenantId: string;
  flagKey: K;
  value: K extends keyof FeatureFlagValues ? FeatureFlagValues[K] : unknown;
  updatedAt: string;
}

/**
 * All feature flags for a tenant
 */
export interface TenantFeatureFlags {
  tenantId: string;
  flags: Partial<FeatureFlagValues>;
  updatedAt: string;
}

/**
 * Feature flag update input
 */
export interface FeatureFlagUpdateInput<K extends FeatureFlagKey = FeatureFlagKey> {
  flagKey: K;
  value: K extends keyof FeatureFlagValues ? FeatureFlagValues[K] : unknown;
}

/**
 * Migration status for a tenant
 */
export interface TenantMigrationStatus {
  tenantId: string;
  currentBackend: DbBackend;
  migrationPhase: 'not_started' | 'in_progress' | 'completed';
  runsMigrated: number;
  totalRuns: number;
  lastMigratedAt: string | null;
}
