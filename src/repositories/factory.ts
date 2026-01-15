/**
 * Repository Factory
 * Provides centralized repository creation with feature flag based switching
 *
 * Supports staged D1 to Neon migration per requirements.md section 12:
 * - tenant-level or run-level switching via Feature Flags
 * - Repository layer abstracts D1Repository/NeonRepository
 */

import type {
  ITenantRepository,
  IUserRepository,
  IMembershipRepository,
  IProjectRepository,
  IProjectAssetRepository,
  IRunRepository,
  IIntentRepository,
  ILpVariantRepository,
  ICreativeVariantRepository,
  IAdCopyRepository,
  IApprovalRepository,
  IDecisionRepository,
  IDeploymentRepository,
  IAdBundleRepository,
  IIncidentRepository,
  IMetaConnectionRepository,
  IMetaEntityRepository,
  IFeatureFlagRepository,
  DatabaseType,
  DatabaseFeatureFlag,
} from './interfaces/index.js';

import {
  D1TenantRepository,
  D1UserRepository,
  D1MembershipRepository,
  D1ProjectRepository,
  D1ProjectAssetRepository,
  D1RunRepository,
  D1IntentRepository,
  D1LpVariantRepository,
  D1CreativeVariantRepository,
  D1AdCopyRepository,
  D1ApprovalRepository,
  D1DecisionRepository,
  D1DeploymentRepository,
  D1AdBundleRepository,
  D1IncidentRepository,
  D1MetaConnectionRepository,
  D1MetaEntityRepository,
  D1FeatureFlagRepository,
} from './d1/index.js';

import type { DbBackend } from '../types/feature-flags.js';

/**
 * Repository collection interface
 */
export interface Repositories {
  tenant: ITenantRepository;
  user: IUserRepository;
  membership: IMembershipRepository;
  project: IProjectRepository;
  projectAsset: IProjectAssetRepository;
  run: IRunRepository;
  intent: IIntentRepository;
  lpVariant: ILpVariantRepository;
  creativeVariant: ICreativeVariantRepository;
  adCopy: IAdCopyRepository;
  approval: IApprovalRepository;
  decision: IDecisionRepository;
  deployment: IDeploymentRepository;
  adBundle: IAdBundleRepository;
  incident: IIncidentRepository;
  metaConnection: IMetaConnectionRepository;
  metaEntity: IMetaEntityRepository;
  featureFlag: IFeatureFlagRepository;
}

/**
 * Factory configuration
 */
export interface RepositoryFactoryConfig {
  /** D1 database binding */
  d1?: D1Database;
  /** Neon connection (future) */
  neon?: unknown;
  /** Feature flag for database selection */
  featureFlag?: DatabaseFeatureFlag;
}

/**
 * Default feature flag (D1 only)
 */
const DEFAULT_FEATURE_FLAG: DatabaseFeatureFlag = {
  dbType: 'd1',
  migrationPhase: 'complete',
};

/**
 * Repository Factory
 * Creates repositories based on configuration and feature flags
 */
export class RepositoryFactory {
  private config: RepositoryFactoryConfig;
  private featureFlag: DatabaseFeatureFlag;

  constructor(config: RepositoryFactoryConfig) {
    this.config = config;
    this.featureFlag = config.featureFlag ?? DEFAULT_FEATURE_FLAG;
  }

  /**
   * Get current database type
   */
  getDatabaseType(): DatabaseType {
    return this.featureFlag.dbType;
  }

  /**
   * Get migration phase
   */
  getMigrationPhase(): string | undefined {
    return this.featureFlag.migrationPhase;
  }

  /**
   * Create all repositories
   */
  createRepositories(): Repositories {
    const dbType = this.featureFlag.dbType;

    switch (dbType) {
      case 'd1':
        return this.createD1Repositories();
      case 'neon':
        return this.createNeonRepositories();
      default:
        throw new Error(`Unknown database type: ${dbType}`);
    }
  }

  /**
   * Create D1 repositories
   */
  private createD1Repositories(): Repositories {
    const db = this.config.d1;
    if (!db) {
      throw new Error('D1 database binding not provided');
    }

    return {
      tenant: new D1TenantRepository(db),
      user: new D1UserRepository(db),
      membership: new D1MembershipRepository(db),
      project: new D1ProjectRepository(db),
      projectAsset: new D1ProjectAssetRepository(db),
      run: new D1RunRepository(db),
      intent: new D1IntentRepository(db),
      lpVariant: new D1LpVariantRepository(db),
      creativeVariant: new D1CreativeVariantRepository(db),
      adCopy: new D1AdCopyRepository(db),
      approval: new D1ApprovalRepository(db),
      decision: new D1DecisionRepository(db),
      deployment: new D1DeploymentRepository(db),
      adBundle: new D1AdBundleRepository(db),
      incident: new D1IncidentRepository(db),
      metaConnection: new D1MetaConnectionRepository(db),
      metaEntity: new D1MetaEntityRepository(db),
      featureFlag: new D1FeatureFlagRepository(db),
    };
  }

  /**
   * Create Neon repositories
   * Placeholder for future Neon implementation
   */
  private createNeonRepositories(): Repositories {
    // When Neon is implemented, this will create Neon repositories
    // For now, throw an error indicating it's not ready
    throw new Error(
      'Neon repositories not yet implemented. ' +
        'Use D1 or wait for Neon migration to be completed.'
    );
  }

  /**
   * Create feature flag repository
   * Always uses D1 since feature flags control DB selection
   */
  createFeatureFlagRepository(): IFeatureFlagRepository {
    const db = this.requireD1();
    return new D1FeatureFlagRepository(db);
  }

