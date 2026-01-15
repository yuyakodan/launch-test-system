import { apiClient } from './client';
import type { Decision, ConfidenceLevel } from '@/types';

export interface VariantPerformance {
  variantId: string;
  variantName: string;
  intentId: string;
  intentName: string;
  type: 'lp' | 'creative' | 'ad_copy' | 'bundle';
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  ctr: number;
  cvr: number;
  cpa: number;
  cvrCI: [number, number];
  rank: number;
  isWinner: boolean;
}

export interface StatisticalResult {
  confidence: ConfidenceLevel;
  method: 'wilson' | 'bayes';
  totalSamples: number;
  totalConversions: number;
  requiredSamplesForConfident: number;
  requiredConversionsForConfident: number;
  message: string;
}

export interface ReportData {
  run: {
    id: string;
    name: string;
    status: string;
    startedAt?: string;
    completedAt?: string;
  };
  variants: VariantPerformance[];
  statistics: StatisticalResult;
  decision?: Decision;
  recommendations: string[];
  nextRunSuggestions?: {
    fixedElements: string[];
    exploreElements: string[];
    reasoning: string;
  };
}

export interface DecideInput {
  confirm: boolean;
  winnerVariantId?: string;
  rationale?: string;
}

export interface NextRunInput {
  fixedGranularity: {
    fixed: Record<string, unknown>;
    explore: Record<string, unknown>;
  };
  name?: string;
}

export const reportApi = {
  /**
   * Get full report for run
   */
  getReport: (runId: string) =>
    apiClient.get<ReportData>(`/runs/${runId}/report`),

  /**
   * Get variant performance data
   */
  getVariantPerformance: (runId: string) =>
    apiClient.get<VariantPerformance[]>(`/runs/${runId}/performance`),

  /**
   * Get statistical analysis result
   */
  getStatistics: (runId: string) =>
    apiClient.get<StatisticalResult>(`/runs/${runId}/statistics`),

  /**
   * Get or create decision for run
   */
  getDecision: (runId: string) =>
    apiClient.get<Decision>(`/runs/${runId}/decision`),

  /**
   * Confirm decision (finalize winner)
   */
  confirmDecision: (runId: string, data: DecideInput) =>
    apiClient.post<Decision>(`/runs/${runId}/decide`, data),

  /**
   * Generate next run based on current run results
   */
  generateNextRun: (runId: string, data: NextRunInput) =>
    apiClient.post<{ runId: string }>(`/runs/${runId}/next-run`, data),

  /**
   * Export report as PDF
   */
  exportPdf: (runId: string) => {
    window.open(`/api/runs/${runId}/report/pdf`, '_blank');
  },

  /**
   * Export report data as CSV
   */
  exportCsv: (runId: string) => {
    window.open(`/api/runs/${runId}/report/csv`, '_blank');
  },
};
