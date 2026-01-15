/**
 * Decision Service
 * Statistical Decision Engine based on requirements Section 8
 *
 * Provides:
 * - Three confidence levels: Insufficient, Directional, Confident
 * - Wilson CI and Bayesian (Beta-Binomial) statistical analysis
 * - Winner determination and ranking
 * - Rationale generation
 */

import type { Decision, DecisionConfidence } from '../types/entities.js';
import type {
  VariantMetrics,
  ConfidenceLevel,
  WilsonCiResult,
  DecisionResult,
  StatisticsConfig,
  RankingEntry,
} from '../types/statistics.js';
import { DEFAULT_STATISTICS_CONFIG, INSUFFICIENT_THRESHOLDS } from '../types/statistics.js';
import {
  evaluateConfidence,
  createVariantMetrics,
  calculateAggregateMetrics,
} from './statistics/confidence-evaluator.js';
import { compareAllVariantsWilsonCi, calculateVariantWilsonCi } from './statistics/wilson-ci.js';
import { compareBayesian, calculateExpectedLoss } from './statistics/bayes.js';
import type { IDecisionRepository, CreateDecisionInput } from '../repositories/interfaces/decision.js';

/**
 * Sample thresholds configuration from run design
 * Matches JSON schema in requirements
 */
export interface SampleThresholdsConfig {
  insufficient: {
    min_total_clicks: number;
    min_total_cvs: number;
  };
  directional: {
    min_total_clicks: number;
    min_total_cvs: number;
  };
  confident: {
    min_total_cvs: number;
    min_per_variant_cvs: number;
  };
}

/**
 * Confidence thresholds configuration from run design
 */
export interface ConfidenceThresholdsConfig {
  method: 'wilson' | 'bayes';
  alpha: number;
  min_effect: number;
}

/**
 * Decision configuration extracted from run_design_json
 */
export interface DecisionConfig {
  sampleThresholds: SampleThresholdsConfig;
  confidenceThresholds: ConfidenceThresholdsConfig;
}

/**
 * Default sample thresholds matching requirements Section 8.2
 */
export const DEFAULT_SAMPLE_THRESHOLDS: SampleThresholdsConfig = {
  insufficient: {
    min_total_clicks: 200,
    min_total_cvs: 3,
  },
  directional: {
    min_total_clicks: 200,
    min_total_cvs: 5,
  },
  confident: {
    min_total_cvs: 20,
    min_per_variant_cvs: 5,
  },
};

/**
 * Default confidence thresholds
 */
export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholdsConfig = {
  method: 'wilson',
  alpha: 0.05,
  min_effect: 0,
};

/**
 * Winner information structure
 */
export interface WinnerInfo {
  variantId: string;
  cvr: number;
  conversions: number;
  clicks: number;
  winProbability: number;
  wilsonCi: WilsonCiResult;
}

/**
 * Ranking entry for a variant
 */
export interface VariantRankingEntry {
  rank: number;
  variantId: string;
  cvr: number;
  conversions: number;
  clicks: number;
  winProbability: number;
  score: number;
  wilsonCi: {
    lower: number;
    upper: number;
    point: number;
  };
}

/**
 * Statistics details for the decision
 */
export interface StatsDetails {
  method: 'wilson' | 'bayes';
  aggregate: {
    totalClicks: number;
    totalConversions: number;
    variantCount: number;
  };
  wilsonComparisons: Array<{
    variantA: string;
    variantB: string;
    overlapping: boolean;
    relativeLift: number;
    aSignificantlyBetter: boolean;
    bSignificantlyBetter: boolean;
  }>;
  bayesAnalysis: {
    winProbabilities: Record<string, number>;
    expectedLoss: Record<string, number>;
    likelyWinner: string | null;
    likelyWinnerProbability: number;
  };
  thresholdsUsed: {
    sample: SampleThresholdsConfig;
    confidence: ConfidenceThresholdsConfig;
  };
}

/**
 * Decision analysis result
 */
