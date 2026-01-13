import { describe, it, expect } from 'vitest';
import {
  calculateWilsonCi,
  calculateVariantWilsonCi,
  compareVariantsWilsonCi,
  compareAllVariantsWilsonCi,
  isSignificantWinner,
} from '../../../src/services/statistics/wilson-ci.js';
import type { VariantMetrics } from '../../../src/types/statistics.js';

describe('Wilson CI Calculator', () => {
  describe('calculateWilsonCi', () => {
    it('should return zeros for zero trials', () => {
      const result = calculateWilsonCi(0, 0);
      expect(result.point).toBe(0);
      expect(result.lower).toBe(0);
      expect(result.upper).toBe(0);
    });

    it('should handle zero successes', () => {
      const result = calculateWilsonCi(0, 100);
      expect(result.point).toBe(0);
      // Wilson CI lower bound is close to 0 but not exactly 0
      expect(result.lower).toBeGreaterThanOrEqual(0);
      expect(result.lower).toBeLessThan(0.01);
      expect(result.upper).toBeGreaterThan(0);
      expect(result.upper).toBeLessThan(0.1); // Should be reasonably small
    });

    it('should handle all successes', () => {
      const result = calculateWilsonCi(100, 100);
      expect(result.point).toBe(1);
      expect(result.lower).toBeGreaterThan(0.9);
      // Wilson CI upper bound is close to 1 but not exactly 1
      expect(result.upper).toBeGreaterThan(0.99);
      expect(result.upper).toBeLessThanOrEqual(1);
    });

    it('should calculate reasonable CI for typical data', () => {
      // 50 conversions out of 1000 clicks = 5% CVR
      const result = calculateWilsonCi(50, 1000, 0.95);
      expect(result.point).toBeCloseTo(0.05, 3);
      expect(result.lower).toBeGreaterThan(0.03);
      expect(result.upper).toBeLessThan(0.07);
      expect(result.confidenceLevel).toBe(0.95);
    });

    it('should give wider intervals with lower confidence', () => {
      const ci95 = calculateWilsonCi(50, 1000, 0.95);
      const ci99 = calculateWilsonCi(50, 1000, 0.99);

      expect(ci99.upper - ci99.lower).toBeGreaterThan(ci95.upper - ci95.lower);
    });

    it('should never produce intervals outside [0, 1]', () => {
      // Test edge cases
      const testCases = [
        { successes: 1, trials: 10 },
        { successes: 9, trials: 10 },
        { successes: 1, trials: 1000 },
        { successes: 999, trials: 1000 },
      ];

      for (const { successes, trials } of testCases) {
        const result = calculateWilsonCi(successes, trials);
        expect(result.lower).toBeGreaterThanOrEqual(0);
        expect(result.upper).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('calculateVariantWilsonCi', () => {
    it('should calculate CI from variant metrics', () => {
      const variant: VariantMetrics = {
        variantId: 'var-a',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };

      const result = calculateVariantWilsonCi(variant);
      expect(result.point).toBeCloseTo(0.05, 3);
      expect(result.lower).toBeLessThan(0.05);
      expect(result.upper).toBeGreaterThan(0.05);
    });
  });

  describe('compareVariantsWilsonCi', () => {
    it('should detect overlapping intervals', () => {
      const variantA: VariantMetrics = {
        variantId: 'var-a',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };
      const variantB: VariantMetrics = {
        variantId: 'var-b',
        clicks: 1000,
        conversions: 55,
        cvr: 0.055,
      };

      const result = compareVariantsWilsonCi(variantA, variantB);
      expect(result.overlapping).toBe(true);
      expect(result.aSignificantlyBetter).toBe(false);
      expect(result.bSignificantlyBetter).toBe(false);
    });

    it('should detect non-overlapping intervals (A significantly better)', () => {
      const variantA: VariantMetrics = {
        variantId: 'var-a',
        clicks: 10000,
        conversions: 800,
        cvr: 0.08,
      };
      const variantB: VariantMetrics = {
        variantId: 'var-b',
        clicks: 10000,
        conversions: 300,
        cvr: 0.03,
      };

      const result = compareVariantsWilsonCi(variantA, variantB);
      expect(result.overlapping).toBe(false);
      expect(result.aSignificantlyBetter).toBe(true);
      expect(result.bSignificantlyBetter).toBe(false);
    });

    it('should calculate relative lift correctly', () => {
      const variantA: VariantMetrics = {
        variantId: 'var-a',
        clicks: 1000,
        conversions: 60,
        cvr: 0.06,
      };
      const variantB: VariantMetrics = {
        variantId: 'var-b',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };

      const result = compareVariantsWilsonCi(variantA, variantB);
      // Lift = (0.06 - 0.05) / 0.05 = 0.2 = 20%
      expect(result.relativeLift).toBeCloseTo(0.2, 2);
    });
  });

  describe('compareAllVariantsWilsonCi', () => {
    it('should generate all pairwise comparisons', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 60, cvr: 0.06 },
        { variantId: 'c', clicks: 1000, conversions: 55, cvr: 0.055 },
      ];

      const result = compareAllVariantsWilsonCi(variants);
      // 3 variants = 3 pairs (a-b, a-c, b-c)
      expect(result).toHaveLength(3);
    });

    it('should return empty array for single variant', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
      ];

      const result = compareAllVariantsWilsonCi(variants);
      expect(result).toHaveLength(0);
    });
  });

  describe('isSignificantWinner', () => {
    it('should return true when variant beats all others', () => {
      const target: VariantMetrics = {
        variantId: 'winner',
        clicks: 10000,
        conversions: 800,
        cvr: 0.08,
      };
      const others: VariantMetrics[] = [
        { variantId: 'loser1', clicks: 10000, conversions: 200, cvr: 0.02 },
        { variantId: 'loser2', clicks: 10000, conversions: 300, cvr: 0.03 },
      ];

      expect(isSignificantWinner(target, others)).toBe(true);
    });

    it('should return false when intervals overlap with any variant', () => {
      const target: VariantMetrics = {
        variantId: 'candidate',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };
      const others: VariantMetrics[] = [
        { variantId: 'similar', clicks: 1000, conversions: 48, cvr: 0.048 },
      ];

      expect(isSignificantWinner(target, others)).toBe(false);
    });

    it('should return false for empty others array', () => {
      const target: VariantMetrics = {
        variantId: 'solo',
        clicks: 1000,
        conversions: 50,
        cvr: 0.05,
      };

      expect(isSignificantWinner(target, [])).toBe(false);
    });
  });
});
