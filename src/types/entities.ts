/**
 * Entity type definitions based on database schema
 * All IDs are ULID strings, timestamps are ISO8601 UTC strings
 */

// ================================
// Core Entities
// ================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  planKey: string;
  settingsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MembershipRole = 'owner' | 'operator' | 'reviewer' | 'viewer';
export type MembershipStatus = 'active' | 'invited' | 'disabled';

export interface Membership {
  tenantId: string;
  userId: string;
  role: MembershipRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

// ================================
// Project Entities
// ================================

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  offerJson: string;
  cvDefinitionJson: string;
  ngRulesJson: string;
  brandJson: string;
  formConfigJson: string;
  defaultDisclaimer: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAsset {
  id: string;
  projectId: string;
  assetType: string;
  r2Key: string;
  metaJson: string;
  createdAt: string;
}

// ================================
// Run & Intent Entities
// ================================

export type RunStatus =
  | 'Draft'
  | 'Designing'
  | 'Generating'
  | 'ReadyForReview'
  | 'Approved'
  | 'Publishing'
  | 'Live'
  | 'Running'
  | 'Paused'
  | 'Completed'
  | 'Archived';

export type OperationMode = 'manual' | 'hybrid' | 'auto';

export interface Run {
  id: string;
  projectId: string;
  name: string;
  status: RunStatus;
  operationMode: OperationMode;
  startAt: string | null;
  endAt: string | null;
  runDesignJson: string;
  stopDslJson: string;
  fixedGranularityJson: string;
  decisionRulesJson: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  publishedAt: string | null;
  launchedAt: string | null;
  completedAt: string | null;
}

export type IntentStatus = 'active' | 'paused' | 'archived';

export interface Intent {
  id: string;
  runId: string;
  title: string;
  hypothesis: string;
  evidenceJson: string;
  faqJson: string;
  priority: number;
  status: IntentStatus;
  createdAt: string;
  updatedAt: string;
}

// ================================
// Variant Entities
// ================================

export type ApprovalStatus = 'draft' | 'submitted' | 'approved' | 'rejected';
export type VariantStatus = 'draft' | 'ready' | 'published' | 'archived';

export interface LpVariant {
  id: string;
  intentId: string;
  version: number;
  status: VariantStatus;
  blocksJson: string;
  themeJson: string;
  qaResultJson: string;
  approvalStatus: ApprovalStatus;
  approvedHash: string | null;
  publishedUrl: string | null;
  snapshotR2Key: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreativeSize = '1:1' | '4:5' | '9:16';

export interface CreativeVariant {
  id: string;
  intentId: string;
  size: CreativeSize;
  version: number;
  status: string;
  textLayersJson: string;
  imageR2Key: string;
  qaResultJson: string;
  approvalStatus: ApprovalStatus;
  approvedHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdCopy {
  id: string;
  intentId: string;
  version: number;
  status: string;
  primaryText: string;
  headline: string;
  description: string;
  qaResultJson: string;
  approvalStatus: ApprovalStatus;
  approvedHash: string | null;
  createdAt: string;
  updatedAt: string;
}

// ================================
// Approval Entity
// ================================

export type ApprovalTargetType =
  | 'run'
  | 'lp_variant'
  | 'creative_variant'
  | 'ad_copy'
  | 'deployment'
  | 'meta_config';

export interface Approval {
  id: string;
  tenantId: string;
  targetType: ApprovalTargetType;
  targetId: string;
  status: 'submitted' | 'approved' | 'rejected';
  reviewerUserId: string | null;
  comment: string;
  targetHash: string;
  createdAt: string;
}

// ================================
// Deployment Entity
// ================================

export type DeploymentStatus = 'draft' | 'published' | 'rolled_back' | 'archived';

export interface Deployment {
  id: string;
  runId: string;
  status: DeploymentStatus;
  urlsJson: string;
  snapshotManifestR2Key: string | null;
  createdAt: string;
  updatedAt: string;
}

// ================================
// Meta Integration Entities
// ================================

export type MetaConnectionStatus = 'active' | 'revoked' | 'error';

export interface MetaConnection {
  id: string;
  tenantId: string;
  status: MetaConnectionStatus;
  tokenRef: string;
  adAccountId: string | null;
  pixelId: string | null;
  pageId: string | null;
  igUserId: string | null;
  scopesJson: string;
  metaJson: string;
  createdAt: string;
  updatedAt: string;
}

export type MetaEntityType = 'campaign' | 'adset' | 'ad' | 'creative';

export interface MetaEntity {
  id: string;
  runId: string;
  intentId: string | null;
  entityType: MetaEntityType;
  localRef: string;
  remoteId: string | null;
  status: string;
  metaJson: string;
  createdAt: string;
  updatedAt: string;
}

export type AdBundleStatus = 'ready' | 'running' | 'paused' | 'archived';

export interface AdBundle {
  id: string;
  runId: string;
  intentId: string;
  lpVariantId: string;
  creativeVariantId: string;
  adCopyId: string;
  utmString: string;
  status: AdBundleStatus;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ================================
// Event & Analytics Entities
// ================================

export type EventType = 'pageview' | 'cta_click' | 'form_submit' | 'form_success';

export interface Event {
  id: string;
  tenantId: string;
  runId: string;
  intentId: string | null;
  lpVariantId: string;
  creativeVariantId: string | null;
  adBundleId: string | null;
  eventType: EventType;
  tsMs: number;
  sessionId: string;
  pageUrl: string;
  referrer: string | null;
  userAgent: string | null;
  ipHash: string | null;
  metaJson: string;
}

export type InsightSource = 'meta' | 'manual';

export interface InsightHourly {
  adBundleId: string;
  tsHour: string;
  metricsJson: string;
  source: InsightSource;
  updatedAt: string;
}

export interface InsightDaily {
  adBundleId: string;
  dateYyyyMmDd: string;
  metricsJson: string;
  source: InsightSource;
  updatedAt: string;
}

export type ManualImportType = 'insights_csv' | 'mapping_csv';

export interface ManualImport {
  id: string;
  tenantId: string;
  runId: string;
  importType: ManualImportType;
  fileR2Key: string;
  summaryJson: string;
  createdByUserId: string | null;
  createdAt: string;
}

// ================================
// Decision & Incident Entities
// ================================

export type DecisionConfidence = 'insufficient' | 'directional' | 'confident';

export interface Decision {
  id: string;
  runId: string;
  status: 'draft' | 'final';
  confidence: DecisionConfidence;
  winnerJson: string;
  rankingJson: string;
  statsJson: string;
  rationale: string;
  decidedAt: string | null;
  createdByUserId: string | null;
  createdAt: string;
}

export type IncidentType =
  | 'meta_rejected'
  | 'meta_account_issue'
  | 'api_outage'
  | 'measurement_issue'
  | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'mitigating' | 'resolved';

export interface Incident {
  id: string;
  tenantId: string;
  runId: string | null;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reason: string;
  metaJson: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

// ================================
// System Entities
// ================================

export interface AuditLog {
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

export type JobType =
  | 'generate'
  | 'qa_smoke'
  | 'publish'
  | 'meta_sync'
  | 'stop_eval'
  | 'report'
  | 'notify'
  | 'import_parse';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  tenantId: string;
  jobType: JobType;
  status: JobStatus;
  payloadJson: string;
  resultJson: string;
  attempts: number;
  maxAttempts: number;
  lastError: string;
  scheduledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NotificationChannel = 'email' | 'slack' | 'webhook';
export type NotificationStatus = 'pending' | 'sent' | 'failed';

export interface Notification {
  id: string;
  tenantId: string;
  channel: NotificationChannel;
  eventType: string;
  payloadJson: string;
  status: NotificationStatus;
  sentAt: string | null;
  createdAt: string;
}

export interface TenantFlag {
  tenantId: string;
  flagKey: string;
  valueJson: string;
  updatedAt: string;
}
