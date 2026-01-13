// User types
export interface User {
  id: string;
  email: string;
  name?: string;
  role: Role;
  tenant_id: string;
  created_at: string;
}

export type Role = 'owner' | 'operator' | 'reviewer' | 'viewer';

// Tenant types
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  settings_json: TenantSettings;
  created_at: string;
  updated_at: string;
}

export interface TenantSettings {
  timezone?: string;
  currency?: string;
  defaultBudgetCap?: number;
}

// Project types
export interface Project {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  status: ProjectStatus;
  config_json: ProjectConfig;
  created_at: string;
  updated_at: string;
}

export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface ProjectConfig {
  targetAudience?: string;
  productCategory?: string;
  conversionGoal?: string;
}

// Run types
export interface Run {
  id: string;
  project_id: string;
  name: string;
  status: RunStatus;
  mode: RunMode;
  run_design_json: RunDesign;
  stop_dsl_json: StopDSL[];
  fixed_granularity_json: FixedGranularity;
  budget_cap: number;
  spend_total: number;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | 'draft'
  | 'designing'
  | 'generating'
  | 'ready_for_review'
  | 'approved'
  | 'publishing'
  | 'live'
  | 'running'
  | 'paused'
  | 'completed'
  | 'archived';

export type RunMode = 'manual' | 'hybrid' | 'auto';

export interface RunDesign {
  comparisonAxis: 'intent' | 'lp' | 'banner' | 'combination';
  targetMetric: 'cvr' | 'ctr' | 'cpa';
  minSampleSize: number;
  winningThreshold: number;
}

export interface StopDSL {
  rule_type: string;
  threshold?: number;
  duration_hours?: number;
}

export interface FixedGranularity {
  fixedElements: string[];
  exploreElements: string[];
}

// Intent types
export interface Intent {
  id: string;
  run_id: string;
  name: string;
  description?: string;
  target_audience: string;
  key_message: string;
  cta: string;
  status: IntentStatus;
  created_at: string;
  updated_at: string;
}

export type IntentStatus = 'draft' | 'active' | 'paused' | 'stopped';

// Variant types
export interface LpVariant {
  id: string;
  intent_id: string;
  name: string;
  url: string;
  snapshot_url?: string;
  status: VariantStatus;
  qa_result_json?: QAResult;
  created_at: string;
}

export interface CreativeVariant {
  id: string;
  intent_id: string;
  name: string;
  type: CreativeType;
  asset_url: string;
  dimensions: string;
  status: VariantStatus;
  qa_result_json?: QAResult;
  created_at: string;
}

export type CreativeType = 'banner' | 'video' | 'carousel';
export type VariantStatus = 'draft' | 'pending_qa' | 'approved' | 'rejected' | 'published';

export interface QAResult {
  passed: boolean;
  checks: QACheck[];
  checkedAt: string;
}

export interface QACheck {
  name: string;
  passed: boolean;
  message?: string;
}

// AdCopy types
export interface AdCopy {
  id: string;
  intent_id: string;
  primary_text: string;
  headline: string;
  description: string;
  status: VariantStatus;
  created_at: string;
}

// Metrics types
export interface RunMetrics {
  run_id: string;
  intent_id?: string;
  impressions: number;
  clicks: number;
  conversions: number;
  spend: number;
  ctr: number;
  cvr: number;
  cpa: number;
  updated_at: string;
}

// Decision types
export interface Decision {
  id: string;
  run_id: string;
  winner_intent_id?: string;
  confidence_level: ConfidenceLevel;
  reasoning: string;
  metrics_snapshot: MetricsSnapshot;
  created_at: string;
}

export type ConfidenceLevel = 'insufficient' | 'directional' | 'confident';

export interface MetricsSnapshot {
  rankings: IntentRanking[];
  totalSamples: number;
  statisticalPower: number;
}

export interface IntentRanking {
  intentId: string;
  intentName: string;
  rank: number;
  cvr: number;
  cvrCI: [number, number];
  isWinner: boolean;
}

// Report types
export interface RunReport {
  run_id: string;
  run_name: string;
  status: RunStatus;
  decision?: Decision;
  metrics: RunMetrics[];
  rankings: IntentRanking[];
  recommendations: string[];
  generated_at: string;
}

// API Response types
export interface ApiResponse<T> {
  status: 'ok' | 'error';
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  status: 'ok';
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

// List API response type (actual backend response format)
export interface ListResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Auth types
export interface AuthState {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// Event types
export interface TrackingEvent {
  event_type: string;
  run_id: string;
  intent_id?: string;
  variant_id?: string;
  session_id: string;
  properties?: Record<string, unknown>;
}