export interface DecisionAnalysisResult {
  confidence: ConfidenceLevel;
  winnerId: string | null;
  winnerInfo: WinnerInfo | null;
  ranking: VariantRankingEntry[];
  stats: StatsDetails;
  rationale: string;
  recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
  additionalSamplesNeeded: number | null;
}

/**
 * Parse decision config from run_design_json
 */
export function parseDecisionConfig(runDesignJson: string): DecisionConfig {
  try {
    const design = JSON.parse(runDesignJson);

    const sampleThresholds: SampleThresholdsConfig = {
      insufficient: {
        min_total_clicks:
          design.sample_thresholds?.insufficient?.min_total_clicks ??
          DEFAULT_SAMPLE_THRESHOLDS.insufficient.min_total_clicks,
        min_total_cvs:
          design.sample_thresholds?.insufficient?.min_total_cvs ??
          DEFAULT_SAMPLE_THRESHOLDS.insufficient.min_total_cvs,
      },
      directional: {
        min_total_clicks:
          design.sample_thresholds?.directional?.min_total_clicks ??
          DEFAULT_SAMPLE_THRESHOLDS.directional.min_total_clicks,
        min_total_cvs:
          design.sample_thresholds?.directional?.min_total_cvs ??
          DEFAULT_SAMPLE_THRESHOLDS.directional.min_total_cvs,
      },
      confident: {
        min_total_cvs:
          design.sample_thresholds?.confident?.min_total_cvs ??
          DEFAULT_SAMPLE_THRESHOLDS.confident.min_total_cvs,
        min_per_variant_cvs:
          design.sample_thresholds?.confident?.min_per_variant_cvs ??
          DEFAULT_SAMPLE_THRESHOLDS.confident.min_per_variant_cvs,
      },
    };

    const confidenceThresholds: ConfidenceThresholdsConfig = {
      method: design.confidence_thresholds?.method ?? DEFAULT_CONFIDENCE_THRESHOLDS.method,
      alpha: design.confidence_thresholds?.alpha ?? DEFAULT_CONFIDENCE_THRESHOLDS.alpha,
      min_effect: design.confidence_thresholds?.min_effect ?? DEFAULT_CONFIDENCE_THRESHOLDS.min_effect,
    };

    return { sampleThresholds, confidenceThresholds };
  } catch {
    return {
      sampleThresholds: DEFAULT_SAMPLE_THRESHOLDS,
      confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
    };
  }
}

/**
 * Convert decision config to statistics config
 */
function toStatisticsConfig(config: DecisionConfig): StatisticsConfig {
  return {
    thresholds: {
      minClicksDirectional: config.sampleThresholds.directional.min_total_clicks,
      minCvDirectional: config.sampleThresholds.directional.min_total_cvs,
      minCvConfident: config.sampleThresholds.confident.min_total_cvs,
      minCvrLiftConfident: config.confidenceThresholds.min_effect,
    },
    wilsonConfidenceLevel: 1 - config.confidenceThresholds.alpha,
    bayesPriorAlpha: 1,
    bayesPriorBeta: 1,
    bayesSimulations: 10000,
  };
}

/**
 * Check if data is insufficient based on thresholds
 * Insufficient: totalClicks < threshold AND totalCVs < threshold
 */
function checkInsufficient(
  totalClicks: number,
  totalCvs: number,
  thresholds: SampleThresholdsConfig
): boolean {
  return (
    totalClicks < thresholds.insufficient.min_total_clicks &&
    totalCvs < thresholds.insufficient.min_total_cvs
  );
}

/**
 * Check if data supports directional conclusions
 * Directional: totalClicks >= threshold OR totalCVs >= threshold
 */
function checkDirectional(
  totalClicks: number,
  totalCvs: number,
  thresholds: SampleThresholdsConfig
): boolean {
  return (
    totalClicks >= thresholds.directional.min_total_clicks ||
    totalCvs >= thresholds.directional.min_total_cvs
  );
}

/**
 * Check if data supports confident conclusions
 * Confident: totalCVs >= threshold AND top variant meets criteria
 */
