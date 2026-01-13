/**
 * Repository interfaces - export all interfaces
 */

// Base interfaces
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
} from './base.js';

// Tenant
export type {
  ITenantRepository,
  CreateTenantInput,
  UpdateTenantInput,
  TenantFilter,
} from './tenant.js';

// User & Membership
export type {
  IUserRepository,
  CreateUserInput,
  UpdateUserInput,
  UserFilter,
  UserWithMembership,
  IMembershipRepository,
  CreateMembershipInput,
  UpdateMembershipInput,
} from './user.js';

// Project
export type {
  IProjectRepository,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectFilter,
  IProjectAssetRepository,
  CreateProjectAssetInput,
} from './project.js';

// Run
export type {
  IRunRepository,
  CreateRunInput,
  UpdateRunInput,
  RunFilter,
} from './run.js';

// Intent
export type {
  IIntentRepository,
  CreateIntentInput,
  UpdateIntentInput,
  IntentFilter,
} from './intent.js';

// Variants
export type {
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
} from './variant.js';
