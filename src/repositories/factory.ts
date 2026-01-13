/**
 * Repository Factory
 * Provides centralized repository creation with feature flag based switching
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
} from './d1/index.js';

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
        // Future: return this.createNeonRepositories();
        throw new Error('Neon repositories not yet implemented');
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
    };
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