function checkConfident(
  totalCvs: number,
  variants: VariantMetrics[],
  topWinProbability: number,
  thresholds: SampleThresholdsConfig
): boolean {
  // Must have minimum total conversions
  if (totalCvs < thresholds.confident.min_total_cvs) {
    return false;
  }

  // Must have minimum conversions per variant
  const minPerVariant = thresholds.confident.min_per_variant_cvs;
  const allVariantsHaveMinCv = variants.every((v) => v.conversions >= minPerVariant);
  if (!allVariantsHaveMinCv) {
    return false;
  }

  // Top variant must have high win probability (>95%)
  if (topWinProbability < 0.95) {
    return false;
  }

  return true;
}

/**
 * Calculate additional samples needed to reach confident level
 */
function calculateAdditionalSamples(
  totalClicks: number,
  totalCvs: number,
  thresholds: SampleThresholdsConfig
): number | null {
  if (totalCvs >= thresholds.confident.min_total_cvs) {
    return null;
  }

  const currentCvr = totalClicks > 0 ? totalCvs / totalClicks : 0;
  const estimatedCvr = currentCvr > 0 ? currentCvr : 0.01;
  const cvsNeeded = thresholds.confident.min_total_cvs - totalCvs;
  const clicksNeeded = Math.ceil(cvsNeeded / estimatedCvr);

  return Math.max(0, clicksNeeded);
}

/**
 * Generate human-readable rationale for the decision
 */
function generateDetailedRationale(
  confidence: ConfidenceLevel,
  aggregate: { totalClicks: number; totalConversions: number; variantCount: number },
  winnerId: string | null,
  topWinProbability: number,
  thresholds: SampleThresholdsConfig
): string {
  const { totalClicks, totalConversions, variantCount } = aggregate;

  switch (confidence) {
    case 'insufficient':
      return (
        `Data insufficient for analysis. ` +
        `Current: ${totalClicks} clicks, ${totalConversions} conversions across ${variantCount} variants. ` +
        `Minimum required: ${thresholds.insufficient.min_total_clicks} clicks OR ${thresholds.insufficient.min_total_cvs} conversions. ` +
        `Recommendation: Continue collecting data.`
      );

    case 'directional':
      if (winnerId) {
        return (
          `Directional trend detected. ` +
          `Variant "${winnerId}" is currently leading with ${(topWinProbability * 100).toFixed(1)}% probability of being best. ` +
          `Based on ${totalClicks} clicks and ${totalConversions} conversions. ` +
          `However, statistical significance not yet achieved (need ${thresholds.confident.min_total_cvs} total CVs). ` +
          `Recommendation: Continue collecting data for confident conclusion.`
        );
      }
      return (
        `Directional trend detected but no clear leader. ` +
        `${totalClicks} clicks, ${totalConversions} conversions across ${variantCount} variants. ` +
        `Recommendation: Continue collecting data.`
      );

    case 'confident':
      return (
        `Confident result achieved. ` +
        `Variant "${winnerId}" is the winner with ${(topWinProbability * 100).toFixed(1)}% probability of being best. ` +
        `Based on ${totalClicks} clicks and ${totalConversions} conversions across ${variantCount} variants. ` +
        `Statistical criteria met: ${thresholds.confident.min_total_cvs}+ total conversions, 95%+ win probability. ` +
        `Recommendation: Stop test and select winner.`
      );

    default:
      return 'Unable to determine confidence level.';
  }
}

/**
 * Analyze variant data and generate decision
 */
