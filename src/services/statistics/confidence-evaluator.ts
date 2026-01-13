/**
 * Confidence Level Evaluator
 *
 * Determines the confidence level of statistical conclusions based on:
 * - Sample size thresholds
 * - Statistical significance
 * - Bayesian win probabilities
 *
 * Three confidence levels:
 * - Insufficient: Not enough data to draw any conclusions
 * - Directional: Can see a trend but not statistically significant
 * - Confident: Statistically significant with high confidence
 */

import type {
  ConfidenceLevel,
  VariantMetrics,
  SampleThresholds,
  DecisionResult,
  BayesianComparison,
  RankingEntry,
  StatisticsConfig,
} from '../../types/statistics.js';

import {
  DEFAULT_SAMPLE_THRESHOLDS,
  INSUFFICIENT_THRESHOLDS,
  DEFAULT_STATISTICS_CONFIG,
} from '../../types/statistics.js';

import { calculateVariantWilsonCi } from './wilson-ci.js';

import { compareBayesian } from './bayes.js';

/**
 * Aggregate metrics for all variants
 */
interface AggregateMetrics {
  totalClicks: number;
  totalConversions: number;
  variantCount: number;
}

/**
 * Calculate aggregate metrics from variants
 */
export function calculateAggregateMetrics(variants: VariantMetrics[]): AggregateMetrics {
  return {
    totalClicks: variants.reduce((sum, v) => sum + v.clicks, 0),
    totalConversions: variants.reduce((sum, v) => sum + v.conversions, 0),
    variantCount: variants.length,
  };
}

/**
 * Determine if data is insufficient for any conclusions
 *
 * Insufficient: totalClicks < 200 AND totalCV < 3
 */
export function isInsufficient(aggregate: AggregateMetrics): boolean {
  return (
    aggregate.totalClicks < INSUFFICIENT_THRESHOLDS.minClicks &&
    aggregate.totalConversions < INSUFFICIENT_THRESHOLDS.minCv
  );
}

/**
 * Determine if data supports directional conclusions
 *
 * Directional: totalClicks >= 200 OR totalCV >= 5
 */
export function isDirectional(aggregate: AggregateMetrics, thresholds: SampleThresholds): boolean {
  return (
    aggregate.totalClicks >= thresholds.minClicksDirectional ||
    aggregate.totalConversions >= thresholds.minCvDirectional
  );
}

/**
 * Determine if data supports confident conclusions
 *
 * Confident: totalCV >= 20 AND top variant has significant CVR advantage
 */
export function isConfident(
  aggregate: AggregateMetrics,
  thresholds: SampleThresholds,
  topVariant: VariantMetrics | null,
  otherVariants: VariantMetrics[],
  bayesianResult: BayesianComparison
): boolean {
  // Must have minimum conversions
  if (aggregate.totalConversions < thresholds.minCvConfident) {
    return false;
  }

  // Must have a top variant
  if (!topVariant || otherVariants.length === 0) {
    return false;
  }

  // Check if top variant has significant lift over second best
  const secondBest = otherVariants.reduce(
    (best, v) => (v.cvr > (best?.cvr || 0) ? v : best),
    null as VariantMetrics | null
  );

  if (!secondBest || secondBest.cvr === 0) {
    // If second best has 0 CVR, require minimum lift from baseline
    return topVariant.cvr >= thresholds.minCvrLiftConfident;
  }

  const relativeLift = (topVariant.cvr - secondBest.cvr) / secondBest.cvr;

  // Must have minimum relative lift
  if (relativeLift < thresholds.minCvrLiftConfident) {
    return false;
  }

  // Bayesian win probability must be high (>95%)
  const topWinProb = bayesianResult.winProbabilities.get(topVariant.variantId) || 0;
  if (topWinProb < 0.95) {
    return false;
  }

  return true;
}

/**
 * Determine confidence level based on data and thresholds
 */
