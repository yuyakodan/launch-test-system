import { apiClient } from './client';
import type { Intent, LpVariant, CreativeVariant, AdCopy, RunMetrics } from '@/types';

export interface CreateIntentInput {
  name: string;
  description?: string;
  target_audience: string;
  key_message: string;
  cta: string;
}

export interface UpdateIntentInput {
  name?: string;
  description?: string;
  target_audience?: string;
  key_message?: string;
  cta?: string;
  status?: 'draft' | 'active' | 'paused' | 'stopped';
}

export const intentsApi = {
  // Intent CRUD
  list: (runId: string) => apiClient.get<Intent[]>(`/runs/${runId}/intents`),

  create: (runId: string, data: CreateIntentInput) =>
    apiClient.post<Intent>(`/runs/${runId}/intents`, data),

  update: (id: string, data: UpdateIntentInput) =>
    apiClient.patch<Intent>(`/intents/${id}`, data),

  // LP Variants
  listLpVariants: (intentId: string) =>
    apiClient.get<LpVariant[]>(`/intents/${intentId}/lp-variants`),

  createLpVariant: (intentId: string, data: { name: string; url: string }) =>
    apiClient.post<LpVariant>(`/intents/${intentId}/lp-variants`, data),

  // Creative Variants
  listCreativeVariants: (intentId: string) =>
    apiClient.get<CreativeVariant[]>(`/intents/${intentId}/creative-variants`),

  createCreativeVariant: (
    intentId: string,
    data: { name: string; type: string; asset_url: string; dimensions: string }
  ) => apiClient.post<CreativeVariant>(`/intents/${intentId}/creative-variants`, data),

  // Ad Copies
  listAdCopies: (intentId: string) =>
    apiClient.get<AdCopy[]>(`/intents/${intentId}/ad-copies`),

  createAdCopy: (
    intentId: string,
    data: { primary_text: string; headline: string; description: string }
  ) => apiClient.post<AdCopy>(`/intents/${intentId}/ad-copies`, data),

  updateAdCopy: (
    id: string,
    data: { primary_text?: string; headline?: string; description?: string }
  ) => apiClient.patch<AdCopy>(`/ad-copies/${id}`, data),

  // Metrics
  getMetrics: (intentId: string) =>
    apiClient.get<RunMetrics>(`/intents/${intentId}/metrics`),
};
