/**
 * Manual Mode Service
 * Provides core functionality for Manual Mode operations:
 * - URL/UTM generation for ad bundles
 * - Creative/ad copy management
 * - Metrics import from CSV
 * - Combined metrics aggregation (events + insights)
 */

import { ulid } from '../lib/ulid.js';
import { CsvImportService } from './csv-import.js';
import type { IAdBundleRepository } from '../repositories/interfaces/ad-bundle.js';
import type { IManualImportRepository, CreateManualImportInput } from '../repositories/interfaces/manual-import.js';
import type {
  IInsightsDailyRepository,
  UpsertInsightDailyInput,
  InsightMetrics,
  AggregatedInsightMetrics,
} from '../repositories/interfaces/insights.js';
import type {
  RegisterAdBundleRequest,
  GeneratedAdBundle,
  ImportMetricsResult,
  BundleImportSummary,
  CombinedMetrics,
  AggregatedMetrics,
  EventMetrics,
  RunMetricsResponse,
  VariantMetricsBreakdown,
  UtmConfig,
  TrackingUrls,
  InsightsCsvRow,
  CsvRowError,
} from '../types/manual-mode.js';
import type { AdBundle } from '../types/entities.js';

/**
 * Default UTM configuration
 */
const DEFAULT_UTM_CONFIG: UtmConfig = {
  source: 'meta',
  medium: 'paid_social',
  campaignTemplate: 'run_{run_id}',
  contentTemplate: 'intent_{intent_id}_lp_{lp_variant_id}_cr_{creative_variant_id}',
};

/**
 * Manual Mode Service dependencies
 */
export interface ManualModeServiceDependencies {
  adBundleRepo: IAdBundleRepository;
  manualImportRepo: IManualImportRepository;
  insightsDailyRepo: IInsightsDailyRepository;
}

/**
 * Event counts by type for a run/bundle
 */
export interface EventCounts {
  pageviews: number;
  ctaClicks: number;
  formSubmits: number;
  formSuccesses: number;
}

/**
 * Manual Mode Service
 * Core service for Manual Mode operations
 */
export class ManualModeService {
  private deps: ManualModeServiceDependencies;
  private csvImportService: CsvImportService;

  constructor(deps: ManualModeServiceDependencies) {
    this.deps = deps;
    this.csvImportService = new CsvImportService();
  }

  // ================================
  // URL/UTM Generation
  // ================================

  /**
   * Generate UTM string for an ad bundle
   */
  generateUtmString(
    runId: string,
    intentId: string,
    lpVariantId: string,
    creativeVariantId: string,
    config: UtmConfig = DEFAULT_UTM_CONFIG
  ): string {
    const campaign = config.campaignTemplate.replace('{run_id}', runId);
    const content = config.contentTemplate
      .replace('{intent_id}', intentId)
      .replace('{lp_variant_id}', lpVariantId)
      .replace('{creative_variant_id}', creativeVariantId);

    return `utm_source=${config.source}&utm_medium=${config.medium}&utm_campaign=${campaign}&utm_content=${content}`;
  }

  /**
   * Generate full tracking URLs for an ad bundle
   */
  generateTrackingUrls(
    baseUrl: string,
    runId: string,
    intentId: string,
    lpVariantId: string,
    creativeVariantId: string,
    config: UtmConfig = DEFAULT_UTM_CONFIG
  ): TrackingUrls {
    const utmString = this.generateUtmString(
      runId,
      intentId,
      lpVariantId,
      creativeVariantId,
      config
    );

    const campaign = config.campaignTemplate.replace('{run_id}', runId);
    const content = config.contentTemplate
      .replace('{intent_id}', intentId)
      .replace('{lp_variant_id}', lpVariantId)
      .replace('{creative_variant_id}', creativeVariantId);

    // Construct full URL
    const separator = baseUrl.includes('?') ? '&' : '?';
    const fullUrl = `${baseUrl}${separator}${utmString}`;

    return {
      baseUrl,
      fullUrl,
      utmString,
      utmParams: {
        utm_source: config.source,
        utm_medium: config.medium,
        utm_campaign: campaign,
        utm_content: content,
      },
    };
  }

