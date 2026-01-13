import { describe, it, expect } from 'vitest';
import {
  sortVariants,
  generateRanking,
  determineWinner,
  isClearWinner,
  analyzeVariants,
  quickAnalysis,
  createVariantMetrics,
} from '../../../src/services/statistics/ranking.js';
import { compareBayesian, calculateExpectedLoss } from '../../../src/services/statistics/bayes.js';
import { DEFAULT_STATISTICS_CONFIG } from '../../../src/types/statistics.js';
import type { VariantMetrics } from '../../../src/types/statistics.js';

describe('Ranking Service', () => {
  describe('sortVariants', () => {
    const variants: VariantMetrics[] = [
      { variantId: 'a', clicks: 1000, conversions: 30, cvr: 0.03 },
      { variantId: 'b', clicks: 1000, conversions: 50, cvr: 0.05 },
      { variantId: 'c', clicks: 1000, conversions: 40, cvr: 0.04 },
    ];

    it('should sort by CVR descending', () => {
      const sorted = sortVariants(variants, 'cvr');
      expect(sorted[0].variantId).toBe('b');
      expect(sorted[1].variantId).toBe('c');
      expect(sorted[2].variantId).toBe('a');
    });

    it('should sort by Wilson lower bound', () => {
      const sorted = sortVariants(variants, 'wilson_lower');
      // Higher CVR should have higher lower bound with same sample size
      expect(sorted[0].variantId).toBe('b');
    });

    it('should sort by Bayesian probability', () => {
      const bayesianResult = compareBayesian(variants);
      const sorted = sortVariants(variants, 'bayesian_probability', bayesianResult);
      // B has highest CVR, should have highest win probability
      expect(sorted[0].variantId).toBe('b');
    });

    it('should sort by expected loss ascending', () => {
      const expectedLoss = calculateExpectedLoss(variants);
      const sorted = sortVariants(variants, 'expected_loss', undefined, expectedLoss);
      // B should have lowest expected loss
      expect(sorted[0].variantId).toBe('b');
    });

    it('should use composite scoring by default', () => {
      const bayesianResult = compareBayesian(variants);
      const expectedLoss = calculateExpectedLoss(variants);
      const sorted = sortVariants(
        variants,
        'composite',
        bayesianResult,
        expectedLoss
      );
      expect(sorted[0].variantId).toBe('b');
    });
  });

  describe('generateRanking', () => {
    it('should generate ranking entries with all data', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 60, cvr: 0.06 },
      ];

      const ranking = generateRanking(variants);
      expect(ranking).toHaveLength(2);

      const firstEntry = ranking[0];
      expect(firstEntry.rank).toBe(1);
      expect(firstEntry.wilsonCi).toBeDefined();
      expect(firstEntry.bayesianWinProbability).toBeDefined();
      expect(firstEntry.score).toBeDefined();
    });

    it('should return empty array for empty variants', () => {
      const ranking = generateRanking([]);
      expect(ranking).toHaveLength(0);
    });

    it('should assign sequential ranks', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 30, cvr: 0.03 },
        { variantId: 'b', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'c', clicks: 1000, conversions: 40, cvr: 0.04 },
      ];

      const ranking = generateRanking(variants);
      expect(ranking[0].rank).toBe(1);
      expect(ranking[1].rank).toBe(2);
      expect(ranking[2].rank).toBe(3);
    });
  });

  describe('determineWinner', () => {
    it('should return null for empty ranking', () => {
      expect(determineWinner([])).toBeNull();
    });

    it('should return null when win probability is too low', () => {
      const ranking = [
        {
          rank: 1,
          variantId: 'a',
          metrics: { variantId: 'a', clicks: 100, conversions: 5, cvr: 0.05 },
          wilsonCi: { point: 0.05, lower: 0.02, upper: 0.08, confidenceLevel: 0.95 },
          bayesianWinProbability: 0.6,
          score: 0.5,
        },
      ];

      expect(determineWinner(ranking)).toBeNull();
    });

    it('should return winner when probability is high enough', () => {
      const ranking = [
        {
          rank: 1,
          variantId: 'winner',
          metrics: { variantId: 'winner', clicks: 5000, conversions: 500, cvr: 0.1 },
          wilsonCi: { point: 0.1, lower: 0.09, upper: 0.11, confidenceLevel: 0.95 },
          bayesianWinProbability: 0.99,
          score: 0.95,
        },
        {
          rank: 2,
          variantId: 'loser',
          metrics: { variantId: 'loser', clicks: 5000, conversions: 100, cvr: 0.02 },
          wilsonCi: { point: 0.02, lower: 0.016, upper: 0.024, confidenceLevel: 0.95 },
          bayesianWinProbability: 0.01,
          score: 0.2,
        },
      ];

      expect(determineWinner(ranking)).toBe('winner');
    });

    it('should return null when gap is insufficient', () => {
      const ranking = [
        {
          rank: 1,
          variantId: 'a',
          metrics: { variantId: 'a', clicks: 1000, conversions: 55, cvr: 0.055 },
          wilsonCi: { point: 0.055, lower: 0.04, upper: 0.07, confidenceLevel: 0.95 },
          bayesianWinProbability: 0.60, // Lower win probability
          score: 0.6,
        },
        {
          rank: 2,
          variantId: 'b',
          metrics: { variantId: 'b', clicks: 1000, conversions: 50, cvr: 0.05 },
          wilsonCi: { point: 0.05, lower: 0.037, upper: 0.065, confidenceLevel: 0.95 },
          bayesianWinProbability: 0.40, // Higher second place probability
          score: 0.55,
        },
      ];

      // Gap is only 20% (0.60 - 0.40), less than required 80%
      expect(determineWinner(ranking, 0.95)).toBeNull();
    });
  });

  describe('isClearWinner', () => {
    it('should return true for clear statistical winner', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'winner', clicks: 10000, conversions: 800, cvr: 0.08 },
        { variantId: 'loser1', clicks: 10000, conversions: 200, cvr: 0.02 },
        { variantId: 'loser2', clicks: 10000, conversions: 300, cvr: 0.03 },
      ];

      expect(isClearWinner('winner', variants)).toBe(true);
    });

    it('should return false when variant does not exist', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
      ];

      expect(isClearWinner('nonexistent', variants)).toBe(false);
    });

    it('should return false when intervals overlap', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 55, cvr: 0.055 },
      ];

      expect(isClearWinner('b', variants)).toBe(false);
    });
  });

  describe('analyzeVariants', () => {
    it('should return complete statistics result', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 60, cvr: 0.06 },
      ];

      const result = analyzeVariants(variants);

      expect(result.decision).toBeDefined();
      expect(result.wilsonAnalysis).toBeDefined();
      expect(result.bayesianAnalysis).toBeDefined();
      expect(result.aggregate).toBeDefined();
      expect(result.analyzedAt).toBeDefined();
    });

    it('should include Wilson CI comparisons', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 1000, conversions: 60, cvr: 0.06 },
      ];

      const result = analyzeVariants(variants);
      expect(result.wilsonAnalysis.comparisons).toHaveLength(1);
    });

    it('should calculate correct aggregates', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 1000, conversions: 50, cvr: 0.05 },
        { variantId: 'b', clicks: 2000, conversions: 100, cvr: 0.05 },
      ];

      const result = analyzeVariants(variants);
      expect(result.aggregate.totalClicks).toBe(3000);
      expect(result.aggregate.totalConversions).toBe(150);
      expect(result.aggregate.variantCount).toBe(2);
    });

    it('should have ISO timestamp', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 100, conversions: 5, cvr: 0.05 },
      ];

      const result = analyzeVariants(variants);
      expect(result.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });
  });

  describe('quickAnalysis', () => {
    it('should return basic analysis results', () => {
      const variants: VariantMetrics[] = [
        { variantId: 'a', clicks: 5000, conversions: 500, cvr: 0.1 },
        { variantId: 'b', clicks: 5000, conversions: 100, cvr: 0.02 },
      ];

      const result = quickAnalysis(variants);
      expect(result.confidence).toBeDefined();
      expect(result.topWinProbability).toBeDefined();
    });

    it('should return insufficient for empty variants', () => {
      const result = quickAnalysis([]);
      expect(result.confidence).toBe('insufficient');
      expect(result.winnerId).toBeNull();
      expect(result.topWinProbability).toBe(0);
    });
  });

  describe('createVariantMetrics', () => {
    it('should be re-exported correctly', () => {
      const metrics = createVariantMetrics('test', 1000, 50);
      expect(metrics.variantId).toBe('test');
      expect(metrics.clicks).toBe(1000);
      expect(metrics.conversions).toBe(50);
      expect(metrics.cvr).toBe(0.05);
    });
  });
});