export function determineConfidenceLevel(
  variants: VariantMetrics[],
  thresholds: SampleThresholds = DEFAULT_SAMPLE_THRESHOLDS,
  bayesianResult?: BayesianComparison
): ConfidenceLevel {
  const aggregate = calculateAggregateMetrics(variants);

  // Check insufficient first
  if (isInsufficient(aggregate)) {
    return 'insufficient';
  }

  // Sort variants by CVR to find top performer
  const sortedVariants = [...variants].sort((a, b) => b.cvr - a.cvr);
  const topVariant = sortedVariants[0] || null;
  const otherVariants = sortedVariants.slice(1);

  // Calculate Bayesian result if not provided
  const bayes = bayesianResult || compareBayesian(variants);

  // Check confident level
  if (isConfident(aggregate, thresholds, topVariant, otherVariants, bayes)) {
    return 'confident';
  }

  // Check directional level
  if (isDirectional(aggregate, thresholds)) {
    return 'directional';
  }

  return 'insufficient';
}

/**
 * Calculate additional samples needed to reach confident level
 *
 * Uses a simple heuristic based on current conversion rate
 * and required minimum conversions
 */
export function calculateAdditionalSamplesNeeded(
  aggregate: AggregateMetrics,
  thresholds: SampleThresholds = DEFAULT_SAMPLE_THRESHOLDS
): number | null {
  // If already confident, no additional samples needed
  if (aggregate.totalConversions >= thresholds.minCvConfident) {
    return null;
  }

  // Calculate current CVR
  const currentCvr = aggregate.totalClicks > 0 ? aggregate.totalConversions / aggregate.totalClicks : 0;

  // If no CVR data, use industry average estimate (1%)
  const estimatedCvr = currentCvr > 0 ? currentCvr : 0.01;

  // Calculate clicks needed to reach min CV threshold
  const conversionsNeeded = thresholds.minCvConfident - aggregate.totalConversions;
  const clicksNeeded = Math.ceil(conversionsNeeded / estimatedCvr);

  return Math.max(0, clicksNeeded);
}

/**
 * Generate human-readable rationale for the decision
 */
export function generateRationale(
  confidence: ConfidenceLevel,
  aggregate: AggregateMetrics,
  winnerId: string | null,
  topWinProbability: number
): string {
  const { totalClicks, totalConversions, variantCount } = aggregate;

  switch (confidence) {
    case 'insufficient':
      return (
        `Insufficient data for analysis. ` +
        `Current: ${totalClicks} clicks, ${totalConversions} conversions across ${variantCount} variants. ` +
        `Need at least 200 clicks or 3 conversions to see trends.`
      );

    case 'directional':
      if (winnerId) {
        return (
          `Directional trend detected. ` +
          `${winnerId} is currently leading with ${(topWinProbability * 100).toFixed(1)}% win probability. ` +
          `However, the result is not yet statistically significant. ` +
          `Continue collecting data for confident conclusions.`
        );
      }
      return (
        `Directional trend detected but no clear leader. ` +
        `${totalClicks} clicks, ${totalConversions} conversions across ${variantCount} variants. ` +
        `Continue collecting data.`
      );

    case 'confident':
      return (
        `Confident result. ` +
        `${winnerId} is the winner with ${(topWinProbability * 100).toFixed(1)}% probability of being the best. ` +
        `Based on ${totalClicks} clicks and ${totalConversions} conversions. ` +
        `Recommend stopping the test and selecting the winner.`
      );

    default:
      return 'Unable to determine confidence level.';
  }
}

/**
 * Determine recommendation based on confidence level and results
 */
export function determineRecommendation(
  confidence: ConfidenceLevel,
  winnerId: string | null
): 'continue' | 'stop_winner' | 'stop_no_winner' {
  if (confidence === 'confident' && winnerId) {
    return 'stop_winner';
  }

  if (confidence === 'insufficient') {
    return 'continue';
  }

  // Directional - continue collecting
  return 'continue';
}

/**
 * Build ranking entries from variants with all analysis data
 */