  // ================================
  // Ad Bundle Registration
  // ================================

  /**
   * Register a new ad bundle for Manual Mode
   */
  async registerAdBundle(
    request: RegisterAdBundleRequest,
    config: UtmConfig = DEFAULT_UTM_CONFIG
  ): Promise<GeneratedAdBundle> {
    // Generate UTM string
    const utmString = this.generateUtmString(
      request.runId,
      request.intentId,
      request.lpVariantId,
      request.creativeVariantId,
      config
    );

    // Create ad bundle
    const bundle = await this.deps.adBundleRepo.create({
      runId: request.runId,
      intentId: request.intentId,
      lpVariantId: request.lpVariantId,
      creativeVariantId: request.creativeVariantId,
      adCopyId: request.adCopyId,
      utmString,
      status: 'ready',
      metaCampaignId: request.metaCampaignId ?? null,
      metaAdsetId: request.metaAdsetId ?? null,
      metaAdId: request.metaAdId ?? null,
    });

    return {
      id: bundle.id,
      runId: bundle.runId,
      intentId: bundle.intentId,
      lpVariantId: bundle.lpVariantId,
      creativeVariantId: bundle.creativeVariantId,
      adCopyId: bundle.adCopyId,
      utmString: bundle.utmString,
      trackingUrl: `?${bundle.utmString}`, // Base URL should be prepended by caller
      status: bundle.status,
      metaCampaignId: bundle.metaCampaignId,
      metaAdsetId: bundle.metaAdsetId,
      metaAdId: bundle.metaAdId,
      createdAt: bundle.createdAt,
    };
  }

  /**
   * Update Meta IDs for an existing ad bundle
   */
  async updateBundleMetaIds(
    bundleId: string,
    metaCampaignId: string | null,
    metaAdsetId: string | null,
    metaAdId: string | null
  ): Promise<AdBundle | null> {
    return this.deps.adBundleRepo.updateMetaIds(bundleId, {
      metaCampaignId,
      metaAdsetId,
      metaAdId,
    });
  }

  // ================================
  // CSV Metrics Import
  // ================================

