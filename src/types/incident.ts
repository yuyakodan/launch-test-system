/**
 * Incident type definitions
 * Based on requirements.md section 6 - Meta integration incident handling
 */

import type { IncidentType, IncidentSeverity, IncidentStatus } from './entities.js';

/**
 * Rejected reason categories for Meta审査
 */
export type RejectedReasonCategory =
  | 'copy_text' // 文言
  | 'image' // 画像
  | 'landing_page' // ランディング
  | 'industry' // 業種
  | 'policy' // 規約
  | 'other'; // その他

/**
 * Rejected reason details
 */
export interface RejectedReason {
  /** Category of rejection */
  category: RejectedReasonCategory;
  /** Detailed reason text */
  detail: string;
  /** Affected asset type */
  affectedAsset?: 'lp' | 'banner' | 'ad_copy' | 'creative';
  /** Affected asset ID */
  affectedAssetId?: string;
}

/**
 * Incident metadata for different incident types
 */
export interface IncidentMeta {
  /** For meta_rejected - rejection details */
  rejectedReason?: RejectedReason;

  /** For meta_rejected - affected entity info */
  affectedEntity?: {
    type: 'ad' | 'creative' | 'account';
    id?: string;
    name?: string;
  };

  /** For meta_account_issue - account status */
  accountStatus?: string;

  /** For api_outage - error details */
  apiError?: {
    code?: string;
    message?: string;
    endpoint?: string;
  };

  /** For measurement_issue - measurement details */
  measurementDetails?: {
    expectedEvents?: string[];
    receivedEvents?: string[];
    missingEvents?: string[];
  };

  /** Impact scope */
  impactScope?: 'all_runs' | 'single_run' | 'single_bundle';

  /** Temporary action taken */
  temporaryAction?: string;

  /** Prevention memo to add to project NG rules */
  preventionMemo?: string;

  /** Resolution steps taken */
  resolutionSteps?: string[];

  /** Any additional context */
  [key: string]: unknown;
}

/**
 * Create incident input
 */
export interface CreateIncidentRequest {
  /** Run ID (optional - can be system-wide incident) */
  runId?: string;
  /** Type of incident */
  incidentType: IncidentType;
  /** Severity level */
  severity?: IncidentSeverity;
  /** Reason/description */
  reason: string;
  /** Additional metadata */
  meta?: IncidentMeta;
}

/**
 * Update incident input
 */
export interface UpdateIncidentRequest {
  /** Update severity */
  severity?: IncidentSeverity;
  /** Update status */
  status?: IncidentStatus;
  /** Update reason */
  reason?: string;
  /** Update metadata */
  meta?: IncidentMeta;
}

/**
 * Resolve incident input
 */
export interface ResolveIncidentRequest {
  /** Resolution notes */
  resolutionNotes?: string;
  /** Prevention memo to add to project NG rules */
  preventionMemo?: string;
  /** Whether to add prevention memo to project NG rules */
  addToNgRules?: boolean;
}

/**
 * Incident with parsed metadata
 */
export interface IncidentWithMeta {
  id: string;
  tenantId: string;
  runId: string | null;
  incidentType: IncidentType;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reason: string;
  meta: IncidentMeta;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

/**
 * Incident list response
 */
export interface IncidentListResponse {
  items: IncidentWithMeta[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Incident action result
 */
export interface IncidentActionResult {
  success: boolean;
  incident: IncidentWithMeta;
  actions?: {
    runPaused?: boolean;
    notificationSent?: boolean;
    ngRulesUpdated?: boolean;
  };
}

/**
 * Re-export incident types from entities
 */
export type { IncidentType, IncidentSeverity, IncidentStatus } from './entities.js';