export function buildRankingEntries(
  variants: VariantMetrics[],
  bayesianResult: BayesianComparison,
  wilsonConfidenceLevel: number = 0.95
): RankingEntry[] {
  // Sort by Bayesian win probability (primary) and CVR (secondary)
  const sortedVariants = [...variants].sort((a, b) => {
    const probA = bayesianResult.winProbabilities.get(a.variantId) || 0;
    const probB = bayesianResult.winProbabilities.get(b.variantId) || 0;

    if (Math.abs(probA - probB) > 0.01) {
      return probB - probA;
    }
    return b.cvr - a.cvr;
  });

  return sortedVariants.map((variant, index) => {
    const wilsonCi = calculateVariantWilsonCi(variant, wilsonConfidenceLevel);
    const bayesianWinProbability = bayesianResult.winProbabilities.get(variant.variantId) || 0;

    // Combined score: weighted average of win probability and normalized CVR
    const score = bayesianWinProbability * 0.7 + variant.cvr * 0.3;

    return {
      rank: index + 1,
      variantId: variant.variantId,
      metrics: variant,
      wilsonCi,
      bayesianWinProbability,
      score,
    };
  });
}

/**
 * Evaluate confidence level and generate decision result
 *
 * This is the main entry point for confidence evaluation
 */
export function evaluateConfidence(
  variants: VariantMetrics[],
  config: StatisticsConfig = DEFAULT_STATISTICS_CONFIG
): DecisionResult {
  // Handle edge case: no variants
  if (variants.length === 0) {
    return {
      confidence: 'insufficient',
      winnerId: null,
      ranking: [],
      rationale: 'No variants to analyze.',
      recommendation: 'continue',
      additionalSamplesNeeded: null,
    };
  }

  // Handle edge case: single variant
  if (variants.length === 1) {
    const aggregate = calculateAggregateMetrics(variants);
    return {
      confidence: 'insufficient',
      winnerId: null,
      ranking: buildRankingEntries(
        variants,
        {
          variants: [],
          winProbabilities: new Map([[variants[0].variantId, 1]]),
          likelyWinner: variants[0].variantId,
          likelyWinnerProbability: 1,
        },
        config.wilsonConfidenceLevel
      ),
      rationale: 'Only one variant present. Cannot compare performance.',
      recommendation: 'continue',
      additionalSamplesNeeded: calculateAdditionalSamplesNeeded(aggregate, config.thresholds),
    };
  }

  // Calculate aggregate metrics
  const aggregate = calculateAggregateMetrics(variants);

  // Run Bayesian analysis
  const bayesianResult = compareBayesian(
    variants,
    config.bayesPriorAlpha,
    config.bayesPriorBeta,
    config.bayesSimulations
  );

  // Determine confidence level
  const confidence = determineConfidenceLevel(variants, config.thresholds, bayesianResult);

  // Build ranking
  const ranking = buildRankingEntries(variants, bayesianResult, config.wilsonConfidenceLevel);

  // Determine winner (only if confident)
  const winnerId = confidence === 'confident' ? bayesianResult.likelyWinner : null;

  // Generate rationale
  const rationale = generateRationale(
    confidence,
    aggregate,
    bayesianResult.likelyWinner,
    bayesianResult.likelyWinnerProbability
  );

  // Determine recommendation
  const recommendation = determineRecommendation(confidence, winnerId);

  // Calculate additional samples needed
  const additionalSamplesNeeded =
    confidence !== 'confident' ? calculateAdditionalSamplesNeeded(aggregate, config.thresholds) : null;

  return {
    confidence,
    winnerId,
    ranking,
    rationale,
    recommendation,
    additionalSamplesNeeded,
  };
}

/**
 * Create variant metrics from raw data
 * Convenience function for creating VariantMetrics objects
 */
export function createVariantMetrics(
  variantId: string,
  clicks: number,
  conversions: number
): VariantMetrics {
  const cvr = clicks > 0 ? conversions / clicks : 0;
  return {
    variantId,
    clicks,
    conversions,
    cvr,
  };
}
