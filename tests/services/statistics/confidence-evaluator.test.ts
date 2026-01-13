import { describe, it, expect } from 'vitest';
import {
  calculateAggregateMetrics,
  isInsufficient,
  isDirectional,
  determineConfidenceLevel,
  calculateAdditionalSamplesNeeded,
  generateRationale,
  determineRecommendation,
  evaluateConfidence,
  createVariantMetrics,
} from '../../../src/services/statistics/confidence-evaluator.js';
import { DEFAULT_SAMPLE_THRESHOLDS } from '../../../src/types/statistics.js';
import type { VariantMetrics } from '../../../src/types/statistics.js';

describe('Confidence Evaluator', () => {
  describe('calculateAggregateMetrics', () => {
    it('should calculate totals correctly', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 100, conversions: 5, cvr: 0.05 },
        { variantId: 'b', clicks: 150, conversions: 10, cvr: 0.067 },
      ];

      const result = calculateAggregateMetrics(variants);
      expect(result.totalClicks).toBe(250);
      expect(result.totalConversions).toBe(15);
      expect(result.variantCount).toBe(2);
    });

    it('should handle empty array', () => {
      const result = calculateAggregateMetrics([]);
      expect(result.totalClicks).toBe(0);
      expect(result.totalConversions).toBe(0);
      expect(result.variantCount).toBe(0);
    });
  });

  describe('isInsufficient', () => {
    it('should return true when both clicks and CV are below thresholds', () => {
      const aggregate = { totalClicks: 100, totalConversions: 2, variantCount: 2 };
      expect(isInsufficient(aggregate)).toBe(true);
    });

    it('should return false when clicks are sufficient', () => {
      const aggregate = { totalClicks: 200, totalConversions: 2, variantCount: 2 };
      expect(isInsufficient(aggregate)).toBe(false);
    });

    it('should return false when conversions are sufficient', () => {
      const aggregate = { totalClicks: 100, totalConversions: 3, variantCount: 2 };
      expect(isInsufficient(aggregate)).toBe(false);
    });
  });

  describe('isDirectional', () => {
    it('should return true when clicks threshold is met', () => {
      const aggregate = { totalClicks: 200, totalConversions: 2, variantCount: 2 };
      expect(isDirectional(aggregate, DEFAULT_SAMPLE_THRESHOLDS)).toBe(true);
    });

    it('should return true when CV threshold is met', () => {
      const aggregate = { totalClicks: 100, totalConversions: 5, variantCount: 2 };
      expect(isDirectional(aggregate, DEFAULT_SAMPLE_THRESHOLDS)).toBe(true);
    });

    it('should return false when neither threshold is met', () => {
      const aggregate = { totalClicks: 100, totalConversions: 3, variantCount: 2 };
      expect(isDirectional(aggregate, DEFAULT_SAMPLE_THRESHOLDS)).toBe(false);
    });
  });

  describe('determineConfidenceLevel', () => {
    it('should return insufficient for very small data', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 50, conversions: 1, cvr: 0.02 },
        { variantId: 'b', clicks: 50, conversions: 1, cvr: 0.02 },
      ];

      expect(determineConfidenceLevel(variants)).toBe('insufficient');
    });

    it('should return directional when enough data for trends', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 150, conversions: 5, cvr: 0.033 },
        { variantId: 'b', clicks: 150, conversions: 8, cvr: 0.053 },
      ];

      expect(determineConfidenceLevel(variants)).toBe('directional');
    });

    it('should return confident when there is a clear winner', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 5000, conversions: 500, cvr: 0.1 },
        { variantId: 'b', clicks: 5000, conversions: 100, cvr: 0.02 },
      ];

      expect(determineConfidenceLevel(variants)).toBe('confident');
    });
  });

  describe('calculateAdditionalSamplesNeeded', () => {
    it('should return null when already confident', () => {
      const aggregate = { totalClicks: 5000, totalConversions: 100, variantCount: 2 };
      const result = calculateAdditionalSamplesNeeded(aggregate);
      expect(result).toBeNull();
    });

    it('should estimate additional clicks needed', () => {
      const aggregate = { totalClicks: 1000, totalConversions: 10, variantCount: 2 };
      const result = calculateAdditionalSamplesNeeded(aggregate);
      expect(result).toBeGreaterThan(0);
    });

    it('should use default CVR estimate when no data', () => {
      const aggregate = { totalClicks: 0, totalConversions: 0, variantCount: 2 };
      const result = calculateAdditionalSamplesNeeded(aggregate);
      // With 0 CVR data, should use 1% estimate
      // Need 20 conversions at 1% = 2000 clicks
      expect(result).toBe(2000);
    });
  });

  describe('generateRationale', () => {
    it('should generate insufficient rationale', () => {
      const aggregate = { totalClicks: 100, totalConversions: 2, variantCount: 2 };
      const rationale = generateRationale('insufficient', aggregate, null, 0);
      expect(rationale).toContain('Insufficient');
      expect(rationale).toContain('100 clicks');
    });

    it('should generate directional rationale with winner', () => {
      const aggregate = { totalClicks: 500, totalConversions: 10, variantCount: 2 };
      const rationale = generateRationale('directional', aggregate, 'variant-a', 0.75);
      expect(rationale).toContain('Directional');
      expect(rationale).toContain('variant-a');
      expect(rationale).toContain('75');
    });

    it('should generate confident rationale', () => {
      const aggregate = { totalClicks: 5000, totalConversions: 100, variantCount: 2 };
      const rationale = generateRationale('confident', aggregate, 'winner', 0.98);
      expect(rationale).toContain('Confident');
      expect(rationale).toContain('winner');
      expect(rationale).toContain('98');
    });
  });

  describe('determineRecommendation', () => {
    it('should recommend continue for insufficient', () => {
      expect(determineRecommendation('insufficient', null)).toBe('continue');
    });

    it('should recommend continue for directional', () => {
      expect(determineRecommendation('directional', 'any')).toBe('continue');
    });

    it('should recommend stop_winner for confident with winner', () => {
      expect(determineRecommendation('confident', 'winner-id')).toBe('stop_winner');
    });

    it('should recommend continue for confident without winner', () => {
      expect(determineRecommendation('confident', null)).toBe('continue');
    });
  });

  describe('evaluateConfidence', () => {
    it('should return insufficient for empty variants', () => {
      const result = evaluateConfidence([]);
      expect(result.confidence).toBe('insufficient');
      expect(result.winnerId).toBeNull();
      expect(result.ranking).toHaveLength(0);
    });

    it('should return insufficient for single variant', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'only', clicks: 1000, conversions: 50, cvr: 0.05 },
      ];

      const result = evaluateConfidence(variants);
      expect(result.confidence).toBe('insufficient');
      expect(result.rationale).toContain('Only one variant');
    });

    it('should return complete decision result', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 5000, conversions: 500, cvr: 0.1 },
        { variantId: 'b', clicks: 5000, conversions: 100, cvr: 0.02 },
      ];

      const result = evaluateConfidence(variants);
      expect(result.confidence).toBeDefined();
      expect(result.ranking).toHaveLength(2);
      expect(result.rationale).toBeDefined();
      expect(result.recommendation).toBeDefined();
    });

    it('should rank variants correctly', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'loser', clicks: 5000, conversions: 100, cvr: 0.02 },
        { variantId: 'winner', clicks: 5000, conversions: 500, cvr: 0.1 },
      ];

      const result = evaluateConfidence(variants);
      expect(result.ranking[0].variantId).toBe('winner');
      expect(result.ranking[1].variantId).toBe('loser');
    });
  });

  describe('createVariantMetrics', () => {
    it('should create metrics with calculated CVR', () => {
      const result = createVariantMetrics('test', 1000, 50);
      expect(result.variantId).toBe('test');
      expect(result.clicks).toBe(1000);
      expect(result.conversions).toBe(50);
      expect(result.cvr).toBe(0.05);
    });

    it('should handle zero clicks', () => {
      const result = createVariantMetrics('test', 0, 0);
      expect(result.cvr).toBe(0);
    });
  });
});
