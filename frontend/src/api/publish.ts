import { apiClient } from './client';
import type { ListResponse } from '@/types';

export interface Deployment {
  id: string;
  run_id: string;
  status: 'draft' | 'published' | 'rolled_back' | 'archived';
  urls_json: DeploymentUrls;
  snapshot_manifest_r2_key?: string;
  created_at: string;
  updated_at: string;
}

export interface DeploymentUrls {
  lp: { variantId: string; url: string; utmUrl: string }[];
  tracking: string;
}

export interface PublishResult {
  deployment: Deployment;
  urls: DeploymentUrls;
}

export interface RollbackResult {
  deployment: Deployment;
  previousDeploymentId: string;
}

export const publishApi = {
  /**
   * Publish run (deploy LP/assets and generate URLs/UTM)
   */
  publish: (runId: string) =>
    apiClient.post<PublishResult>(`/runs/${runId}/publish`),

  /**
   * Rollback to previous deployment
   */
  rollback: (runId: string) =>
    apiClient.post<RollbackResult>(`/runs/${runId}/rollback`),

  /**
   * Get current deployment for run
   */
  getDeployment: (runId: string) =>
    apiClient.get<Deployment>(`/runs/${runId}/deployment`),

  /**
   * List all deployments for run
   */
  listDeployments: async (runId: string): Promise<Deployment[]> => {
    const response = await apiClient.get<ListResponse<Deployment>>(
      `/runs/${runId}/deployments`
    );
    return response.items;
  },

  /**
   * Get deployment preview URLs (before publish)
   */
  getPreviewUrls: (runId: string) =>
    apiClient.get<DeploymentUrls>(`/runs/${runId}/preview-urls`),
};
