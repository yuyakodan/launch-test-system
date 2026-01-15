/**
 * Repositories - Main export file
 */

// Interfaces
export type {
  IBaseRepository,
  PaginationParams,
  PaginatedResult,
  SortDirection,
  SortParams,
  TransactionCallback,
  TransactionContext,
  ITransactionalRepository,
  DatabaseType,
  DatabaseFeatureFlag,
  ITenantRepository,
  CreateTenantInput,
  UpdateTenantInput,
  TenantFilter,
  IUserRepository,
  CreateUserInput,
  UpdateUserInput,
  UserFilter,
  UserWithMembership,
  IMembershipRepository,
  CreateMembershipInput,
  UpdateMembershipInput,
  IProjectRepository,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilter,
  IProjectAssetRepository,
  CreateProjectAssetInput,
  IRunRepository,
  CreateRunInput,
  UpdateRunInput,
  RunFilter,
  IIntentRepository,
  CreateIntentInput,
  UpdateIntentInput,
  IntentFilter,
  ILpVariantRepository,
  CreateLpVariantInput,
  UpdateLpVariantInput,
  LpVariantFilter,
  ICreativeVariantRepository,
  CreateCreativeVariantInput,
  UpdateCreativeVariantInput,
  CreativeVariantFilter,
  IAdCopyRepository,
  CreateAdCopyInput,
  UpdateAdCopyInput,
  AdCopyFilter,
  IEventRepository,
  CreateEventInput,
  EventFilter,
  BatchInsertResult,
  EventAggregation,
} from './interfaces/index.js';

// D1 Implementations
export {
  BaseD1Repository,
  removeUndefined,
  camelToSnake,
  snakeToCamel,
  generateColumnMappings,
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
  D1EventRepository,
} from './d1/index.js';
export type { ColumnMapping } from './d1/index.js';

// Factory
export {
  RepositoryFactory,
  createRepositoryFactory,
  createD1Repositories,
} from './factory.js';
export type { Repositories, RepositoryFactoryConfig } from './factory.js';
