/**
 * Report Service
 *
 * Generates comprehensive reports for Runs including:
 * - Run summary (period, budget consumption, mode)
 * - Intent/Variant performance metrics (impressions, clicks, cost, conversions, CVR, CPA, CTR)
 * - Statistical decision results (Insufficient/Directional/Confident)
 * - Winner information with rationale
 * - Next Run generation proposals
 * - Additional budget proposals for Insufficient cases (section 8.3)
 */

import { ulid } from '../lib/ulid.js';
import type { D1Database } from '@cloudflare/workers-types';
import type {
  Run,
  Intent,
  LpVariant,
  CreativeVariant,
  AdCopy,
  InsightDaily,
  AdBundle,
  Project,
} from '../types/entities.js';
import type {
  RunReport,
  VariantPerformance,
  IntentPerformance,
  BudgetInfo,
  PeriodInfo,
  StatisticalDecision,
  AdditionalBudgetProposal,
  NextRunProposal,
  GenerateReportRequest,
  ReportGenerationResult,
} from '../types/report.js';
import type { VariantMetrics, ConfidenceLevel, RankingEntry } from '../types/statistics.js';
import { createD1Repositories } from '../repositories/factory.js';
import {
  evaluateConfidence,
  createVariantMetrics,
  calculateAggregateMetrics,
  calculateAdditionalSamplesNeeded,
} from './statistics/confidence-evaluator.js';
import { DEFAULT_SAMPLE_THRESHOLDS, INSUFFICIENT_THRESHOLDS } from '../types/statistics.js';

/**
 * Report Service for generating Run reports
 */
