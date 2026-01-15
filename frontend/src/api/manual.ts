import { apiClient } from './client';
import type { ListResponse } from '@/types';

export interface AdBundle {
  id: string;
  run_id: string;
  intent_id: string;
  lp_variant_id: string;
  creative_variant_id: string;
  ad_copy_id: string;
  utm_string: string;
  status: 'ready' | 'running' | 'paused' | 'archived';
  meta_campaign_id?: string;
  meta_adset_id?: string;
  meta_ad_id?: string;
  created_at: string;
  updated_at: string;
}

export interface RegisterAdBundleInput {
  intentId: string;
  lpVariantId: string;
  creativeVariantId: string;
  adCopyId: string;
  metaCampaignId?: string;
  metaAdsetId?: string;
  metaAdId?: string;
}

export interface ManualImport {
  id: string;
  tenant_id: string;
  run_id: string;
  import_type: 'insights_csv' | 'mapping_csv';
  file_r2_key: string;
  summary_json: ImportSummary;
  created_by_user_id?: string;
  created_at: string;
}

export interface ImportSummary {
  rowsProcessed: number;
  rowsSucceeded: number;
  rowsFailed: number;
  errors?: { row: number; message: string }[];
}

export interface MetricsImportInput {
  file: File;
}

export interface InsightsMetrics {
  ad_bundle_id: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  conversions: number;
  ctr: number;
  cvr: number;
  cpa: number;
  source: 'meta' | 'manual';
}

export interface RunMetricsResponse {
  bundles: {
    bundleId: string;
    intentId: string;
    lpVariantId: string;
    creativeVariantId: string;
    metrics: InsightsMetrics;
  }[];
  totals: {
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    ctr: number;
    cvr: number;
    cpa: number;
  };
  events: {
    pageviews: number;
    ctaClicks: number;
    formSubmits: number;
    formSuccesses: number;
  };
}

export const manualApi = {
  /**
   * Register ad bundle (manual mode - link LP/creative/copy with Meta ad)
   */
  registerAdBundle: (runId: string, data: RegisterAdBundleInput) =>
    apiClient.post<AdBundle>(`/manual/ad-bundles/register`, { runId, ...data }),

  /**
   * List ad bundles for run
   */
  listAdBundles: async (runId: string): Promise<AdBundle[]> => {
    const response = await apiClient.get<ListResponse<AdBundle>>(
      `/runs/${runId}/ad-bundles`
    );
    return response.items;
  },

  /**
   * Update ad bundle status
   */
  updateAdBundle: (bundleId: string, data: { status?: AdBundle['status']; metaAdId?: string }) =>
    apiClient.patch<AdBundle>(`/ad-bundles/${bundleId}`, data),

  /**
   * Import metrics from CSV (manual mode)
   */
  importMetrics: async (runId: string, file: File): Promise<ManualImport> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('runId', runId);

    const response = await fetch(`/api/manual/metrics/import`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${localStorage.getItem('auth_token')}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to import metrics');
    }

    const result = await response.json();
    return result.data;
  },

  /**
   * List import history for run
   */
  listImports: async (runId: string): Promise<ManualImport[]> => {
    const response = await apiClient.get<ListResponse<ManualImport>>(
      `/runs/${runId}/imports`
    );
    return response.items;
  },

  /**
   * Get aggregated metrics for run (events + insights)
   */
  getRunMetrics: (runId: string) =>
    apiClient.get<RunMetricsResponse>(`/runs/${runId}/metrics`),

  /**
   * Download CSV template for metrics import
   */
  downloadTemplate: () => {
    window.open('/api/manual/metrics/template', '_blank');
  },
};
