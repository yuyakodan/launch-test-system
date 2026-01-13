/**
 * Wilson Score Interval Calculator
 *
 * Implements the Wilson score confidence interval for binomial proportions.
 * This is preferred over the normal approximation (Wald interval) because it:
 * - Works well with small sample sizes
 * - Never produces intervals outside [0, 1]
 * - Has better coverage properties
 *
 * Reference: Wilson, E.B. (1927). "Probable inference, the law of succession,
 * and statistical inference". Journal of the American Statistical Association.
 */

import type {
  VariantMetrics,
  WilsonCiResult,
  WilsonCiComparison,
} from '../../types/statistics.js';

/**
 * Standard normal distribution z-scores for common confidence levels
 */
const Z_SCORES: Record<number, number> = {
  0.9: 1.645,
  0.95: 1.96,
  0.99: 2.576,
};

/**
 * Get z-score for a given confidence level
 * Uses lookup table for common values, approximation for others
 */
function getZScore(confidenceLevel: number): number {
  // Check lookup table first
  if (Z_SCORES[confidenceLevel] !== undefined) {
    return Z_SCORES[confidenceLevel];
  }

  // Use approximation for other values
  // This is the inverse of the standard normal CDF (probit function)
  // Using Abramowitz and Stegun approximation
  const alpha = 1 - confidenceLevel;
  const p = 1 - alpha / 2;

  // Rational approximation
  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.383577518672690e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239e0;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838e0;
  const c4 = -2.549732539343734e0;
  const c5 = 4.374664141464968e0;
  const c6 = 2.938163982698783e0;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996e0;
  const d4 = 3.754408661907416e0;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  } else if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    );
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(
        (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
        ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
      )
    );
  }
}

/**
 * Calculate Wilson score confidence interval for a proportion
 *
 * @param successes - Number of successes (conversions)
 * @param trials - Total number of trials (clicks)
 * @param confidenceLevel - Confidence level (default: 0.95 for 95% CI)
 * @returns Wilson CI result with point estimate and bounds
 */
export function calculateWilsonCi(
  successes: number,
  trials: number,
  confidenceLevel: number = 0.95
): WilsonCiResult {
  // Handle edge cases
  if (trials <= 0) {
    return {
      point: 0,
      lower: 0,
      upper: 0,
      confidenceLevel,
    };
  }

  const n = trials;
  const p = successes / n;
  const z = getZScore(confidenceLevel);
  const z2 = z * z;

  // Wilson score formula
  const denominator = 1 + z2 / n;
  const center = p + z2 / (2 * n);
  const margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / denominator;

  const lower = Math.max(0, (center - margin) / denominator);
  const upper = Math.min(1, (center + margin) / denominator);

  return {
    point: p,
    lower,
    upper,
    confidenceLevel,
  };
}

/**
 * Calculate Wilson CI for a variant's CVR
 *
 * @param variant - Variant metrics
 * @param confidenceLevel - Confidence level (default: 0.95)
 * @returns Wilson CI result
 */
export function calculateVariantWilsonCi(
  variant: VariantMetrics,
  confidenceLevel: number = 0.95
): WilsonCiResult {
  return calculateWilsonCi(variant.conversions, variant.clicks, confidenceLevel);
}

/**
 * Compare two variants using Wilson CI
 *
 * @param variantA - First variant metrics
 * @param variantB - Second variant metrics
 * @param confidenceLevel - Confidence level (default: 0.95)
 * @returns Comparison result
 */
export function compareVariantsWilsonCi(
  variantA: VariantMetrics,
  variantB: VariantMetrics,
  confidenceLevel: number = 0.95
): WilsonCiComparison {
  const ciA = calculateVariantWilsonCi(variantA, confidenceLevel);
  const ciB = calculateVariantWilsonCi(variantB, confidenceLevel);

  // Check if intervals overlap
  const overlapping = ciA.lower <= ciB.upper && ciB.lower <= ciA.upper;

  // Calculate relative lift (A over B)
  const relativeLift = variantB.cvr > 0 ? (variantA.cvr - variantB.cvr) / variantB.cvr : 0;

  // A is significantly better if A's lower bound > B's upper bound
  const aSignificantlyBetter = ciA.lower > ciB.upper;

  // B is significantly better if B's lower bound > A's upper bound
  const bSignificantlyBetter = ciB.lower > ciA.upper;

  return {
    variantA: {
      variantId: variantA.variantId,
      cvr: variantA.cvr,
      ci: ciA,
    },
    variantB: {
      variantId: variantB.variantId,
      cvr: variantB.cvr,
      ci: ciB,
    },
    overlapping,
    relativeLift,
    aSignificantlyBetter,
    bSignificantlyBetter,
  };
}

/**
 * Generate all pairwise Wilson CI comparisons for multiple variants
 *
 * @param variants - Array of variant metrics
 * @param confidenceLevel - Confidence level (default: 0.95)
 * @returns Array of pairwise comparisons
 */
export function compareAllVariantsWilsonCi(
  variants: VariantMetrics[],
  confidenceLevel: number = 0.95
): WilsonCiComparison[] {
  const comparisons: WilsonCiComparison[] = [];

  for (let i = 0; i < variants.length; i++) {
    for (let j = i + 1; j < variants.length; j++) {
      comparisons.push(compareVariantsWilsonCi(variants[i], variants[j], confidenceLevel));
    }
  }

  return comparisons;
}

/**
 * Check if a variant is significantly better than all others
 *
 * @param targetVariant - The variant to check
 * @param otherVariants - Other variants to compare against
 * @param confidenceLevel - Confidence level (default: 0.95)
 * @returns True if target is significantly better than all others
 */
export function isSignificantWinner(
  targetVariant: VariantMetrics,
  otherVariants: VariantMetrics[],
  confidenceLevel: number = 0.95
): boolean {
  if (otherVariants.length === 0) {
    return false;
  }

  for (const other of otherVariants) {
    const comparison = compareVariantsWilsonCi(targetVariant, other, confidenceLevel);
    if (!comparison.aSignificantlyBetter) {
      return false;
    }
  }

  return true;
}
