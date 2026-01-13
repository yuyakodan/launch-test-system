/**
 * Statistics types for confidence evaluation and statistical analysis
 * Used for A/B test result analysis and winner determination
 */

// Re-export existing type for convenience
export type { DecisionConfidence } from './entities.js';

/**
 * Confidence level for statistical decisions
 * - insufficient: Not enough data to draw any conclusions
 * - directional: Enough data to see a trend, but not statistically significant
 * - confident: Statistically significant result with high confidence
 */
export type ConfidenceLevel = 'insufficient' | 'directional' | 'confident';

/**
 * Sample thresholds for determining confidence levels
 */
export interface SampleThresholds {
  /** Minimum total clicks for directional confidence */
  minClicksDirectional: number;
  /** Minimum total conversions for directional confidence */
  minCvDirectional: number;
  /** Minimum total conversions for confident level */
  minCvConfident: number;
  /** Minimum CVR lift percentage for confident winner (e.g., 0.05 = 5%) */
  minCvrLiftConfident: number;
}

/**
 * Default thresholds as specified in requirements
 */
export const DEFAULT_SAMPLE_THRESHOLDS: SampleThresholds = {
  minClicksDirectional: 200,
  minCvDirectional: 5,
  minCvConfident: 20,
  minCvrLiftConfident: 0.05,
};

/**
 * Minimum thresholds for insufficient level (below these = insufficient)
 */
export const INSUFFICIENT_THRESHOLDS = {
  minClicks: 200,
  minCv: 3,
};

/**
 * Metrics for a single variant
 */
export interface VariantMetrics {
  /** Variant identifier */
  variantId: string;
  /** Number of impressions/clicks */
  clicks: number;
  /** Number of conversions */
  conversions: number;
  /** Conversion rate (conversions / clicks) */
  cvr: number;
}

/**
 * Wilson confidence interval result
 */
export interface WilsonCiResult {
  /** Point estimate (observed CVR) */
  point: number;
  /** Lower bound of confidence interval */
  lower: number;
  /** Upper bound of confidence interval */
  upper: number;
  /** Confidence level used (e.g., 0.95) */
  confidenceLevel: number;
}

/**
 * Wilson CI comparison result between two variants
 */
export interface WilsonCiComparison {
  /** Variant A metrics and CI */
  variantA: {
    variantId: string;
    cvr: number;
    ci: WilsonCiResult;
  };
  /** Variant B metrics and CI */
  variantB: {
    variantId: string;
    cvr: number;
    ci: WilsonCiResult;
  };
  /** Whether the confidence intervals overlap */
  overlapping: boolean;
  /** Relative lift of A over B */
  relativeLift: number;
  /** Whether A is significantly better than B */
  aSignificantlyBetter: boolean;
  /** Whether B is significantly better than A */
  bSignificantlyBetter: boolean;
}

/**
 * Bayesian Beta-Binomial analysis result for a single variant
 */
export interface BayesianVariantResult {
  /** Variant identifier */
  variantId: string;
  /** Alpha parameter (conversions + prior alpha) */
  alpha: number;
  /** Beta parameter (non-conversions + prior beta) */
  beta: number;
  /** Mean of posterior distribution */
  posteriorMean: number;
  /** 95% credible interval lower bound */
  credibleIntervalLower: number;
  /** 95% credible interval upper bound */
  credibleIntervalUpper: number;
}

/**
 * Bayesian comparison result
 */
export interface BayesianComparison {
  /** All variant results */
  variants: BayesianVariantResult[];
  /** Probability that each variant is the best */
  winProbabilities: Map<string, number>;
  /** Variant with highest win probability */
  likelyWinner: string | null;
  /** Win probability of the likely winner */
  likelyWinnerProbability: number;
}

/**
 * Ranking entry for a single variant
 */
export interface RankingEntry {
  /** Rank position (1 = best) */
  rank: number;
  /** Variant identifier */
  variantId: string;
  /** Variant metrics */
  metrics: VariantMetrics;
  /** Wilson CI for CVR */
  wilsonCi: WilsonCiResult;
  /** Bayesian win probability */
  bayesianWinProbability: number;
  /** Combined score for ranking */
  score: number;
}

/**
 * Decision result from statistical analysis
 */
export interface DecisionResult {
  /** Confidence level of the decision */
  confidence: ConfidenceLevel;
  /** Winner variant ID (null if no clear winner) */
  winnerId: string | null;
  /** Ranked list of all variants */
  ranking: RankingEntry[];
  /** Human-readable rationale for the decision */
  rationale: string;
  /** Recommendation for action */
  recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
  /** Estimated additional samples needed for confident decision */
  additionalSamplesNeeded: number | null;
}

/**
 * Complete statistics result
 */
export interface StatisticsResult {
  /** Overall decision */
  decision: DecisionResult;
  /** Wilson CI analysis results */
  wilsonAnalysis: {
    comparisons: WilsonCiComparison[];
  };
  /** Bayesian analysis results */
  bayesianAnalysis: BayesianComparison;
  /** Aggregate metrics */
  aggregate: {
    totalClicks: number;
    totalConversions: number;
    variantCount: number;
  };
  /** Timestamp of analysis */
  analyzedAt: string;
}

/**
 * Configuration for statistical analysis
 */
export interface StatisticsConfig {
  /** Sample thresholds for confidence levels */
  thresholds: SampleThresholds;
  /** Confidence level for Wilson CI (default: 0.95) */
  wilsonConfidenceLevel: number;
  /** Prior alpha for Beta distribution (default: 1) */
  bayesPriorAlpha: number;
  /** Prior beta for Beta distribution (default: 1) */
  bayesPriorBeta: number;
  /** Number of simulations for Bayesian win probability (default: 10000) */
  bayesSimulations: number;
}

/**
 * Default statistics configuration
 */
export const DEFAULT_STATISTICS_CONFIG: StatisticsConfig = {
  thresholds: DEFAULT_SAMPLE_THRESHOLDS,
  wilsonConfidenceLevel: 0.95,
  bayesPriorAlpha: 1,
  bayesPriorBeta: 1,
  bayesSimulations: 10000,
};
