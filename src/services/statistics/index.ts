/**
 * Statistics Service Module
 *
 * Provides statistical analysis for A/B testing:
 * - Confidence level evaluation (Insufficient/Directional/Confident)
 * - Wilson score confidence intervals for CVR
 * - Bayesian Beta-Binomial analysis
 * - Variant ranking and winner determination
 */

// Wilson CI exports
export {
  calculateWilsonCi,
  calculateVariantWilsonCi,
  compareVariantsWilsonCi,
  compareAllVariantsWilsonCi,
  isSignificantWinner,
} from './wilson-ci.js';

// Bayesian analysis exports
export {
  calculateBayesianPosterior,
  calculateWinProbabilities,
  compareBayesian,
  probabilityABeatsB,
  calculateExpectedLoss,
} from './bayes.js';

// Confidence evaluator exports
export {
  calculateAggregateMetrics,
  isInsufficient,
  isDirectional,
  isConfident,
  determineConfidenceLevel,
  calculateAdditionalSamplesNeeded,
  generateRationale,
  determineRecommendation,
  buildRankingEntries,
  evaluateConfidence,
  createVariantMetrics,
} from './confidence-evaluator.js';

// Ranking exports
export {
  sortVariants,
  generateRanking,
  determineWinner,
  isClearWinner,
  analyzeVariants,
  quickAnalysis,
  type SortCriteria,
} from './ranking.js';
