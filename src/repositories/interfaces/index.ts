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

// Deployment
export type {
  IDeploymentRepository,
  CreateDeploymentInput,
  UpdateDeploymentInput,
  DeploymentFilter,
} from './deployment.js';

// Ad Bundle
export type {
  IAdBundleRepository,
  CreateAdBundleInput,
  UpdateAdBundleInput,
  AdBundleFilter,
} from './ad-bundle.js';

// Approval
export type {
  IApprovalRepository,
  CreateApprovalInput,
  ApproveApprovalInput,
  RejectApprovalInput,
  ApprovalFilter,
} from './approval.js';

// Events
export type {
  IEventRepository,
  CreateEventInput,
  EventFilter,
  BatchInsertResult,
  EventAggregation,
} from './event.js';

// Decision
export type {
  IDecisionRepository,
  CreateDecisionInput,
  UpdateDecisionInput,
  DecisionFilter,
} from './decision.js';

// Incident
export type {
  IIncidentRepository,
  CreateIncidentInput,
  UpdateIncidentInput,
  IncidentFilter,
} from './incident.js';

// Feature Flags
export type {
  IFeatureFlagRepository,
  CreateFeatureFlagInput,
  UpdateFeatureFlagInput,
  FeatureFlagFilter,
} from './feature-flags.js';

// Meta Connection
export type {
  IMetaConnectionRepository,
  CreateMetaConnectionInput,
  UpdateMetaConnectionInput,
  MetaConnectionFilter,
} from './meta-connection.js';

// Meta Entity
export type {
  IMetaEntityRepository,
  CreateMetaEntityInput,
  UpdateMetaEntityInput,
  MetaEntityFilter,
} from './meta-entity.js';

// Manual Import
export type {
  IManualImportRepository,
  CreateManualImportInput,
  UpdateManualImportInput,
  ManualImportFilter,
} from './manual-import.js';

// Insights
export type {
  IInsightsHourlyRepository,
  IInsightsDailyRepository,
  InsightMetrics,
  UpsertInsightHourlyInput,
  UpsertInsightDailyInput,
  InsightFilter,
  AggregatedInsightMetrics,
} from './insights.js';

// Job
export type {
  IJobRepository,
  CreateJobInput,
  UpdateJobInput,
  JobFilter,
  JobStats,
} from './job.js';

// Notification
export type {
  INotificationRepository,
  CreateNotificationInput,
  UpdateNotificationInput,
  NotificationFilter,
  NotificationEventType,
  NotificationStats,
} from './notification.js';
