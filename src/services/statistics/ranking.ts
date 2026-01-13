/**
 * Ranking Service
 *
 * Provides ranking and winner determination functionality for A/B test variants.
 * Combines multiple statistical approaches for robust ranking:
 * - Point estimates (CVR)
 * - Wilson confidence intervals
 * - Bayesian win probabilities
 */

import type {
  VariantMetrics,
  RankingEntry,
  StatisticsResult,
  StatisticsConfig,
  BayesianComparison,
} from '../../types/statistics.js';

import { DEFAULT_STATISTICS_CONFIG } from '../../types/statistics.js';

import {
  calculateVariantWilsonCi,
  compareAllVariantsWilsonCi,
  isSignificantWinner,
} from './wilson-ci.js';

import { compareBayesian, calculateExpectedLoss } from './bayes.js';

import {
  evaluateConfidence,
  calculateAggregateMetrics,
  createVariantMetrics,
} from './confidence-evaluator.js';

/**
 * Sorting criteria for variant ranking
 */
export type SortCriteria =
  | 'bayesian_probability'
  | 'cvr'
  | 'wilson_lower'
  | 'expected_loss'
  | 'composite';

/**
 * Sort variants by the specified criteria
 */
export function sortVariants(
  variants: VariantMetrics[],
  criteria: SortCriteria,
  bayesianResult?: BayesianComparison,
  expectedLoss?: Map<string, number>,
  config: StatisticsConfig = DEFAULT_STATISTICS_CONFIG
): VariantMetrics[] {
  const sorted = [...variants];

  switch (criteria) {
    case 'cvr':
      // Sort by CVR descending
      sorted.sort((a, b) => b.cvr - a.cvr);
      break;

    case 'wilson_lower':
      // Sort by Wilson CI lower bound descending (conservative ranking)
      sorted.sort((a, b) => {
        const ciA = calculateVariantWilsonCi(a, config.wilsonConfidenceLevel);
        const ciB = calculateVariantWilsonCi(b, config.wilsonConfidenceLevel);
        return ciB.lower - ciA.lower;
      });
      break;

    case 'bayesian_probability':
      // Sort by Bayesian win probability descending
      if (bayesianResult) {
        sorted.sort((a, b) => {
          const probA = bayesianResult.winProbabilities.get(a.variantId) || 0;
          const probB = bayesianResult.winProbabilities.get(b.variantId) || 0;
          return probB - probA;
        });
      }
      break;

    case 'expected_loss':
      // Sort by expected loss ascending (lower loss = better)
      if (expectedLoss) {
        sorted.sort((a, b) => {
          const lossA = expectedLoss.get(a.variantId) || Infinity;
          const lossB = expectedLoss.get(b.variantId) || Infinity;
          return lossA - lossB;
        });
      }
      break;

    case 'composite':
    default: {
      // Composite score: weighted combination of all criteria
      const scores = new Map<string, number>();

      for (const variant of variants) {
        let score = 0;

        // CVR contribution (30%)
        score += variant.cvr * 0.3;

        // Wilson lower bound contribution (20%)
        const ci = calculateVariantWilsonCi(variant, config.wilsonConfidenceLevel);
        score += ci.lower * 0.2;

        // Bayesian win probability contribution (40%)
        if (bayesianResult) {
          const prob = bayesianResult.winProbabilities.get(variant.variantId) || 0;
          score += prob * 0.4;
        }

        // Expected loss contribution (10%, inverted)
        if (expectedLoss) {
          const loss = expectedLoss.get(variant.variantId) || 0;
          // Lower loss = higher score
          const maxLoss = Math.max(...Array.from(expectedLoss.values()));
          const normalizedLoss = maxLoss > 0 ? 1 - loss / maxLoss : 1;
          score += normalizedLoss * 0.1;
        }

        scores.set(variant.variantId, score);
      }

      sorted.sort((a, b) => {
        const scoreA = scores.get(a.variantId) || 0;
        const scoreB = scores.get(b.variantId) || 0;
        return scoreB - scoreA;
      });
      break;
    }
  }

  return sorted;
}

/**
 * Generate ranking with full analysis data
 */
