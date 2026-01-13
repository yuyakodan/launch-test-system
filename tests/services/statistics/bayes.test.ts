import { describe, it, expect } from 'vitest';
import {
  calculateBayesianPosterior,
  calculateWinProbabilities,
  compareBayesian,
  probabilityABeatsB,
  calculateExpectedLoss,
} from '../../../src/services/statistics/bayes.js';
import type { VariantMetrics } from '../../../src/types/statistics.js';

describe('Bayesian Beta-Binomial Analysis', () => {
  describe('calculateBayesianPosterior', () => {
    it('should calculate posterior parameters correctly', () => {
      const variant: VariantMetrics = {
        variantId: 'test',
        clicks: 100,
        conversions: 10,
        cvr: 0.1,
      };

      const result = calculateBayesianPosterior(variant, 1, 1);

      // Alpha = prior_alpha + conversions = 1 + 10 = 11
      expect(result.alpha).toBe(11);
      // Beta = prior_beta + (clicks - conversions) = 1 + 90 = 91
      expect(result.beta).toBe(91);
      // Posterior mean = alpha / (alpha + beta) = 11 / 102
      expect(result.posteriorMean).toBeCloseTo(11 / 102, 3);
    });

    it('should handle zero conversions', () => {
      const variant: VariantMetrics = {
        variantId: 'test',
        clicks: 100,
        conversions: 0,
        cvr: 0,
      };

      const result = calculateBayesianPosterior(variant);
      expect(result.alpha).toBe(1);
      expect(result.beta).toBe(101);
      expect(result.posteriorMean).toBeCloseTo(1 / 102, 3);
    });

    it('should calculate credible intervals', () => {
      const variant: VariantMetrics = {
        variantId: 'test',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };

      const result = calculateBayesianPosterior(variant);
      expect(result.credibleIntervalLower).toBeLessThan(result.posteriorMean);
      expect(result.credibleIntervalUpper).toBeGreaterThan(result.posteriorMean);
      expect(result.credibleIntervalLower).toBeGreaterThan(0);
      expect(result.credibleIntervalUpper).toBeLessThan(1);
    });

    it('should apply informative prior', () => {
      const variant: VariantMetrics = {
        variantId: 'test',
        clicks: 100,
        conversions: 10,
        cvr: 0.1,
      };

      const uniformResult = calculateBayesianPosterior(variant, 1, 1);
      const informativeResult = calculateBayesianPosterior(variant, 5, 95);

      // Informative prior should pull the mean towards prior expectation
      expect(informativeResult.posteriorMean).not.toBe(uniformResult.posteriorMean);
    });
  });

  describe('calculateWinProbabilities', () => {
    it('should return 100% for single variant', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'only', clicks: 100, conversions: 10, cvr: 0.1 },
      ];

      const result = calculateWinProbabilities(variants);
      expect(result.get('only')).toBe(1);
    });

    it('should sum to approximately 1', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 60, cvr: 0.06 },
        { variantId: 'c', clicks: 1000, conversions: 55, cvr: 0.055 },
      ];

      const result = calculateWinProbabilities(variants);
      const totalProb =
        (result.get('a') || 0) + (result.get('b') || 0) + (result.get('c') || 0);

      expect(totalProb).toBeCloseTo(1, 2);
    });

    it('should give higher probability to better performer', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'winner', clicks: 1000, conversions: 100, cvr: 0.1 },
        { variantId: 'loser', clicks: 1000, conversions: 30, cvr: 0.03 },
      ];

      const result = calculateWinProbabilities(variants);
      expect(result.get('winner')).toBeGreaterThan(result.get('loser')!);
    });

    it('should be reproducible with same seed', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 100, conversions: 10, cvr: 0.1 },
        { variantId: 'b', clicks: 100, conversions: 15, cvr: 0.15 },
      ];

      const result1 = calculateWinProbabilities(variants, 1, 1, 10000, 42);
      const result2 = calculateWinProbabilities(variants, 1, 1, 10000, 42);

      expect(result1.get('a')).toBe(result2.get('a'));
      expect(result1.get('b')).toBe(result2.get('b'));
    });

    it('should return empty map for empty variants', () => {
      const result = calculateWinProbabilities([]);
      expect(result.size).toBe(0);
    });
  });

  describe('compareBayesian', () => {
    it('should identify likely winner', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'winner', clicks: 1000, conversions: 100, cvr: 0.1 },
        { variantId: 'loser', clicks: 1000, conversions: 30, cvr: 0.03 },
      ];

      const result = compareBayesian(variants);
      expect(result.likelyWinner).toBe('winner');
      expect(result.likelyWinnerProbability).toBeGreaterThan(0.9);
    });

    it('should provide variant analysis for all variants', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 60, cvr: 0.06 },
      ];

      const result = compareBayesian(variants);
      expect(result.variants).toHaveLength(2);
      expect(result.winProbabilities.size).toBe(2);
    });
  });

  describe('probabilityABeatsB', () => {
    it('should return high probability when A is clearly better', () => {
      const variantA: VariantMetrics = {
        variantId: 'a',
        clicks: 1000,
        conversions: 100,
        cvr: 0.1,
      };
      const variantB: VariantMetrics = {
        variantId: 'b',
        clicks: 1000,
        conversions: 30,
        cvr: 0.03,
      };

      const prob = probabilityABeatsB(variantA, variantB);
      expect(prob).toBeGreaterThan(0.99);
    });

    it('should return low probability when B is clearly better', () => {
      const variantA: VariantMetrics = {
        variantId: 'a',
        clicks: 1000,
        conversions: 30,
        cvr: 0.03,
      };
      const variantB: VariantMetrics = {
        variantId: 'b',
        clicks: 1000,
        conversions: 100,
        cvr: 0.1,
      };

      const prob = probabilityABeatsB(variantA, variantB);
      expect(prob).toBeLessThan(0.01);
    });

    it('should return ~50% when variants are similar', () => {
      const variantA: VariantMetrics = {
        variantId: 'a',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };
      const variantB: VariantMetrics = {
        variantId: 'b',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };

      const prob = probabilityABeatsB(variantA, variantB);
      expect(prob).toBeGreaterThan(0.4);
      expect(prob).toBeLessThan(0.6);
    });
  });

  describe('calculateExpectedLoss', () => {
    it('should return zero loss for single variant', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'only', clicks: 100, conversions: 10, cvr: 0.1 },
      ];

      const result = calculateExpectedLoss(variants);
      // Single variant always wins, so expected loss is 0
      expect(result.get('only')).toBeCloseTo(0, 2);
    });

    it('should have lower loss for better performer', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'winner', clicks: 1000, conversions: 100, cvr: 0.1 },
        { variantId: 'loser', clicks: 1000, conversions: 30, cvr: 0.03 },
      ];

      const result = calculateExpectedLoss(variants);
      expect(result.get('winner')).toBeLessThan(result.get('loser')!);
    });

    it('should return empty map for empty variants', () => {
      const result = calculateExpectedLoss([]);
      expect(result.size).toBe(0);
    });
  });
});
