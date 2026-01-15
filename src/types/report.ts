/**
 * Report types for Run analysis and reporting
 *
 * Based on requirements:
 * - Run summary (period, budget consumption, mode)
 * - Intent/Variant performance (impressions, clicks, cost, conversions, CVR, CPA, CTR)
 * - Statistical decision results (Insufficient/Directional/Confident)
 * - Winner information with rationale
 * - Next Run generation proposals
 * - Additional budget proposals for Insufficient cases
 */

import type { ConfidenceLevel, RankingEntry } from './statistics.js';
import type { RunStatus, OperationMode, IntentStatus } from './entities.js';

/**
 * Variant performance metrics
 */
export interface VariantPerformance {
  /** Variant ID */
  variantId: string;
  /** Variant type (intent, lp_variant, creative_variant, ad_bundle) */
  variantType: 'intent' | 'lp_variant' | 'creative_variant' | 'ad_bundle';
  /** Display name */
  name: string;
  /** Number of impressions */
  impressions: number;
  /** Number of clicks */
  clicks: number;
  /** Cost spent (in currency units) */
  cost: number;
  /** Number of conversions */
  conversions: number;
  /** Click-through rate (clicks / impressions) */
  ctr: number;
  /** Conversion rate (conversions / clicks) */
  cvr: number;
  /** Cost per acquisition (cost / conversions) */
  cpa: number | null;
  /** Cost per click */
  cpc: number | null;
}

/**
 * Intent performance with its variants
 */
export interface IntentPerformance {
  /** Intent ID */
  intentId: string;
  /** Intent title */
  title: string;
  /** Intent hypothesis */
  hypothesis: string;
  /** Intent status */
  status: IntentStatus;
  /** Priority */
  priority: number;
  /** Aggregated metrics for this intent */
  metrics: VariantPerformance;
  /** LP variants under this intent */
  lpVariants: VariantPerformance[];
  /** Creative variants under this intent */
  creativeVariants: VariantPerformance[];
  /** Ad copies under this intent */
  adCopies: VariantPerformance[];
}

/**
 * Budget information in the report
 */
export interface BudgetInfo {
  /** Currency code (e.g., JPY) */
  currency: string;
  /** Total budget cap */
  totalCap: number;
  /** Daily budget cap (if set) */
  dailyCap: number | null;
  /** Total spent */
  totalSpent: number;
  /** Budget consumption percentage */
  consumptionPercentage: number;
  /** Remaining budget */
  remaining: number;
  /** Whether budget is exhausted */
  exhausted: boolean;
}

/**
 * Run period information
 */
export interface PeriodInfo {
  /** Planned start date */
  plannedStartAt: string | null;
  /** Planned end date */
  plannedEndAt: string | null;
  /** Actual launch date */
  launchedAt: string | null;
  /** Completion date */
  completedAt: string | null;
  /** Duration in milliseconds */
  durationMs: number | null;
  /** Human-readable duration */
  durationFormatted: string | null;
  /** Days running */
  daysRunning: number | null;
}

/**
 * Statistical decision in the report
 */
export interface StatisticalDecision {
  /** Confidence level */
  confidence: ConfidenceLevel;
  /** Winner variant ID (if confident) */
  winnerId: string | null;
  /** Winner variant name */
  winnerName: string | null;
  /** Rationale for the decision */
  rationale: string;
  /** Recommendation action */
  recommendation: 'continue' | 'stop_winner' | 'stop_no_winner';
  /** Ranking of variants */
  ranking: RankingEntry[];
}

/**
 * Additional budget proposal for Insufficient cases
 * Answers: "How many more clicks/CVs needed to reach Directional/Confident?"
 */
