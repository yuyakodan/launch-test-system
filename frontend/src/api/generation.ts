import { apiClient } from './client';
import type { Job, ListResponse } from '@/types';

export interface GenerationTarget {
  lp: boolean;
  banner: boolean;
  adCopy: boolean;
}

export interface GenerateInput {
  targets: GenerationTarget;
  intentIds?: string[];
  options?: {
    lpCount?: number;
    bannerCount?: number;
    adCopyCount?: number;
  };
}

export interface GenerationJobResult {
  lpVariants?: { id: string; name: string }[];
  creativeVariants?: { id: string; name: string; size: string }[];
  adCopies?: { id: string; headline: string }[];
}

export const generationApi = {
  /**
   * Start generation job for LP/Banner/Ad Copy
   */
  generate: (runId: string, data: GenerateInput) =>
    apiClient.post<Job>(`/runs/${runId}/generate`, data),

  /**
   * List generation jobs for a run
   */
  listJobs: async (runId: string): Promise<Job[]> => {
    const response = await apiClient.get<ListResponse<Job>>(`/runs/${runId}/jobs`);
    return response.items;
  },

  /**
   * Get specific job status and result
   */
  getJob: (jobId: string) => apiClient.get<Job>(`/jobs/${jobId}`),

  /**
   * Retry a failed job
   */
  retryJob: (jobId: string) => apiClient.post<Job>(`/jobs/${jobId}/retry`),

  /**
   * Cancel a running or queued job
   */
  cancelJob: (jobId: string) => apiClient.post<Job>(`/jobs/${jobId}/cancel`),
};