  /**
   * Import metrics from CSV content
   */
  async importMetricsFromCsv(
    tenantId: string,
    runId: string,
    csvContent: string,
    fileR2Key: string,
    userId: string | null,
    overwrite: boolean = false
  ): Promise<ImportMetricsResult> {
    // Parse CSV
    const parseResult = this.csvImportService.parseInsightsCsv(csvContent);

    const result: ImportMetricsResult = {
      importId: ulid(),
      success: false,
      recordsImported: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: [],
      bundleSummary: [],
    };

    if (!parseResult.success) {
      result.errors = parseResult.errors;
      return result;
    }

    // Get existing bundles for the run
    const bundlesResult = await this.deps.adBundleRepo.findByRunId(runId, { limit: 1000 });
    const bundleMap = new Map<string, AdBundle>();
    const utmMap = new Map<string, AdBundle>();

    for (const bundle of bundlesResult.items) {
      bundleMap.set(bundle.id, bundle);
      // Extract utm_content from utm string
      const utmMatch = bundle.utmString.match(/utm_content=([^&]+)/);
      if (utmMatch) {
        utmMap.set(utmMatch[1], bundle);
      }
    }

    // Group rows by bundle and date
    const groupedData = new Map<string, Map<string, InsightsCsvRow[]>>();
    const unmatchedRows: CsvRowError[] = [];

    for (let i = 0; i < parseResult.rows.length; i++) {
      const row = parseResult.rows[i];
      let bundleId: string | undefined;

      // Try to match by ad_bundle_id
      if (row.ad_bundle_id && bundleMap.has(row.ad_bundle_id)) {
        bundleId = row.ad_bundle_id;
      }
      // Try to match by utm_content
      else if (row.utm_content) {
        const bundle = utmMap.get(row.utm_content);
        if (bundle) {
          bundleId = bundle.id;
        }
      }

      if (!bundleId) {
        unmatchedRows.push({
          row: i + 2, // Account for header
          field: 'ad_bundle_id/utm_content',
          message: 'Bundle not found for identifier',
          value: row.ad_bundle_id || row.utm_content,
        });
        result.recordsSkipped++;
        continue;
      }

      if (!groupedData.has(bundleId)) {
        groupedData.set(bundleId, new Map());
      }

      const bundleData = groupedData.get(bundleId)!;
      if (!bundleData.has(row.date)) {
        bundleData.set(row.date, []);
      }
      bundleData.get(row.date)!.push(row);
    }

    result.errors.push(...unmatchedRows);

    // Process grouped data and upsert into insights_daily
    const bundleSummaries = new Map<
      string,
      { records: number; cost: number; clicks: number; impressions: number; dates: string[] }
    >();

    const upsertInputs: UpsertInsightDailyInput[] = [];

    for (const [bundleId, dateMap] of groupedData) {
      for (const [date, rows] of dateMap) {
        // Aggregate metrics for the same bundle/date
        const aggregatedMetrics: InsightMetrics = {
          cost: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
        };

        for (const row of rows) {
          aggregatedMetrics.cost += row.cost;
          aggregatedMetrics.clicks += row.clicks;
          aggregatedMetrics.impressions += row.impressions;
          if (row.conversions) aggregatedMetrics.conversions! += row.conversions;
          if (row.reach) aggregatedMetrics.reach = (aggregatedMetrics.reach || 0) + row.reach;
          if (row.frequency) {
            aggregatedMetrics.frequency =
              ((aggregatedMetrics.frequency || 0) + row.frequency) / 2;
          }
        }

        upsertInputs.push({
          adBundleId: bundleId,
          dateYyyyMmDd: date,
          metrics: aggregatedMetrics,
          source: 'manual',
        });

        // Track summary
        if (!bundleSummaries.has(bundleId)) {
          bundleSummaries.set(bundleId, {
            records: 0,
            cost: 0,
            clicks: 0,
            impressions: 0,
            dates: [],
          });
        }
        const summary = bundleSummaries.get(bundleId)!;
        summary.records++;
        summary.cost += aggregatedMetrics.cost;
        summary.clicks += aggregatedMetrics.clicks;
        summary.impressions += aggregatedMetrics.impressions;
        summary.dates.push(date);
      }
    }

    // Batch upsert
    const upsertedCount = await this.deps.insightsDailyRepo.batchUpsert(upsertInputs);
    result.recordsImported = upsertedCount;

    // Build bundle summaries
    for (const [bundleId, summary] of bundleSummaries) {
      const dates = summary.dates.sort();
      result.bundleSummary.push({
        adBundleId: bundleId,
        records: summary.records,
        totalCost: summary.cost,
        totalClicks: summary.clicks,
        totalImpressions: summary.impressions,
        dateRange: {
          from: dates[0],
          to: dates[dates.length - 1],
        },
      });
    }

    // Create manual import record
    const importInput: CreateManualImportInput = {
      id: result.importId,
      tenantId,
      runId,
      importType: 'insights_csv',
      fileR2Key,
      summaryJson: JSON.stringify({
        totalRows: parseResult.totalRows,
        validRows: parseResult.validRows,
        invalidRows: parseResult.invalidRows,
        recordsImported: result.recordsImported,
        recordsSkipped: result.recordsSkipped,
        bundleCount: result.bundleSummary.length,
      }),
      createdByUserId: userId,
    };

    await this.deps.manualImportRepo.create(importInput);

    result.success = unmatchedRows.length === 0 && result.recordsImported > 0;
    return result;
  }