  /**
   * Create tenant repository
   */
  createTenantRepository(): ITenantRepository {
    return this.getDb(() => new D1TenantRepository(this.requireD1()));
  }

  /**
   * Create user repository
   */
  createUserRepository(): IUserRepository {
    return this.getDb(() => new D1UserRepository(this.requireD1()));
  }

  /**
   * Create membership repository
   */
  createMembershipRepository(): IMembershipRepository {
    return this.getDb(() => new D1MembershipRepository(this.requireD1()));
  }

  /**
   * Create project repository
   */
  createProjectRepository(): IProjectRepository {
    return this.getDb(() => new D1ProjectRepository(this.requireD1()));
  }

  /**
   * Create project asset repository
   */
  createProjectAssetRepository(): IProjectAssetRepository {
    return this.getDb(() => new D1ProjectAssetRepository(this.requireD1()));
  }

  /**
   * Create run repository
   */
  createRunRepository(): IRunRepository {
    return this.getDb(() => new D1RunRepository(this.requireD1()));
  }

  /**
   * Create intent repository
   */
  createIntentRepository(): IIntentRepository {
    return this.getDb(() => new D1IntentRepository(this.requireD1()));
  }

  /**
   * Create LP variant repository
   */
  createLpVariantRepository(): ILpVariantRepository {
    return this.getDb(() => new D1LpVariantRepository(this.requireD1()));
  }

  /**
   * Create creative variant repository
   */
  createCreativeVariantRepository(): ICreativeVariantRepository {
    return this.getDb(() => new D1CreativeVariantRepository(this.requireD1()));
  }

  /**
   * Create ad copy repository
   */
  createAdCopyRepository(): IAdCopyRepository {
    return this.getDb(() => new D1AdCopyRepository(this.requireD1()));
  }

  /**
   * Create approval repository
   */
  createApprovalRepository(): IApprovalRepository {
    return this.getDb(() => new D1ApprovalRepository(this.requireD1()));
  }

  /**
   * Create decision repository
   */
  createDecisionRepository(): IDecisionRepository {
    return this.getDb(() => new D1DecisionRepository(this.requireD1()));
  }

  /**
   * Create incident repository
   */
  createIncidentRepository(): IIncidentRepository {
    return this.getDb(() => new D1IncidentRepository(this.requireD1()));
  }

  /**
   * Create meta connection repository
   */
  createMetaConnectionRepository(): IMetaConnectionRepository {
    return this.getDb(() => new D1MetaConnectionRepository(this.requireD1()));
  }

  /**
   * Create meta entity repository
   */
  createMetaEntityRepository(): IMetaEntityRepository {
    return this.getDb(() => new D1MetaEntityRepository(this.requireD1()));
  }

  /**
   * Get repository based on database type
   */
  private getDb<T>(d1Factory: () => T): T {
    const dbType = this.featureFlag.dbType;

    switch (dbType) {
      case 'd1':
        return d1Factory();
      case 'neon':
        throw new Error('Neon repositories not yet implemented');
      default:
        throw new Error(`Unknown database type: ${dbType}`);
    }
  }

  /**
   * Require D1 database binding
   */
  private requireD1(): D1Database {
    if (!this.config.d1) {
      throw new Error('D1 database binding not provided');
    }
    return this.config.d1;
  }
}

/**
 * Create repository factory from environment
 */
export function createRepositoryFactory(env: {
  DB?: D1Database;
  NEON_CONNECTION_STRING?: string;
  DB_TYPE?: string;
  DB_MIGRATION_PHASE?: string;
}): RepositoryFactory {
  const featureFlag: DatabaseFeatureFlag = {
    dbType: (env.DB_TYPE as DatabaseType) ?? 'd1',
    migrationPhase: env.DB_MIGRATION_PHASE as DatabaseFeatureFlag['migrationPhase'],
  };

  return new RepositoryFactory({
    d1: env.DB,
    featureFlag,
  });
}

/**
 * Shorthand for creating repositories from D1
 */
export function createD1Repositories(db: D1Database): Repositories {
  const factory = new RepositoryFactory({ d1: db });
  return factory.createRepositories();
}

/**
 * Create repositories based on tenant's feature flag
 * This is the main entry point for feature-flag-based repository switching
 */
export async function createRepositoriesForTenant(
  d1: D1Database,
  tenantId: string
): Promise<Repositories> {
  // Feature flags are always read from D1
  const featureFlagRepo = new D1FeatureFlagRepository(d1);
  const flag = await featureFlagRepo.findByTenantAndKey(tenantId, 'db_backend');

  let dbBackend: DbBackend = 'd1';
  if (flag) {
    try {
      dbBackend = JSON.parse(flag.valueJson) as DbBackend;
    } catch {
      // Use default on parse error
    }
  }

  const featureFlag: DatabaseFeatureFlag = {
    dbType: dbBackend,
    migrationPhase: 'complete',
  };

  const factory = new RepositoryFactory({
    d1,
    featureFlag,
  });

  return factory.createRepositories();
}

/**
 * Create repositories for a specific database backend
 * Useful for migration scenarios where you need both D1 and Neon repos
 */
export function createRepositoriesForBackend(d1: D1Database, backend: DbBackend): Repositories {
  const featureFlag: DatabaseFeatureFlag = {
    dbType: backend,
    migrationPhase: 'complete',
  };

  const factory = new RepositoryFactory({
    d1,
    featureFlag,
  });

  return factory.createRepositories();
}