export function analyzeVariants(
  variants: Array<{ variantId: string; clicks: number; conversions: number }>,
  config: DecisionConfig = {
    sampleThresholds: DEFAULT_SAMPLE_THRESHOLDS,
    confidenceThresholds: DEFAULT_CONFIDENCE_THRESHOLDS,
  }
): DecisionAnalysisResult {
  // Convert to VariantMetrics
  const variantMetrics: VariantMetrics[] = variants.map((v) =>
    createVariantMetrics(v.variantId, v.clicks, v.conversions)
  );

  // Handle edge case: no variants
  if (variantMetrics.length === 0) {
    return {
      confidence: 'insufficient',
      winnerId: null,
      winnerInfo: null,
      ranking: [],
      stats: {
        method: config.confidenceThresholds.method,
        aggregate: { totalClicks: 0, totalConversions: 0, variantCount: 0 },
        wilsonComparisons: [],
        bayesAnalysis: {
          winProbabilities: {},
          expectedLoss: {},
          likelyWinner: null,
          likelyWinnerProbability: 0,
        },
        thresholdsUsed: {
          sample: config.sampleThresholds,
          confidence: config.confidenceThresholds,
        },
      },
      rationale: 'No variants to analyze.',
      recommendation: 'continue',
      additionalSamplesNeeded: null,
    };
  }

  // Calculate aggregate metrics
  const aggregate = calculateAggregateMetrics(variantMetrics);
  const { totalClicks, totalConversions, variantCount } = aggregate;

  // Run Bayesian analysis
  const bayesResult = compareBayesian(
    variantMetrics,
    1, // priorAlpha
    1, // priorBeta
    10000 // simulations
  );

  // Calculate expected loss
  const expectedLossMap = calculateExpectedLoss(variantMetrics);

  // Run Wilson CI analysis
  const wilsonComparisons = compareAllVariantsWilsonCi(
    variantMetrics,
    1 - config.confidenceThresholds.alpha
  );

  // Determine confidence level
  let confidence: ConfidenceLevel;
  if (checkInsufficient(totalClicks, totalConversions, config.sampleThresholds)) {
    confidence = 'insufficient';
  } else if (
    checkConfident(
      totalConversions,
      variantMetrics,
      bayesResult.likelyWinnerProbability,
      config.sampleThresholds
    )
  ) {
    confidence = 'confident';
  } else if (checkDirectional(totalClicks, totalConversions, config.sampleThresholds)) {
    confidence = 'directional';
  } else {
    confidence = 'insufficient';
  }

  // Determine winner (only for confident results)
  const winnerId = confidence === 'confident' ? bayesResult.likelyWinner : null;

  // Build ranking
  const sortedVariants = [...variantMetrics].sort((a, b) => {
    const probA = bayesResult.winProbabilities.get(a.variantId) || 0;
    const probB = bayesResult.winProbabilities.get(b.variantId) || 0;
    if (Math.abs(probA - probB) > 0.01) {
      return probB - probA;
    }
    return b.cvr - a.cvr;
  });

  const ranking: VariantRankingEntry[] = sortedVariants.map((variant, index) => {
    const wilsonCi = calculateVariantWilsonCi(variant, 1 - config.confidenceThresholds.alpha);
    const winProbability = bayesResult.winProbabilities.get(variant.variantId) || 0;
    const score = winProbability * 0.7 + variant.cvr * 0.3;

    return {
      rank: index + 1,
      variantId: variant.variantId,
      cvr: variant.cvr,
      conversions: variant.conversions,
      clicks: variant.clicks,
      winProbability,
      score,
      wilsonCi: {
        lower: wilsonCi.lower,
        upper: wilsonCi.upper,
        point: wilsonCi.point,
      },
    };
  });

  // Build winner info
  let winnerInfo: WinnerInfo | null = null;
  if (winnerId && ranking.length > 0) {
    const winnerEntry = ranking.find((r) => r.variantId === winnerId);
    if (winnerEntry) {
      winnerInfo = {
        variantId: winnerEntry.variantId,
        cvr: winnerEntry.cvr,
        conversions: winnerEntry.conversions,
        clicks: winnerEntry.clicks,
        winProbability: winnerEntry.winProbability,
        wilsonCi: calculateVariantWilsonCi(
          variantMetrics.find((v) => v.variantId === winnerId)!,
          1 - config.confidenceThresholds.alpha
        ),
      };
    }
  }

  // Convert maps to records for JSON serialization
  const winProbabilitiesRecord: Record<string, number> = {};
  Array.from(bayesResult.winProbabilities.entries()).forEach(([id, prob]) => {
    winProbabilitiesRecord[id] = prob;
  });

  const expectedLossRecord: Record<string, number> = {};
  Array.from(expectedLossMap.entries()).forEach(([id, loss]) => {
    expectedLossRecord[id] = loss;
  });

  // Build stats details
  const stats: StatsDetails = {
    method: config.confidenceThresholds.method,
    aggregate: {
      totalClicks,
      totalConversions,
      variantCount,
    },
    wilsonComparisons: wilsonComparisons.map((c) => ({
      variantA: c.variantA.variantId,
      variantB: c.variantB.variantId,
      overlapping: c.overlapping,
      relativeLift: c.relativeLift,
      aSignificantlyBetter: c.aSignificantlyBetter,
      bSignificantlyBetter: c.bSignificantlyBetter,
    })),
    bayesAnalysis: {
      winProbabilities: winProbabilitiesRecord,
      expectedLoss: expectedLossRecord,
      likelyWinner: bayesResult.likelyWinner,
      likelyWinnerProbability: bayesResult.likelyWinnerProbability,
    },
    thresholdsUsed: {
      sample: config.sampleThresholds,
      confidence: config.confidenceThresholds,
    },
  };

  // Generate rationale
  const rationale = generateDetailedRationale(
    confidence,
    aggregate,
    bayesResult.likelyWinner,
    bayesResult.likelyWinnerProbability,
    config.sampleThresholds
  );

  // Determine recommendation
  let recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
  if (confidence === 'confident' && winnerId) {
    recommendation = 'stop_winner';
  } else {
    recommendation = 'continue';
  }

  // Calculate additional samples needed
  const additionalSamplesNeeded = calculateAdditionalSamples(
    totalClicks,
    totalConversions,
    config.sampleThresholds
  );

  return {
    confidence,
    winnerId,
    winnerInfo,
    ranking,
    stats,
    rationale,
    recommendation,
    additionalSamplesNeeded,
  };
}

