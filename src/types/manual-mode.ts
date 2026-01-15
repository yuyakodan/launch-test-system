/**
 * Manual Mode type definitions
 * Types for Manual Mode operations including URL/UTM generation,
 * CSV imports, and metrics aggregation
 */

import type { InsightSource, AdBundleStatus } from './entities.js';

// ================================
// CSV Import Types
// ================================

/**
 * Insights CSV row structure
 * Maps to cost/clicks/impressions data from manual CSV upload
 */
export interface InsightsCsvRow {
  /** Ad bundle ID or UTM content identifier */
  ad_bundle_id?: string;
  /** UTM string for bundle identification */
  utm_content?: string;
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Optional hour in HH:00:00 format for hourly data */
  hour?: string;
  /** Ad spend cost */
  cost: number;
  /** Number of clicks */
  clicks: number;
  /** Number of impressions */
  impressions: number;
  /** Optional: conversions from ad platform */
  conversions?: number;
  /** Optional: reach */
  reach?: number;
  /** Optional: frequency */
  frequency?: number;
}

/**
 * Mapping CSV row structure
 * Links system Ad Bundles to external Ad Manager IDs
 */
export interface MappingCsvRow {
  /** System Ad bundle ID */
  ad_bundle_id: string;
  /** External Meta campaign ID */
  meta_campaign_id?: string;
  /** External Meta adset ID */
  meta_adset_id?: string;
  /** External Meta ad ID */
  meta_ad_id?: string;
  /** External ad name for reference */
  external_ad_name?: string;
}

/**
 * CSV parse result with validation
 */
export interface CsvParseResult<T> {
  /** Whether parsing was successful */
  success: boolean;
  /** Parsed rows */
  rows: T[];
  /** Total rows in file */
  totalRows: number;
  /** Number of valid rows */
  validRows: number;
  /** Number of invalid rows */
  invalidRows: number;
  /** Row-level errors */
  errors: CsvRowError[];
  /** Warnings (non-fatal issues) */
  warnings: string[];
}

/**
 * CSV row validation error
 */
export interface CsvRowError {
  /** Row number (1-indexed) */
  row: number;
  /** Field name */
  field: string;
  /** Error message */
  message: string;
  /** Actual value received */
  value?: unknown;
}

// ================================
// Manual Ad Bundle Registration
// ================================

/**
 * Request to register manual ad bundle mapping
 */
export interface RegisterAdBundleRequest {
  /** Run ID */
  runId: string;
  /** Intent ID */
  intentId: string;
  /** LP variant ID */
  lpVariantId: string;
  /** Creative variant ID */
  creativeVariantId: string;
  /** Ad copy ID */
  adCopyId: string;
  /** Optional: External campaign ID */
  metaCampaignId?: string;
  /** Optional: External adset ID */
  metaAdsetId?: string;
  /** Optional: External ad ID */
  metaAdId?: string;
}

/**
 * Generated Ad Bundle with UTM tracking
 */
export interface GeneratedAdBundle {
  /** Ad bundle ID */
  id: string;
  /** Run ID */
  runId: string;
  /** Intent ID */
  intentId: string;
  /** LP variant ID */
  lpVariantId: string;
  /** Creative variant ID */
  creativeVariantId: string;
  /** Ad copy ID */
  adCopyId: string;
  /** Generated UTM string */
  utmString: string;
  /** Full tracking URL */
  trackingUrl: string;
  /** Bundle status */
  status: AdBundleStatus;
  /** External campaign ID if mapped */
  metaCampaignId: string | null;
  /** External adset ID if mapped */
  metaAdsetId: string | null;
  /** External ad ID if mapped */
  metaAdId: string | null;
  /** Created timestamp */
  createdAt: string;
}

// ================================
// Metrics Import Types
// ================================

/**
 * Request to import metrics from CSV
 */
export interface ImportMetricsRequest {
  /** Run ID */
  runId: string;
  /** CSV file content as string */
  csvContent: string;
  /** Whether to overwrite existing data for same date/hour */
  overwrite?: boolean;
}

/**
 * Metrics import result
 */
export interface ImportMetricsResult {
  /** Import ID for audit */
  importId: string;
  /** Whether import was successful */
  success: boolean;
  /** Number of records imported */
  recordsImported: number;
  /** Number of records updated (if overwrite) */
  recordsUpdated: number;
  /** Number of records skipped */
  recordsSkipped: number;
  /** Errors during import */
  errors: CsvRowError[];
  /** Summary by bundle */
  bundleSummary: BundleImportSummary[];
}

/**
 * Per-bundle import summary
 */
