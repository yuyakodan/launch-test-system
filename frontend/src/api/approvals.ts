import { apiClient } from './client';
import type { ListResponse } from '@/types';

export type ApprovalTargetType =
  | 'run'
  | 'lp_variant'
  | 'creative_variant'
  | 'ad_copy'
  | 'deployment'
  | 'meta_config';

export type ApprovalStatus = 'submitted' | 'approved' | 'rejected';

export interface Approval {
  id: string;
  tenant_id: string;
  target_type: ApprovalTargetType;
  target_id: string;
  status: ApprovalStatus;
  reviewer_user_id?: string;
  reviewer_name?: string;
  comment: string;
  target_hash: string;
  created_at: string;
}

export interface CreateApprovalInput {
  targetType: ApprovalTargetType;
  targetId: string;
  comment?: string;
}

export interface ApprovalDecisionInput {
  comment?: string;
}

export interface ApprovalHistory {
  approvals: Approval[];
  currentStatus: ApprovalStatus | 'draft';
  canSubmit: boolean;
  canApprove: boolean;
  blockers?: string[];
}

export const approvalsApi = {
  /**
   * Create approval request (submit for review)
   */
  create: (data: CreateApprovalInput) =>
    apiClient.post<Approval>('/approvals', data),

  /**
   * Approve an approval request
   */
  approve: (approvalId: string, data?: ApprovalDecisionInput) =>
    apiClient.post<Approval>(`/approvals/${approvalId}/approve`, data),

  /**
   * Reject an approval request
   */
  reject: (approvalId: string, data: ApprovalDecisionInput) =>
    apiClient.post<Approval>(`/approvals/${approvalId}/reject`, data),

  /**
   * Get approval history for a target
   */
  getHistory: (targetType: ApprovalTargetType, targetId: string) =>
    apiClient.get<ApprovalHistory>(`/approvals/history`, {
      targetType,
      targetId,
    }),

  /**
   * List pending approvals (for reviewer dashboard)
   */
  listPending: async (): Promise<Approval[]> => {
    const response = await apiClient.get<ListResponse<Approval>>('/approvals', {
      status: 'submitted',
    });
    return response.items;
  },

  /**
   * List all approvals for a run
   */
  listForRun: async (runId: string): Promise<Approval[]> => {
    const response = await apiClient.get<ListResponse<Approval>>(
      `/runs/${runId}/approvals`
    );
    return response.items;
  },

  /**
   * Get single approval details
   */
  get: (approvalId: string) =>
    apiClient.get<Approval>(`/approvals/${approvalId}`),
};
