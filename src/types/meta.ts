/**
 * Meta Integration Type Definitions
 * Types for OAuth, Insights sync, and Meta API operations
 */

import type { OperationMode } from './entities.js';

// ================================
// OAuth Types
// ================================

/**
 * OAuth state for CSRF protection
 */
export interface MetaOAuthState {
  tenantId: string;
  userId: string;
  redirectUrl: string;
  nonce: string;
  createdAt: string;
}

/**
 * OAuth token response from Meta
 */
export interface MetaOAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

/**
 * Long-lived token exchange response
 */
export interface MetaLongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

/**
 * Meta user info from /me endpoint
 */
export interface MetaUserInfo {
  id: string;
  name?: string;
  email?: string;
}

/**
 * Meta ad account info
 */
export interface MetaAdAccount {
  id: string;
  account_id: string;
  name: string;
  currency: string;
  account_status: number;
  business_name?: string;
}

/**
 * Meta page info
 */
export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
}

/**
 * Meta pixel info
 */
export interface MetaPixel {
  id: string;
  name: string;
}

/**
 * Instagram user info
 */
export interface MetaInstagramUser {
  id: string;
  username?: string;
}

/**
 * OAuth callback result
 */
export interface MetaOAuthResult {
  success: boolean;
  connectionId?: string;
  error?: string;
  errorDescription?: string;
}

/**
 * Start OAuth request
 */
export interface StartOAuthRequest {
  redirectUrl: string;
  scopes?: string[];
}

/**
 * OAuth callback request
 */
export interface OAuthCallbackRequest {
  code: string;
  state: string;
}

// ================================
// Insights Types
// ================================

/**
 * Supported insight metrics
 */
export interface InsightMetrics {
  impressions?: number;
  clicks?: number;
  spend?: number;
  reach?: number;
  frequency?: number;
  cpc?: number;
  cpm?: number;
  ctr?: number;
  actions?: MetaAction[];
  cost_per_action_type?: MetaCostPerAction[];
}

/**
 * Meta action (conversion tracking)
 */
export interface MetaAction {
  action_type: string;
  value: string;
}

/**
 * Cost per action
 */
export interface MetaCostPerAction {
  action_type: string;
  value: string;
}

/**
 * Insights query parameters
 */
export interface InsightsQueryParams {
  level: 'account' | 'campaign' | 'adset' | 'ad';
  datePreset?: string;
  timeRange?: {
    since: string;
    until: string;
  };
  timeIncrement?: 'all_days' | 'monthly' | string;
  breakdowns?: string[];
  fields?: string[];
}

/**
 * Insights response from Meta API
 */
export interface MetaInsightsResponse {
  data: MetaInsightData[];
  paging?: {
    cursors?: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

/**
 * Single insight data point
 */
export interface MetaInsightData {
  date_start?: string;
  date_stop?: string;
  impressions?: string;
  clicks?: string;
  spend?: string;
  reach?: string;
  frequency?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: MetaAction[];
  cost_per_action_type?: MetaCostPerAction[];
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
}

/**
 * Parsed insights for storage
 */
export interface ParsedInsight {
  adBundleId: string;
  date: string;
  hour?: string;
  metrics: InsightMetrics;
  source: 'meta' | 'manual';
}

// ================================
// Campaign/AdSet/Ad/Creative Types (Full Auto Mode)
// ================================

/**
 * Campaign creation input
 */
export interface CreateCampaignInput {
  name: string;
  objective:
    | 'OUTCOME_LEADS'
    | 'OUTCOME_SALES'
    | 'OUTCOME_ENGAGEMENT'
    | 'OUTCOME_AWARENESS'
    | 'OUTCOME_TRAFFIC'
    | 'OUTCOME_APP_PROMOTION';
  status?: 'ACTIVE' | 'PAUSED';
  specialAdCategories?: string[];
  buyingType?: 'AUCTION' | 'RESERVED';
  dailyBudget?: number;
  lifetimeBudget?: number;
}

/**
 * AdSet creation input
 */
export interface CreateAdSetInput {
  name: string;
  campaignId: string;
  billingEvent: 'IMPRESSIONS' | 'LINK_CLICKS' | 'APP_INSTALLS';
  optimizationGoal: string;
  targeting: MetaTargeting;
  status?: 'ACTIVE' | 'PAUSED';
  dailyBudget?: number;
  lifetimeBudget?: number;
  startTime?: string;
  endTime?: string;
  bidStrategy?: string;
  bidAmount?: number;
}

/**
 * Meta targeting specification
 */
export interface MetaTargeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  geo_locations?: {
    countries?: string[];
    regions?: { key: string }[];
    cities?: { key: string; radius?: number; distance_unit?: string }[];
  };
  publisher_platforms?: string[];
  facebook_positions?: string[];
  instagram_positions?: string[];
  device_platforms?: string[];
  custom_audiences?: { id: string }[];
  excluded_custom_audiences?: { id: string }[];
  interests?: { id: string; name: string }[];
  behaviors?: { id: string; name: string }[];
  locales?: number[];
}

/**
 * Ad creation input
 */
export interface CreateAdInput {
  name: string;
  adsetId: string;
  creativeId: string;
  status?: 'ACTIVE' | 'PAUSED';
  trackingSpecs?: unknown;
}

/**
 * Creative creation input
 */
export interface CreateCreativeInput {
  name: string;
  objectStorySpec: {
    page_id: string;
    link_data?: {
      link: string;
      message: string;
      name?: string;
      description?: string;
      image_hash?: string;
      call_to_action?: {
        type: string;
        value?: { link?: string };
      };
    };
    video_data?: {
      video_id: string;
      message?: string;
      title?: string;
      link_description?: string;
      call_to_action?: {
        type: string;
        value?: { link?: string };
      };
    };
  };
  degreesOfFreedomSpec?: unknown;
}

/**
 * Meta API response for entity creation
 */
export interface MetaEntityCreationResponse {
  id: string;
  success?: boolean;
}

// ================================
// Service Configuration
// ================================

/**
 * Meta service configuration
 */
export interface MetaServiceConfig {
  appId: string;
  appSecret: string;
  apiVersion: string;
  baseUrl?: string;
}

/**
 * Connection info for service operations
 */
export interface MetaConnectionInfo {
  connectionId: string;
  tenantId: string;
  tokenRef: string;
  adAccountId: string | null;
  pixelId: string | null;
  pageId: string | null;
  operationMode: OperationMode;
}

// ================================
// Sync Types
// ================================

/**
 * Insights sync request (internal API)
 */
export interface InsightsSyncRequest {
  tenantId?: string;
  runId?: string;
  dateRange?: {
    since: string;
    until: string;
  };
  forceSync?: boolean;
}

/**
 * Insights sync result
 */
export interface InsightsSyncResult {
  success: boolean;
  synced: number;
  errors: number;
  lastSyncAt: string;
  details?: {
    hourly: number;
    daily: number;
  };
}

// ================================
// Error Types
// ================================

/**
 * Meta API error response
 */
export interface MetaApiError {
  error: {
    message: string;
    type: string;
    code: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

/**
 * Meta service error
 */
export class MetaServiceError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public metaError?: MetaApiError['error']
  ) {
    super(message);
    this.name = 'MetaServiceError';
  }
}