/**
 * Decision Service class for database operations
 */
export class DecisionService {
  constructor(private decisionRepository: IDecisionRepository) {}

  /**
   * Create a new decision from analysis result
   */
  async createDecision(
    runId: string,
    analysis: DecisionAnalysisResult,
    userId?: string,
    finalize: boolean = false
  ): Promise<Decision> {
    const input: CreateDecisionInput = {
      runId,
      status: finalize ? 'final' : 'draft',
      confidence: analysis.confidence as DecisionConfidence,
      winnerJson: JSON.stringify(analysis.winnerInfo ?? {}),
      rankingJson: JSON.stringify(analysis.ranking),
      statsJson: JSON.stringify(analysis.stats),
      rationale: analysis.rationale,
      decidedAt: finalize ? new Date().toISOString() : null,
      createdByUserId: userId ?? null,
    };

    return this.decisionRepository.create(input);
  }

  /**
   * Update an existing decision with new analysis
   */
  async updateDecision(
    decisionId: string,
    analysis: DecisionAnalysisResult,
    finalize: boolean = false
  ): Promise<Decision | null> {
    return this.decisionRepository.update(decisionId, {
      status: finalize ? 'final' : 'draft',
      confidence: analysis.confidence as DecisionConfidence,
      winnerJson: JSON.stringify(analysis.winnerInfo ?? {}),
      rankingJson: JSON.stringify(analysis.ranking),
      statsJson: JSON.stringify(analysis.stats),
      rationale: analysis.rationale,
      decidedAt: finalize ? new Date().toISOString() : null,
    });
  }

  /**
   * Get the latest decision for a run
   */
  async getLatestDecision(runId: string): Promise<Decision | null> {
    return this.decisionRepository.findLatestByRunId(runId);
  }

  /**
   * Get the final decision for a run
   */
  async getFinalDecision(runId: string): Promise<Decision | null> {
    return this.decisionRepository.findFinalByRunId(runId);
  }

  /**
   * Mark a decision as final
   */
  async finalizeDecision(decisionId: string): Promise<Decision | null> {
    return this.decisionRepository.markFinal(decisionId);
  }

  /**
   * Check if a run has a final decision
   */
  async hasFinalDecision(runId: string): Promise<boolean> {
    return this.decisionRepository.hasFinalDecision(runId);
  }

  /**
   * Get all decisions for a run
   */
  async getDecisionHistory(runId: string) {
    return this.decisionRepository.findByRunId(runId);
  }
}