export class ReportService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Generate a complete report for a Run
   */
  async generateReport(request: GenerateReportRequest): Promise<ReportGenerationResult> {
    const startTime = Date.now();

    try {
      const repos = createD1Repositories(this.db);

      // 1. Fetch run data
      const run = await repos.run.findById(request.runId);
      if (!run) {
        return {
          success: false,
          error: 'Run not found',
          durationMs: Date.now() - startTime,
        };
      }

      // 2. Verify tenant ownership
      const project = await repos.project.findById(run.projectId);
      if (!project || project.tenantId !== request.tenantId) {
        return {
          success: false,
          error: 'Run not found or access denied',
          durationMs: Date.now() - startTime,
        };
      }

      // 3. Fetch related data
      const intentsResult = await repos.intent.findByRunId(run.id, { limit: 100 });
      const intents = intentsResult.items;

      // 4. Fetch variant data for all intents
      const variantDataMap = await this.fetchVariantData(intents);

      // 5. Fetch insights/metrics data
      const metricsData = await this.fetchMetricsData(run.id);

      // 6. Build performance data
      const performance = this.buildPerformanceData(intents, variantDataMap, metricsData);

      // 7. Run statistical analysis
      const variantMetrics = this.buildVariantMetrics(performance);
      const decisionResult = evaluateConfidence(variantMetrics);

      // 8. Build statistical decision
      const statisticalDecision = this.buildStatisticalDecision(decisionResult, performance);

      // 9. Build budget info
      const budgetInfo = this.buildBudgetInfo(run, performance.totals.cost);

      // 10. Build period info
      const periodInfo = this.buildPeriodInfo(run);

      // 11. Build winner info
      const winnerInfo = this.buildWinnerInfo(decisionResult, performance);

      // 12. Build additional budget proposal (for Insufficient cases)
      const additionalBudgetProposal = this.buildAdditionalBudgetProposal(
        decisionResult.confidence,
        variantMetrics,
        performance.totals.cost,
        performance.totals.clicks
      );

      // 13. Build next run proposal (if requested)
      const nextRunProposal =
        request.generateNextRunProposal !== false
          ? this.buildNextRunProposal(decisionResult, performance, intents)
          : null;

      // 14. Assemble report
      const report: RunReport = {
        meta: {
          reportId: ulid(),
          runId: run.id,
          generatedAt: new Date().toISOString(),
          version: '1.0',
        },
        summary: {
          id: run.id,
          name: run.name,
          status: run.status,
          operationMode: run.operationMode,
          projectId: run.projectId,
          projectName: project.name,
          period: periodInfo,
          budget: budgetInfo,
        },
        performance,
        decision: statisticalDecision,
        winner: winnerInfo,
        additionalBudgetProposal,
        nextRunProposal,
      };

      return {
        success: true,
        report,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch variant data for all intents
   */
  private async fetchVariantData(
    intents: Intent[]
  ): Promise<Map<string, { lpVariants: LpVariant[]; creativeVariants: CreativeVariant[]; adCopies: AdCopy[] }>> {
    const repos = createD1Repositories(this.db);
    const map = new Map();

    for (const intent of intents) {
      const [lpVariantsResult, creativeVariantsResult, adCopiesResult] = await Promise.all([
        repos.lpVariant.findByIntentId(intent.id, { limit: 100 }),
        repos.creativeVariant.findByIntentId(intent.id, { limit: 100 }),
        repos.adCopy.findByIntentId(intent.id, { limit: 100 }),
      ]);

      map.set(intent.id, {
        lpVariants: lpVariantsResult.items,
        creativeVariants: creativeVariantsResult.items,
        adCopies: adCopiesResult.items,
      });
    }

    return map;
  }

  /**
   * Fetch metrics data for a run (from insights_daily and events)
   */
  private async fetchMetricsData(
    runId: string
  ): Promise<Map<string, { impressions: number; clicks: number; cost: number; conversions: number }>> {
    const metricsMap = new Map<string, { impressions: number; clicks: number; cost: number; conversions: number }>();

    // Fetch insights from insights_daily
    const insightsQuery = `
      SELECT ab.intent_id, ab.lp_variant_id, ab.creative_variant_id,
             id.metrics_json
      FROM insights_daily id
      JOIN ad_bundles ab ON ab.id = id.ad_bundle_id
      JOIN runs r ON r.id = ab.run_id
      WHERE ab.run_id = ?
    `;

    try {
      const results = await this.db.prepare(insightsQuery).bind(runId).all();

      for (const row of results.results || []) {
        const intentId = row.intent_id as string;
        let metrics: { impressions?: number; clicks?: number; cost?: number; conversions?: number } = {};
        try {
          metrics = JSON.parse((row.metrics_json as string) || '{}');
        } catch {
          metrics = {};
        }

        const existing = metricsMap.get(intentId) || { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
        metricsMap.set(intentId, {
          impressions: existing.impressions + (metrics.impressions || 0),
          clicks: existing.clicks + (metrics.clicks || 0),
          cost: existing.cost + (metrics.cost || 0),
          conversions: existing.conversions + (metrics.conversions || 0),
        });
      }
    } catch {
      // If query fails, return empty map (manual mode may not have insights)
    }

    // Also fetch conversion events from events table
    const eventsQuery = `
      SELECT intent_id, event_type, COUNT(*) as count
      FROM events
      WHERE run_id = ?
      GROUP BY intent_id, event_type
    `;

    try {
      const eventResults = await this.db.prepare(eventsQuery).bind(runId).all();

      for (const row of eventResults.results || []) {
        const intentId = row.intent_id as string;
        const eventType = row.event_type as string;
        const count = (row.count as number) || 0;

        if (!intentId) continue;

        const existing = metricsMap.get(intentId) || { impressions: 0, clicks: 0, cost: 0, conversions: 0 };

        if (eventType === 'pageview') {
          // Use pageviews as fallback for impressions if no Meta data
          if (existing.impressions === 0) {
            existing.impressions = count;
          }
        } else if (eventType === 'cta_click') {
          // Use CTA clicks as additional click data
          if (existing.clicks === 0) {
            existing.clicks = count;
          }
        } else if (eventType === 'form_success' || eventType === 'form_submit') {
          // Use form events as conversion data
          existing.conversions = Math.max(existing.conversions, count);
        }

        metricsMap.set(intentId, existing);
      }
    } catch {
      // Events query failed, continue with available data
    }

    return metricsMap;
  }

  /**
   * Build performance data from intents and metrics
   */
  private buildPerformanceData(
    intents: Intent[],
    variantDataMap: Map<string, { lpVariants: LpVariant[]; creativeVariants: CreativeVariant[]; adCopies: AdCopy[] }>,
    metricsData: Map<string, { impressions: number; clicks: number; cost: number; conversions: number }>
  ): {
    totals: { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cvr: number; cpa: number | null };
    byIntent: IntentPerformance[];
  } {
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalCost = 0;
    let totalConversions = 0;

    const byIntent: IntentPerformance[] = intents.map((intent) => {
      const metrics = metricsData.get(intent.id) || { impressions: 0, clicks: 0, cost: 0, conversions: 0 };
      const variantData = variantDataMap.get(intent.id) || { lpVariants: [], creativeVariants: [], adCopies: [] };

      totalImpressions += metrics.impressions;
      totalClicks += metrics.clicks;
      totalCost += metrics.cost;
      totalConversions += metrics.conversions;

      const intentMetrics: VariantPerformance = {
        variantId: intent.id,
        variantType: 'intent',
        name: intent.title,
        impressions: metrics.impressions,
        clicks: metrics.clicks,
        cost: metrics.cost,
        conversions: metrics.conversions,
        ctr: metrics.impressions > 0 ? metrics.clicks / metrics.impressions : 0,
        cvr: metrics.clicks > 0 ? metrics.conversions / metrics.clicks : 0,
        cpa: metrics.conversions > 0 ? metrics.cost / metrics.conversions : null,
        cpc: metrics.clicks > 0 ? metrics.cost / metrics.clicks : null,
      };

      // Build LP variant performance
      const lpVariants: VariantPerformance[] = variantData.lpVariants.map((lp) => ({
        variantId: lp.id,
        variantType: 'lp_variant' as const,
        name: `LP v${lp.version}`,
        impressions: 0, // Would need more granular data
        clicks: 0,
        cost: 0,
        conversions: 0,
        ctr: 0,
        cvr: 0,
        cpa: null,
        cpc: null,
      }));

      // Build creative variant performance
      const creativeVariants: VariantPerformance[] = variantData.creativeVariants.map((cr) => ({
        variantId: cr.id,
        variantType: 'creative_variant' as const,
        name: `Creative ${cr.size} v${cr.version}`,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        ctr: 0,
        cvr: 0,
        cpa: null,
        cpc: null,
      }));

      // Build ad copy performance
      const adCopies: VariantPerformance[] = variantData.adCopies.map((ac) => ({
        variantId: ac.id,
        variantType: 'ad_bundle' as const,
        name: ac.headline || `Ad Copy v${ac.version}`,
        impressions: 0,
        clicks: 0,
        cost: 0,
        conversions: 0,
        ctr: 0,
        cvr: 0,
        cpa: null,
        cpc: null,
      }));

      return {
        intentId: intent.id,
        title: intent.title,
        hypothesis: intent.hypothesis,
        status: intent.status,
        priority: intent.priority,
        metrics: intentMetrics,
        lpVariants,
        creativeVariants,
        adCopies,
      };
    });

    return {
      totals: {
        impressions: totalImpressions,
        clicks: totalClicks,
        cost: totalCost,
        conversions: totalConversions,
        ctr: totalImpressions > 0 ? totalClicks / totalImpressions : 0,
        cvr: totalClicks > 0 ? totalConversions / totalClicks : 0,
        cpa: totalConversions > 0 ? totalCost / totalConversions : null,
      },
      byIntent,
    };
  }

  /**
   * Build variant metrics for statistical analysis
   */
  private buildVariantMetrics(performance: {
    totals: { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cvr: number; cpa: number | null };
    byIntent: IntentPerformance[];
  }): VariantMetrics[] {
    return performance.byIntent.map((intent) =>
      createVariantMetrics(intent.intentId, intent.metrics.clicks, intent.metrics.conversions)
    );
  }

  /**
   * Build statistical decision from analysis result
   */
  private buildStatisticalDecision(
    decisionResult: {
      confidence: ConfidenceLevel;
      winnerId: string | null;
      ranking: RankingEntry[];
      rationale: string;
      recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
    },
    performance: {
      totals: { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cvr: number; cpa: number | null };
      byIntent: IntentPerformance[];
    }
  ): StatisticalDecision {
    // Find winner name
    let winnerName: string | null = null;
    if (decisionResult.winnerId) {
      const winnerIntent = performance.byIntent.find((i) => i.intentId === decisionResult.winnerId);
      winnerName = winnerIntent?.title ?? null;
    }

    return {
      confidence: decisionResult.confidence,
      winnerId: decisionResult.winnerId,
      winnerName,
      rationale: decisionResult.rationale,
      recommendation: decisionResult.recommendation,
      ranking: decisionResult.ranking,
    };
  }

  /**
   * Build budget information
   */
  private buildBudgetInfo(run: Run, totalSpent: number): BudgetInfo {
    let runDesign: { budget?: { currency?: string; total_cap?: number; daily_cap?: number } } = {};
    try {
      runDesign = JSON.parse(run.runDesignJson || '{}');
    } catch {
      runDesign = {};
    }

    const totalCap = runDesign.budget?.total_cap ?? 0;
    const dailyCap = runDesign.budget?.daily_cap ?? null;
    const currency = runDesign.budget?.currency ?? 'JPY';
    const remaining = Math.max(0, totalCap - totalSpent);
    const consumptionPercentage = totalCap > 0 ? (totalSpent / totalCap) * 100 : 0;

    return {
      currency,
      totalCap,
      dailyCap,
      totalSpent,
      consumptionPercentage,
      remaining,
      exhausted: totalCap > 0 && totalSpent >= totalCap,
    };
  }

  /**
   * Build period information
   */
  private buildPeriodInfo(run: Run): PeriodInfo {
    let durationMs: number | null = null;
    let daysRunning: number | null = null;

    if (run.launchedAt) {
      const startTime = new Date(run.launchedAt);
      const endTime = run.completedAt ? new Date(run.completedAt) : new Date();
      durationMs = endTime.getTime() - startTime.getTime();
      daysRunning = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
    }

    return {
      plannedStartAt: run.startAt,
      plannedEndAt: run.endAt,
      launchedAt: run.launchedAt,
      completedAt: run.completedAt,
      durationMs,
      durationFormatted: durationMs ? this.formatDuration(durationMs) : null,
      daysRunning,
    };
  }

  /**
   * Build winner information
   */
  private buildWinnerInfo(
    decisionResult: {
      confidence: ConfidenceLevel;
      winnerId: string | null;
      ranking: RankingEntry[];
      rationale: string;
      recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
    },
    performance: {
      totals: { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cvr: number; cpa: number | null };
      byIntent: IntentPerformance[];
    }
  ): RunReport['winner'] {
    if (!decisionResult.winnerId || decisionResult.confidence !== 'confident') {
      return {
        determined: false,
        variantId: null,
        variantType: null,
        name: null,
        metrics: null,
        rationale: decisionResult.rationale,
        confidence: decisionResult.confidence,
      };
    }

    const winnerIntent = performance.byIntent.find((i) => i.intentId === decisionResult.winnerId);
    if (!winnerIntent) {
      return {
        determined: false,
        variantId: decisionResult.winnerId,
        variantType: 'intent',
        name: null,
        metrics: null,
        rationale: 'Winner intent not found in performance data',
        confidence: decisionResult.confidence,
      };
    }

    return {
      determined: true,
      variantId: winnerIntent.intentId,
      variantType: 'intent',
      name: winnerIntent.title,
      metrics: winnerIntent.metrics,
      rationale: decisionResult.rationale,
      confidence: decisionResult.confidence,
    };
  }

  /**
   * Build additional budget proposal for Insufficient cases
   * Implements section 8.3: "How many more clicks/CVs needed for Directional/Confident"
   */
  private buildAdditionalBudgetProposal(
    confidence: ConfidenceLevel,
    variantMetrics: VariantMetrics[],
    totalCost: number,
    totalClicks: number
  ): AdditionalBudgetProposal | null {
    if (confidence === 'confident') {
      return null;
    }

    const aggregate = calculateAggregateMetrics(variantMetrics);
    const currentCvr = totalClicks > 0 ? aggregate.totalConversions / totalClicks : 0.01;
    const currentCpc = totalClicks > 0 ? totalCost / totalClicks : 100; // Default CPC estimate

    // Calculate clicks/CVs needed for Directional
    let clicksForDirectional: number | null = null;
    let cvsForDirectional: number | null = null;

    if (aggregate.totalClicks < DEFAULT_SAMPLE_THRESHOLDS.minClicksDirectional) {
      clicksForDirectional = DEFAULT_SAMPLE_THRESHOLDS.minClicksDirectional - aggregate.totalClicks;
    }
    if (aggregate.totalConversions < DEFAULT_SAMPLE_THRESHOLDS.minCvDirectional) {
      cvsForDirectional = DEFAULT_SAMPLE_THRESHOLDS.minCvDirectional - aggregate.totalConversions;
    }

    // Calculate clicks/CVs needed for Confident
    let clicksForConfident: number | null = null;
    let cvsForConfident: number | null = null;

    if (aggregate.totalConversions < DEFAULT_SAMPLE_THRESHOLDS.minCvConfident) {
      cvsForConfident = DEFAULT_SAMPLE_THRESHOLDS.minCvConfident - aggregate.totalConversions;
      // Estimate clicks needed based on current CVR
      clicksForConfident = currentCvr > 0 ? Math.ceil(cvsForConfident / currentCvr) : null;
    }

    // Calculate budget estimates
    const budgetForDirectional =
      clicksForDirectional !== null ? Math.ceil(clicksForDirectional * currentCpc) : null;
    const budgetForConfident =
      clicksForConfident !== null ? Math.ceil(clicksForConfident * currentCpc) : null;

    // Generate proposal message
    const proposalMessage = this.generateProposalMessage(
      confidence,
      clicksForDirectional,
      cvsForDirectional,
      clicksForConfident,
      cvsForConfident,
      budgetForDirectional,
      budgetForConfident
    );

    return {
      currentConfidence: confidence,
      clicksForDirectional,
      cvsForDirectional,
      clicksForConfident,
      cvsForConfident,
      budgetForDirectional,
      budgetForConfident,
      proposalMessage,
    };
  }

  /**
   * Generate human-readable proposal message
   */
  private generateProposalMessage(
    confidence: ConfidenceLevel,
    clicksForDirectional: number | null,
    cvsForDirectional: number | null,
    clicksForConfident: number | null,
    cvsForConfident: number | null,
    budgetForDirectional: number | null,
    budgetForConfident: number | null
  ): string {
    const parts: string[] = [];

    if (confidence === 'insufficient') {
      parts.push('Current data is insufficient for conclusions.');

      if (clicksForDirectional !== null || cvsForDirectional !== null) {
        const dirParts: string[] = [];
        if (clicksForDirectional !== null) {
          dirParts.push(`${clicksForDirectional} more clicks`);
        }
        if (cvsForDirectional !== null) {
          dirParts.push(`${cvsForDirectional} more conversions`);
        }
        const budgetPart = budgetForDirectional !== null ? ` (estimated budget: ${budgetForDirectional})` : '';
        parts.push(`For Directional trend: need ${dirParts.join(' or ')}${budgetPart}.`);
      }
    }

    if (clicksForConfident !== null || cvsForConfident !== null) {
      const confParts: string[] = [];
      if (cvsForConfident !== null) {
        confParts.push(`${cvsForConfident} more conversions`);
      }
      if (clicksForConfident !== null) {
        confParts.push(`approximately ${clicksForConfident} more clicks`);
      }
      const budgetPart = budgetForConfident !== null ? ` (estimated budget: ${budgetForConfident})` : '';
      parts.push(`For Confident result: need ${confParts.join(' or ')}${budgetPart}.`);
    }

    return parts.join(' ');
  }

  /**
   * Build next run proposal based on results
   */
  private buildNextRunProposal(
    decisionResult: {
      confidence: ConfidenceLevel;
      winnerId: string | null;
      ranking: RankingEntry[];
      rationale: string;
      recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
    },
    performance: {
      totals: { impressions: number; clicks: number; cost: number; conversions: number; ctr: number; cvr: number; cpa: number | null };
      byIntent: IntentPerformance[];
    },
    intents: Intent[]
  ): NextRunProposal {
    const fixedElements: NextRunProposal['fixedElements'] = {
      intentIds: [],
      lockLpStructure: false,
      lockLpTheme: false,
      lockLpBlocks: [],
      lockBannerTemplate: false,
      lockAdCopy: {
        primaryText: false,
        headline: false,
        description: false,
      },
    };

    const exploreAreas: NextRunProposal['exploreAreas'] = {
      areas: [],
      rationale: {},
    };

    // If we have a confident winner, lock that intent and explore variations
    if (decisionResult.confidence === 'confident' && decisionResult.winnerId) {
      fixedElements.intentIds = [decisionResult.winnerId];
      fixedElements.lockLpStructure = true;

      exploreAreas.areas = ['fv_copy', 'cta_copy', 'banner_text'];
      exploreAreas.rationale = {
        fv_copy: 'Winner intent identified. Test FV copy variations to optimize conversion.',
        cta_copy: 'Test different CTA copy to improve click-through.',
        banner_text: 'Test banner text variations while keeping winning template.',
      };
    } else if (decisionResult.confidence === 'directional') {
      // Directional: keep top performers, explore more variations
      const topIntents = decisionResult.ranking.slice(0, 2).map((r) => r.variantId);
      fixedElements.intentIds = topIntents;

      exploreAreas.areas = ['new_intent', 'lp_block_order', 'creative_template'];
      exploreAreas.rationale = {
        new_intent: 'Directional trend detected. Add new intent angles to validate.',
        lp_block_order: 'Test different LP block ordering to optimize engagement.',
        creative_template: 'Test new creative templates with top intents.',
      };
    } else {
      // Insufficient: broader exploration
      exploreAreas.areas = ['intent', 'lp_structure', 'creative_approach'];
      exploreAreas.rationale = {
        intent: 'Insufficient data. Test fundamentally different value propositions.',
        lp_structure: 'Test different LP structures to find better performing format.',
        creative_approach: 'Test different creative approaches to improve engagement.',
      };
    }

    // Generate summary
    let summary: string;
    if (decisionResult.confidence === 'confident') {
      summary = `Winner identified. Next run should lock the winning intent "${
        intents.find((i) => i.id === decisionResult.winnerId)?.title ?? decisionResult.winnerId
      }" and explore micro-optimizations in copy and creative variations.`;
    } else if (decisionResult.confidence === 'directional') {
      summary = `Directional trend detected. Next run should continue with top performing intents while adding new variations to reach statistical significance.`;
    } else {
      summary = `Insufficient data for conclusions. Next run should prioritize broader exploration of different intents, LP structures, and creative approaches to identify promising directions.`;
    }

    return {
      fixedElements,
      exploreAreas,
      summary,
    };
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    if (hours > 0) {
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  }
}

/**
 * Create a report service instance
 */
export function createReportService(db: D1Database): ReportService {
  return new ReportService(db);
}
