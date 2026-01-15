/**
 * Insights Repository Interface
 * Handles CRUD operations for insights_hourly and insights_daily tables
 */

import type { InsightHourly, InsightDaily, InsightSource } from '../../types/entities.js';

/**
 * Metrics JSON structure stored in insights tables
 */
export interface InsightMetrics {
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
  /** Optional: additional custom metrics */
  [key: string]: number | undefined;
}

/**
 * Input for creating/upserting hourly insight
 */
export interface UpsertInsightHourlyInput {
  /** Ad bundle ID */
  adBundleId: string;
  /** Hour timestamp (ISO format: YYYY-MM-DDTHH:00:00Z) */
  tsHour: string;
  /** Metrics data */
  metrics: InsightMetrics;
  /** Data source */
  source: InsightSource;
}

/**
 * Input for creating/upserting daily insight
 */
export interface UpsertInsightDailyInput {
  /** Ad bundle ID */
  adBundleId: string;
  /** Date (YYYY-MM-DD format) */
  dateYyyyMmDd: string;
  /** Metrics data */
  metrics: InsightMetrics;
  /** Data source */
  source: InsightSource;
}

/**
 * Filter for querying insights
 */
export interface InsightFilter {
  /** Filter by bundle IDs */
  adBundleIds?: string[];
  /** Filter by source */
  source?: InsightSource;
  /** Start date/hour filter */
  from?: string;
  /** End date/hour filter */
  to?: string;
}

/**
 * Aggregated insight metrics
 */
export interface AggregatedInsightMetrics {
  /** Total cost */
  totalCost: number;
  /** Total clicks */
  totalClicks: number;
  /** Total impressions */
  totalImpressions: number;
  /** Total conversions */
  totalConversions: number;
  /** Calculated CTR */
  ctr: number;
  /** Calculated CPC */
  cpc: number;
  /** Calculated CPM */
  cpm: number;
  /** Calculated CPA (null if no conversions) */
  cpa: number | null;
  /** Number of records aggregated */
  recordCount: number;
}

/**
 * Insights Hourly Repository interface
 */
export interface IInsightsHourlyRepository {
  /**
   * Find insight by bundle and hour
   */
  findByBundleAndHour(adBundleId: string, tsHour: string): Promise<InsightHourly | null>;

  /**
   * Find all hourly insights for a bundle
   */
  findByBundleId(adBundleId: string, filter?: InsightFilter): Promise<InsightHourly[]>;

  /**
   * Find hourly insights for multiple bundles
   */
  findByBundleIds(adBundleIds: string[], filter?: InsightFilter): Promise<InsightHourly[]>;

  /**
   * Upsert hourly insight (insert or update)
   */
  upsert(input: UpsertInsightHourlyInput): Promise<InsightHourly>;

  /**
   * Batch upsert hourly insights
   */
  batchUpsert(inputs: UpsertInsightHourlyInput[]): Promise<number>;

  /**
   * Delete insights for a bundle
   */
  deleteByBundleId(adBundleId: string): Promise<number>;

  /**
   * Delete insights by date range
   */
  deleteByDateRange(adBundleId: string, from: string, to: string): Promise<number>;

  /**
   * Aggregate metrics for a bundle
   */
  aggregateByBundleId(adBundleId: string, filter?: InsightFilter): Promise<AggregatedInsightMetrics>;

  /**
   * Aggregate metrics for multiple bundles
   */
  aggregateByBundleIds(
    adBundleIds: string[],
    filter?: InsightFilter
  ): Promise<Map<string, AggregatedInsightMetrics>>;

  /**
   * Get total aggregated metrics across all bundles
   */
  aggregateTotal(adBundleIds: string[], filter?: InsightFilter): Promise<AggregatedInsightMetrics>;
}

/**
 * Insights Daily Repository interface
 */
export interface IInsightsDailyRepository {
  /**
   * Find insight by bundle and date
   */
  findByBundleAndDate(adBundleId: string, dateYyyyMmDd: string): Promise<InsightDaily | null>;

  /**
   * Find all daily insights for a bundle
   */
  findByBundleId(adBundleId: string, filter?: InsightFilter): Promise<InsightDaily[]>;

  /**
   * Find daily insights for multiple bundles
   */
  findByBundleIds(adBundleIds: string[], filter?: InsightFilter): Promise<InsightDaily[]>;

  /**
   * Upsert daily insight (insert or update)
   */
  upsert(input: UpsertInsightDailyInput): Promise<InsightDaily>;

  /**
   * Batch upsert daily insights
   */
  batchUpsert(inputs: UpsertInsightDailyInput[]): Promise<number>;

  /**
   * Delete insights for a bundle
   */
  deleteByBundleId(adBundleId: string): Promise<number>;

  /**
   * Delete insights by date range
   */
  deleteByDateRange(adBundleId: string, from: string, to: string): Promise<number>;

  /**
   * Aggregate metrics for a bundle
   */
  aggregateByBundleId(adBundleId: string, filter?: InsightFilter): Promise<AggregatedInsightMetrics>;

  /**
   * Aggregate metrics for multiple bundles
   */
  aggregateByBundleIds(
    adBundleIds: string[],
    filter?: InsightFilter
  ): Promise<Map<string, AggregatedInsightMetrics>>;

  /**
   * Get total aggregated metrics across all bundles
   */
  aggregateTotal(adBundleIds: string[], filter?: InsightFilter): Promise<AggregatedInsightMetrics>;

  /**
   * Get date range with data for bundles
   */
  getDateRange(adBundleIds: string[]): Promise<{ from: string | null; to: string | null }>;
}
