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

// Job types
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
  tenant_id: string;
  job_type: JobType;
  status: JobStatus;
  payload_json: Record<string, unknown>;
  result_json: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  last_error: string;
  scheduled_at?: string;
  created_at: string;
  updated_at: string;
}

// Extended Run Design (from requirements)
export interface RunDesignFull {
  version: string;
  operation_mode: RunMode;
  timezone?: string;
  kpi: {
    primary: 'cpa' | 'cv' | 'cvr';
    secondary?: ('cpa' | 'cv' | 'cvr' | 'ctr' | 'cpc' | 'cpm' | 'spend')[];
    optimization_event?: string;
  };
  budget: {
    currency: string;
    total_cap: number;
    daily_cap?: number;
  };
  compare_axis: {
    mode: 'intent' | 'lp_variant' | 'creative_variant' | 'bundle';
    notes?: string;
  };
  form_mode: {
    type: 'internal' | 'external_redirect' | 'webhook_submit';
    external_url?: string;
    webhook_url?: string;
  };
  sample_thresholds: {
    insufficient: { min_total_clicks: number; min_total_cvs: number };
    directional: { min_total_clicks: number; min_total_cvs: number };
    confident: { min_total_cvs: number; min_per_variant_cvs: number };
  };
  confidence_thresholds: {
    method: 'wilson' | 'bayes';
    alpha: number;
    min_effect: number;
  };
  utm_policy: {
    source: string;
    medium: string;
    campaign_key: string;
    content_key: string;
  };
}

// Stop DSL (from requirements)
export interface StopDSLFull {
  version: string;
  evaluation_interval_sec: number;
  safe_mode_on_error: boolean;
  rules: StopRule[];
}

export interface StopRule {
  id: string;
  enabled: boolean;
  scope: 'run' | 'bundle' | 'notify_only';
  type:
    | 'spend_total_cap'
    | 'spend_daily_cap'
    | 'cpa_cap'
    | 'cv_zero_duration'
    | 'measurement_anomaly'
    | 'meta_rejected'
    | 'sync_failure_streak';
  gating: {
    min_elapsed_sec?: number;
    min_total_clicks?: number;
    min_total_cvs?: number;
    min_impressions?: number;
    min_spend?: number;
  };
  params: Record<string, unknown>;
  action: {
    type: 'pause_run' | 'pause_bundle' | 'notify_only' | 'create_incident';
    notify: boolean;
    message: string;
  };
}

// Fixed Granularity (from requirements)
export interface FixedGranularityFull {
  version: string;
  fixed: {
    intent?: {
      lock_intent_ids: string[];
    };
    lp?: {
      lock_structure: boolean;
      lock_theme: boolean;
      lock_blocks: ('fv' | 'empathy' | 'solution' | 'proof' | 'steps' | 'faq' | 'cta' | 'disclaimer')[];
      lock_copy_paths: string[];
    };
    banner?: {
      lock_template: boolean;
      lock_image_layout: boolean;
      lock_text_layers: boolean;
      lock_sizes: ('1:1' | '4:5' | '9:16')[];
    };
    ad_copy?: {
      lock_primary_text: boolean;
      lock_headline: boolean;
      lock_description: boolean;
    };
  };
  explore: {
    intent?: {
      max_new_intents: number;
      allow_replace_intents: boolean;
    };
    lp?: {
      max_new_fv_copies: number;
      max_new_cta_copies: number;
      allow_block_reorder: boolean;
    };
    banner?: {
      max_new_text_variants: number;
      allow_new_templates: boolean;
    };
  };
}

// LP Block types
export type LpBlockType = 'fv' | 'empathy' | 'solution' | 'proof' | 'steps' | 'faq' | 'cta' | 'disclaimer';

export interface LpBlock {
  id: string;
  type: LpBlockType;
  order: number;
  content: Record<string, unknown>;
  visible: boolean;
}

export interface LpBlocksJson {
  blocks: LpBlock[];
  theme?: {
    primaryColor?: string;
    fontFamily?: string;
    layout?: string;
  };
}

// Extended LP Variant with blocks
export interface LpVariantFull extends LpVariant {
  blocks_json: LpBlocksJson;
  theme_json: Record<string, unknown>;
}

// Creative Variant sizes
export type CreativeSize = '1:1' | '4:5' | '9:16';

export interface TextLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontWeight: 'normal' | 'bold';
  color: string;
  align: 'left' | 'center' | 'right';
}

export interface CreativeVariantFull extends CreativeVariant {
  size: CreativeSize;
  text_layers_json: {
    layers: TextLayer[];
  };
  image_r2_key: string;
}

// Incident types
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
  tenant_id: string;
  run_id?: string;
  incident_type: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reason: string;
  meta_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
}