export interface AdditionalBudgetProposal {
  /** Current confidence level */
  currentConfidence: ConfidenceLevel;
  /** Estimated clicks needed for Directional */
  clicksForDirectional: number | null;
  /** Estimated CVs needed for Directional */
  cvsForDirectional: number | null;
  /** Estimated clicks needed for Confident */
  clicksForConfident: number | null;
  /** Estimated CVs needed for Confident */
  cvsForConfident: number | null;
  /** Estimated additional budget needed for Directional (based on current CPC) */
  budgetForDirectional: number | null;
  /** Estimated additional budget needed for Confident (based on current CPC) */
  budgetForConfident: number | null;
  /** Human-readable proposal message */
  proposalMessage: string;
}

/**
 * Next Run generation proposal
 */
export interface NextRunProposal {
  /** Recommended fixed elements */
  fixedElements: {
    /** Intent IDs to keep */
    intentIds: string[];
    /** LP structure to lock */
    lockLpStructure: boolean;
    /** LP theme to lock */
    lockLpTheme: boolean;
    /** LP blocks to lock */
    lockLpBlocks: string[];
    /** Banner template to lock */
    lockBannerTemplate: boolean;
    /** Ad copy elements to lock */
    lockAdCopy: {
      primaryText: boolean;
      headline: boolean;
      description: boolean;
    };
  };
  /** Recommended exploration areas */
  exploreAreas: {
    /** Areas to test */
    areas: string[];
    /** Rationale for each area */
    rationale: Record<string, string>;
  };
  /** Summary of recommendations */
  summary: string;
}

/**
 * Complete Run Report
 */
export interface RunReport {
  /** Report metadata */
  meta: {
    /** Report ID */
    reportId: string;
    /** Run ID */
    runId: string;
    /** Generated timestamp */
    generatedAt: string;
    /** Report version */
    version: string;
  };
  /** Run summary */
  summary: {
    /** Run ID */
    id: string;
    /** Run name */
    name: string;
    /** Run status */
    status: RunStatus;
    /** Operation mode */
    operationMode: OperationMode;
    /** Project ID */
    projectId: string;
    /** Project name */
    projectName: string | null;
    /** Period information */
    period: PeriodInfo;
    /** Budget information */
    budget: BudgetInfo;
  };
  /** Performance data */
  performance: {
    /** Total metrics across all variants */
    totals: {
      impressions: number;
      clicks: number;
      cost: number;
      conversions: number;
      ctr: number;
      cvr: number;
      cpa: number | null;
    };
    /** Performance by intent */
    byIntent: IntentPerformance[];
  };
  /** Statistical decision */
  decision: StatisticalDecision;
  /** Winner information (if determined) */
  winner: {
    /** Whether a winner was determined */
    determined: boolean;
    /** Winner variant ID */
    variantId: string | null;
    /** Winner variant type */
    variantType: string | null;
    /** Winner name */
    name: string | null;
    /** Winner metrics */
    metrics: VariantPerformance | null;
    /** Rationale for winner selection */
    rationale: string;
    /** Confidence level of the decision */
    confidence: ConfidenceLevel;
  };
  /** Additional budget proposal (for Insufficient cases) */
  additionalBudgetProposal: AdditionalBudgetProposal | null;
  /** Next Run generation proposal */
  nextRunProposal: NextRunProposal | null;
}

/**
 * Report generation request
 */
export interface GenerateReportRequest {
  /** Run ID */
  runId: string;
  /** Tenant ID */
  tenantId: string;
  /** Whether to include detailed variant metrics */
  includeDetailedMetrics?: boolean;
  /** Whether to generate next run proposals */
  generateNextRunProposal?: boolean;
}

/**
 * Report generation job payload
 */
export interface ReportJobPayload {
  /** Run ID */
  runId: string;
  /** Tenant ID */
  tenantId: string;
  /** Request timestamp */
  requestedAt: string;
  /** Requested by user ID */
  requestedByUserId?: string;
  /** Options */
  options?: {
    includeDetailedMetrics?: boolean;
    generateNextRunProposal?: boolean;
  };
}

/**
 * Report generation result
 */
export interface ReportGenerationResult {
  /** Success flag */
  success: boolean;
  /** Generated report (if successful) */
  report?: RunReport;
  /** Error message (if failed) */
  error?: string;
  /** Generation duration in ms */
  durationMs: number;
}
