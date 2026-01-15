import { apiClient } from './client';
import type { Job, QAResult } from '@/types';

export interface SmokeTestInput {
  lpVariantIds?: string[];
  runId?: string;
}

export interface SmokeTestResult {
  passed: boolean;
  checks: {
    name: string;
    passed: boolean;
    message?: string;
    details?: Record<string, unknown>;
  }[];
  testedAt: string;
  duration_ms: number;
}

export interface NGCheckResult {
  hasBlockers: boolean;
  hasWarnings: boolean;
  blockers: {
    type: 'blocked_term' | 'blocked_pattern' | 'missing_evidence' | 'missing_disclaimer';
    message: string;
    location?: string;
  }[];
  warnings: {
    type: string;
    message: string;
    location?: string;
  }[];
}

export const qaApi = {
  /**
   * Start smoke test for LP variants
   */
  startSmokeTest: (data: SmokeTestInput) =>
    apiClient.post<Job>('/qa/smoke-test', data),

  /**
   * Get smoke test result
   */
  getSmokeTestResult: (jobId: string) =>
    apiClient.get<SmokeTestResult>(`/qa/smoke-test/${jobId}`),

  /**
   * Run NG check on LP variant
   */
  checkLpVariant: (lpVariantId: string) =>
    apiClient.post<NGCheckResult>(`/lp-variants/${lpVariantId}/qa-check`),

  /**
   * Run NG check on creative variant
   */
  checkCreativeVariant: (creativeVariantId: string) =>
    apiClient.post<NGCheckResult>(`/creative-variants/${creativeVariantId}/qa-check`),

  /**
   * Run NG check on ad copy
   */
  checkAdCopy: (adCopyId: string) =>
    apiClient.post<NGCheckResult>(`/ad-copies/${adCopyId}/qa-check`),

  /**
   * Get QA result for LP variant
   */
  getLpVariantQA: (lpVariantId: string) =>
    apiClient.get<QAResult>(`/lp-variants/${lpVariantId}/qa`),

  /**
   * Get QA result for creative variant
   */
  getCreativeVariantQA: (creativeVariantId: string) =>
    apiClient.get<QAResult>(`/creative-variants/${creativeVariantId}/qa`),

  /**
   * Get QA result for ad copy
   */
  getAdCopyQA: (adCopyId: string) =>
    apiClient.get<QAResult>(`/ad-copies/${adCopyId}/qa`),

  /**
   * Submit run for review (trigger QA checks)
   */
  submitForReview: (runId: string) =>
    apiClient.post<{ success: boolean; blockers: NGCheckResult['blockers'] }>(
      `/runs/${runId}/submit-review`
    ),
};