export interface BundleImportSummary {
  /** Ad bundle ID */
  adBundleId: string;
  /** Number of records for this bundle */
  records: number;
  /** Total cost imported */
  totalCost: number;
  /** Total clicks imported */
  totalClicks: number;
  /** Total impressions imported */
  totalImpressions: number;
  /** Date range */
  dateRange: {
    from: string;
    to: string;
  };
}

// ================================
// Aggregated Metrics Types
// ================================

/**
 * Aggregated metrics for a single entity
 */
export interface AggregatedMetrics {
  /** Total impressions */
  impressions: number;
  /** Total clicks */
  clicks: number;
  /** Total cost */
  cost: number;
  /** Total conversions (from ad platform) */
  conversions: number;
  /** Click-through rate */
  ctr: number;
  /** Cost per click */
  cpc: number;
  /** Cost per mille (thousand impressions) */
  cpm: number;
  /** Cost per acquisition */
  cpa: number | null;
}

/**
 * First-party event metrics
 */
export interface EventMetrics {
  /** Total pageviews */
  pageviews: number;
  /** Total CTA clicks */
  ctaClicks: number;
  /** Total form submissions */
  formSubmits: number;
  /** Total form successes (conversions) */
  formSuccesses: number;
  /** Pageview to CTA click rate */
  ctaRate: number;
  /** CTA click to form submit rate */
  submitRate: number;
  /** Form submit to success rate */
  successRate: number;
  /** Overall conversion rate (pageview to success) */
  conversionRate: number;
}

/**
 * Combined metrics from insights + events
 */
export interface CombinedMetrics {
  /** Ad platform metrics (from insights) */
  insights: AggregatedMetrics;
  /** First-party event metrics */
  events: EventMetrics;
  /** Calculated combined metrics */
  combined: {
    /** Total cost */
    cost: number;
    /** Ad platform clicks */
    adClicks: number;
    /** Pageviews (first-party) */
    pageviews: number;
    /** Form successes (first-party conversions) */
    conversions: number;
    /** CPA based on first-party conversions */
    cpa: number | null;
    /** CVR based on pageviews to conversions */
    cvr: number;
  };
  /** Data source info */
  source: {
    insightsSource: InsightSource | 'none';
    hasEvents: boolean;
    lastUpdated: string | null;
  };
}

/**
 * Metrics aggregation level
 */
export type MetricsAggregationLevel = 'run' | 'intent' | 'bundle' | 'daily' | 'hourly';

/**
 * Request parameters for metrics aggregation
 */
export interface GetMetricsParams {
  /** Run ID */
  runId: string;
  /** Aggregation level */
  level?: MetricsAggregationLevel;
  /** Start date filter (YYYY-MM-DD) */
  startDate?: string;
  /** End date filter (YYYY-MM-DD) */
  endDate?: string;
  /** Filter by intent IDs */
  intentIds?: string[];
  /** Filter by bundle IDs */
  bundleIds?: string[];
}

/**
 * Metrics response for run level
 */
export interface RunMetricsResponse {
  /** Run ID */
  runId: string;
  /** Aggregation level */
  level: MetricsAggregationLevel;
  /** Date range of data */
  dateRange: {
    from: string | null;
    to: string | null;
  };
  /** Total metrics for entire run */
  totals: CombinedMetrics;
  /** Breakdown by variant/bundle if requested */
  breakdown?: VariantMetricsBreakdown[];
}

/**
 * Per-variant/bundle metrics breakdown
 */
export interface VariantMetricsBreakdown {
  /** Bundle or variant ID */
  id: string;
  /** Type of entity */
  type: 'intent' | 'lp_variant' | 'creative_variant' | 'bundle';
  /** Entity name or label */
  label: string;
  /** Metrics for this entity */
  metrics: CombinedMetrics;
  /** Percentage of total */
  percentageOfTotal: {
    cost: number;
    clicks: number;
    conversions: number;
  };
}

// ================================
// URL/UTM Generation Types
// ================================

/**
 * UTM generation configuration
 */
export interface UtmConfig {
  /** UTM source */
  source: string;
  /** UTM medium */
  medium: string;
  /** UTM campaign template */
  campaignTemplate: string;
  /** UTM content template */
  contentTemplate: string;
}

/**
 * Generated tracking URLs for an ad bundle
 */
export interface TrackingUrls {
  /** Base LP URL without UTM */
  baseUrl: string;
  /** Full URL with UTM parameters */
  fullUrl: string;
  /** UTM parameter string only */
  utmString: string;
  /** Individual UTM parameters */
  utmParams: {
    utm_source: string;
    utm_medium: string;
    utm_campaign: string;
    utm_content: string;
  };
}