export function generateRanking(
  variants: VariantMetrics[],
  config: StatisticsConfig = DEFAULT_STATISTICS_CONFIG
): RankingEntry[] {
  if (variants.length === 0) {
    return [];
  }

  // Run Bayesian analysis
  const bayesianResult = compareBayesian(
    variants,
    config.bayesPriorAlpha,
    config.bayesPriorBeta,
    config.bayesSimulations
  );

  // Calculate expected loss
  const expectedLoss = calculateExpectedLoss(
    variants,
    config.bayesPriorAlpha,
    config.bayesPriorBeta,
    config.bayesSimulations
  );

  // Sort using composite criteria
  const sortedVariants = sortVariants(
    variants,
    'composite',
    bayesianResult,
    expectedLoss,
    config
  );

  // Build ranking entries
  return sortedVariants.map((variant, index) => {
    const wilsonCi = calculateVariantWilsonCi(variant, config.wilsonConfidenceLevel);
    const bayesianWinProbability = bayesianResult.winProbabilities.get(variant.variantId) || 0;
    const loss = expectedLoss.get(variant.variantId) || 0;

    // Composite score
    const score =
      variant.cvr * 0.3 +
      wilsonCi.lower * 0.2 +
      bayesianWinProbability * 0.4 +
      (1 - loss) * 0.1;

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
 * Determine winner from ranking
 *
 * Returns winner only if:
 * - Ranking has entries
 * - Top ranked variant has significantly higher win probability
 */
export function determineWinner(
  ranking: RankingEntry[],
  minWinProbability: number = 0.95
): string | null {
  if (ranking.length === 0) {
    return null;
  }

  const topVariant = ranking[0];

  // Must have high win probability
  if (topVariant.bayesianWinProbability < minWinProbability) {
    return null;
  }

  // If second place exists, must have clear separation
  if (ranking.length > 1) {
    const secondVariant = ranking[1];
    const probabilityGap = topVariant.bayesianWinProbability - secondVariant.bayesianWinProbability;

    // Need at least 80% gap (e.g., 95% vs 5%)
    if (probabilityGap < 0.8) {
      return null;
    }
  }

  return topVariant.variantId;
}

/**
 * Check if a variant is a clear winner over all others using Wilson CI
 */
export function isClearWinner(
  variantId: string,
  variants: VariantMetrics[],
  config: StatisticsConfig = DEFAULT_STATISTICS_CONFIG
): boolean {
  const targetVariant = variants.find((v) => v.variantId === variantId);
  if (!targetVariant) {
    return false;
  }

  const otherVariants = variants.filter((v) => v.variantId !== variantId);
  return isSignificantWinner(targetVariant, otherVariants, config.wilsonConfidenceLevel);
}

/**
 * Generate complete statistics result
 *
 * This is the main entry point for full statistical analysis
 */
export function analyzeVariants(
  variants: VariantMetrics[],
  config: StatisticsConfig = DEFAULT_STATISTICS_CONFIG
): StatisticsResult {
  // Evaluate confidence and get decision
  const decision = evaluateConfidence(variants, config);

  // Run Wilson CI comparisons
  const wilsonComparisons = compareAllVariantsWilsonCi(variants, config.wilsonConfidenceLevel);

  // Run Bayesian analysis
  const bayesianAnalysis = compareBayesian(
    variants,
    config.bayesPriorAlpha,
    config.bayesPriorBeta,
    config.bayesSimulations
  );

  // Calculate aggregates
  const aggregate = calculateAggregateMetrics(variants);

  return {
    decision,
    wilsonAnalysis: {
      comparisons: wilsonComparisons,
    },
    bayesianAnalysis,
    aggregate: {
      totalClicks: aggregate.totalClicks,
      totalConversions: aggregate.totalConversions,
      variantCount: aggregate.variantCount,
    },
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Quick analysis for basic winner determination
 * Lighter weight than full analyzeVariants
 */
export function quickAnalysis(
  variants: VariantMetrics[],
  config: StatisticsConfig = DEFAULT_STATISTICS_CONFIG
): {
  winnerId: string | null;
  confidence: string;
  topWinProbability: number;
} {
  if (variants.length === 0) {
    return {
      winnerId: null,
      confidence: 'insufficient',
      topWinProbability: 0,
    };
  }

  const decision = evaluateConfidence(variants, config);

  return {
    winnerId: decision.winnerId,
    confidence: decision.confidence,
    topWinProbability: decision.ranking[0]?.bayesianWinProbability || 0,
  };
}

// Re-export createVariantMetrics for convenience
export { createVariantMetrics };