  // ================================
  // Metrics Aggregation
  // ================================

  /**
   * Get aggregated insights metrics for bundles
   */
  async getInsightsMetrics(bundleIds: string[]): Promise<AggregatedMetrics> {
    if (bundleIds.length === 0) {
      return this.emptyAggregatedMetrics();
    }

    const aggregated = await this.deps.insightsDailyRepo.aggregateTotal(bundleIds);
    return this.insightMetricsToAggregated(aggregated);
  }

  /**
   * Calculate event metrics from event counts
   */
  calculateEventMetrics(counts: EventCounts): EventMetrics {
    const ctaRate = counts.pageviews > 0 ? counts.ctaClicks / counts.pageviews : 0;
    const submitRate = counts.ctaClicks > 0 ? counts.formSubmits / counts.ctaClicks : 0;
    const successRate = counts.formSubmits > 0 ? counts.formSuccesses / counts.formSubmits : 0;
    const conversionRate = counts.pageviews > 0 ? counts.formSuccesses / counts.pageviews : 0;

    return {
      pageviews: counts.pageviews,
      ctaClicks: counts.ctaClicks,
      formSubmits: counts.formSubmits,
      formSuccesses: counts.formSuccesses,
      ctaRate,
      submitRate,
      successRate,
      conversionRate,
    };
  }

  /**
   * Combine insights and event metrics
   */
  combinedMetrics(
    insights: AggregatedMetrics,
    events: EventMetrics,
    source: 'meta' | 'manual' | 'none',
    lastUpdated: string | null
  ): CombinedMetrics {
    const conversions = events.formSuccesses;
    const cpa = conversions > 0 ? insights.cost / conversions : null;
    const cvr = events.pageviews > 0 ? conversions / events.pageviews : 0;

    return {
      insights,
      events,
      combined: {
        cost: insights.cost,
        adClicks: insights.clicks,
        pageviews: events.pageviews,
        conversions,
        cpa,
        cvr,
      },
      source: {
        insightsSource: source,
        hasEvents: events.pageviews > 0,
        lastUpdated,
      },
    };
  }

  /**
   * Build run metrics response
   */
  buildRunMetricsResponse(
    runId: string,
    totals: CombinedMetrics,
    breakdown: VariantMetricsBreakdown[],
    dateRange: { from: string | null; to: string | null }
  ): RunMetricsResponse {
    return {
      runId,
      level: 'run',
      dateRange,
      totals,
      breakdown: breakdown.length > 0 ? breakdown : undefined,
    };
  }

  // ================================
  // Helper Methods
  // ================================

  private insightMetricsToAggregated(metrics: AggregatedInsightMetrics): AggregatedMetrics {
    return {
      impressions: metrics.totalImpressions,
      clicks: metrics.totalClicks,
      cost: metrics.totalCost,
      conversions: metrics.totalConversions,
      ctr: metrics.ctr,
      cpc: metrics.cpc,
      cpm: metrics.cpm,
      cpa: metrics.cpa,
    };
  }

  private emptyAggregatedMetrics(): AggregatedMetrics {
    return {
      impressions: 0,
      clicks: 0,
      cost: 0,
      conversions: 0,
      ctr: 0,
      cpc: 0,
      cpm: 0,
      cpa: null,
    };
  }

  emptyEventMetrics(): EventMetrics {
    return {
      pageviews: 0,
      ctaClicks: 0,
      formSubmits: 0,
      formSuccesses: 0,
      ctaRate: 0,
      submitRate: 0,
      successRate: 0,
      conversionRate: 0,
    };
  }
}

/**
 * Create Manual Mode Service instance
 */
export function createManualModeService(
  deps: ManualModeServiceDependencies
): ManualModeService {
  return new ManualModeService(deps);
}
