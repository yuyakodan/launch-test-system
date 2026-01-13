import { apiClient } from './client';
import type { Run, RunDesign, StopDSL, FixedGranularity, RunReport, Decision } from '@/types';

export interface CreateRunInput {
  project_id: string;
  name: string;
  mode?: 'manual' | 'hybrid' | 'auto';
  budget_cap: number;
}

export interface UpdateRunInput {
  name?: string;
  mode?: 'manual' | 'hybrid' | 'auto';
  budget_cap?: number;
}

export const runsApi = {
  list: (params?: { project_id?: string; status?: string; page?: number; limit?: number }) =>
    apiClient.get<Run[]>('/runs', params),

  get: (id: string) => apiClient.get<Run>(`/runs/${id}`),

  create: (data: CreateRunInput) => apiClient.post<Run>('/runs', data),

  update: (id: string, data: UpdateRunInput) => apiClient.patch<Run>(`/runs/${id}`, data),

  // Set run design
  setDesign: (id: string, design: RunDesign) =>
    apiClient.post<Run>(`/runs/${id}/design`, design),

  // Set stop DSL rules
  setStopDsl: (id: string, rules: StopDSL[]) =>
    apiClient.post<Run>(`/runs/${id}/stop-dsl`, { rules }),

  // Set fixed/explore granularity
  setFixedGranularity: (id: string, granularity: FixedGranularity) =>
    apiClient.post<Run>(`/runs/${id}/granularity`, granularity),

  // Launch run
  launch: (id: string) => apiClient.post<Run>(`/runs/${id}/launch`),

  // Pause run
  pause: (id: string) => apiClient.post<Run>(`/runs/${id}/pause`),

  // Resume run
  resume: (id: string) => apiClient.post<Run>(`/runs/${id}/resume`),

  // Stop run
  stop: (id: string) => apiClient.post<Run>(`/runs/${id}/stop`),

  // Get decision
  decide: (id: string) => apiClient.post<Decision>(`/runs/${id}/decide`),

  // Get report
  getReport: (id: string) => apiClient.get<RunReport>(`/runs/${id}/report`),
};
