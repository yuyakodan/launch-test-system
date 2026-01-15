/**
 * Meta Integration Service
 * Handles OAuth, Insights sync, and Campaign/AdSet/Ad/Creative operations
 *
 * Operation Modes:
 * - Manual Mode: Meta API not used
 * - Hybrid Mode: Read-only (Insights fetch)
 * - Full Auto Mode: Campaign/AdSet/Ad/Creative creation + Insights sync
 */

import { ulid } from '../lib/ulid.js';
import type { OperationMode, MetaConnection } from '../types/entities.js';
import type {
  MetaServiceConfig,
  MetaOAuthState,
  MetaOAuthTokenResponse,
  MetaLongLivedTokenResponse,
  MetaUserInfo,
  MetaAdAccount,
  MetaPage,
  MetaPixel,
  MetaInstagramUser,
  InsightsQueryParams,
  MetaInsightsResponse,
  ParsedInsight,
  InsightsSyncResult,
  CreateCampaignInput,
  CreateAdSetInput,
  CreateAdInput,
  CreateCreativeInput,
  MetaEntityCreationResponse,
  MetaApiError,
} from '../types/meta.js';
import { MetaServiceError } from '../types/meta.js';

/**
 * Default Meta Graph API version
 */
const DEFAULT_API_VERSION = 'v19.0';
const DEFAULT_BASE_URL = 'https://graph.facebook.com';

/**
 * Default OAuth scopes
 */
const DEFAULT_SCOPES = [
  'ads_read',
  'ads_management',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
];

/**
 * Meta Service
 * Handles all Meta (Facebook) API interactions
 */
export class MetaService {
  private config: MetaServiceConfig;
  private baseUrl: string;

  constructor(config: MetaServiceConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  }

  /**
   * Get API URL
   */
  private getApiUrl(path: string): string {
    return `${this.baseUrl}/${this.config.apiVersion ?? DEFAULT_API_VERSION}${path}`;
  }

  /**
   * Make API request with error handling
   */
  private async apiRequest<T>(
    url: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      const errorData = data as MetaApiError;
      throw new MetaServiceError(
        errorData.error?.message ?? 'Meta API error',
        errorData.error?.type ?? 'UNKNOWN_ERROR',
        response.status,
        errorData.error
      );
    }

    return data as T;
  }

  // ================================
  // OAuth Methods
  // ================================

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(state: string, redirectUri: string, scopes?: string[]): string {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      redirect_uri: redirectUri,
      state,
      scope: (scopes ?? DEFAULT_SCOPES).join(','),
      response_type: 'code',
    });

    return `https://www.facebook.com/${this.config.apiVersion ?? DEFAULT_API_VERSION}/dialog/oauth?${params.toString()}`;
  }

  /**
   * Create OAuth state for CSRF protection
   */
  createOAuthState(tenantId: string, userId: string, redirectUrl: string): MetaOAuthState {
    return {
      tenantId,
      userId,
      redirectUrl,
      nonce: ulid(),
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Encode OAuth state to string (Web API compatible)
   */
  encodeOAuthState(state: MetaOAuthState): string {
    const jsonString = JSON.stringify(state);
    const bytes = new TextEncoder().encode(jsonString);
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    // Convert to base64url (replace + with -, / with _, and remove padding)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Decode OAuth state from string (Web API compatible)
   */
  decodeOAuthState(encoded: string): MetaOAuthState | null {
    try {
      // Convert from base64url to base64
      let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
      // Add padding if needed
      while (base64.length % 4) {
        base64 += '=';
      }
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const jsonString = new TextDecoder().decode(bytes);
      return JSON.parse(jsonString) as MetaOAuthState;
    } catch {
      return null;
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string
  ): Promise<MetaOAuthTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      redirect_uri: redirectUri,
      code,
    });

    const url = this.getApiUrl(`/oauth/access_token?${params.toString()}`);
    return this.apiRequest<MetaOAuthTokenResponse>(url);
  }

  /**
   * Exchange short-lived token for long-lived token
   */
  async getLongLivedToken(shortLivedToken: string): Promise<MetaLongLivedTokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.config.appId,
      client_secret: this.config.appSecret,
      fb_exchange_token: shortLivedToken,
    });

    const url = this.getApiUrl(`/oauth/access_token?${params.toString()}`);
    return this.apiRequest<MetaLongLivedTokenResponse>(url);
  }

  /**
   * Get user info from access token
   */
  async getUserInfo(accessToken: string): Promise<MetaUserInfo> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name,email',
    });

    const url = this.getApiUrl(`/me?${params.toString()}`);
    return this.apiRequest<MetaUserInfo>(url);
  }

  /**
   * Get ad accounts accessible by user
   */
  async getAdAccounts(accessToken: string): Promise<MetaAdAccount[]> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,account_id,name,currency,account_status,business_name',
    });

    const url = this.getApiUrl(`/me/adaccounts?${params.toString()}`);
    const response = await this.apiRequest<{ data: MetaAdAccount[] }>(url);
    return response.data;
  }

  /**
   * Get pages accessible by user
   */
  async getPages(accessToken: string): Promise<MetaPage[]> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name,access_token',
    });

    const url = this.getApiUrl(`/me/accounts?${params.toString()}`);
    const response = await this.apiRequest<{ data: MetaPage[] }>(url);
    return response.data;
  }

  /**
   * Get pixels for an ad account
   */
  async getPixels(adAccountId: string, accessToken: string): Promise<MetaPixel[]> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'id,name',
    });

    const url = this.getApiUrl(`/act_${adAccountId}/adspixels?${params.toString()}`);
    const response = await this.apiRequest<{ data: MetaPixel[] }>(url);
    return response.data;
  }

  /**
   * Get Instagram accounts linked to a page
   */
  async getInstagramAccounts(
    pageId: string,
    accessToken: string
  ): Promise<MetaInstagramUser[]> {
    const params = new URLSearchParams({
      access_token: accessToken,
      fields: 'instagram_business_account{id,username}',
    });

    const url = this.getApiUrl(`/${pageId}?${params.toString()}`);
    const response = await this.apiRequest<{
      instagram_business_account?: MetaInstagramUser;
    }>(url);

    return response.instagram_business_account
      ? [response.instagram_business_account]
      : [];
  }

  // ================================
  // Insights Methods (Hybrid/Auto Mode)
  // ================================

  /**
   * Check if operation mode supports insights sync
   */
  supportsInsightsSync(mode: OperationMode): boolean {
    return mode === 'hybrid' || mode === 'auto';
  }

  /**
   * Fetch insights from Meta API
   */
  async fetchInsights(
    adAccountId: string,
    accessToken: string,
    params: InsightsQueryParams
  ): Promise<MetaInsightsResponse> {
    const fields = params.fields ?? [
      'impressions',
      'clicks',
      'spend',
      'reach',
      'frequency',
      'cpc',
      'cpm',
      'ctr',
      'actions',
      'cost_per_action_type',
    ];

    if (params.level !== 'account') {
      fields.push(`${params.level}_id`, `${params.level}_name`);
    }

    const queryParams = new URLSearchParams({
      access_token: accessToken,
      level: params.level,
      fields: fields.join(','),
    });

    if (params.datePreset) {
      queryParams.set('date_preset', params.datePreset);
    } else if (params.timeRange) {
      queryParams.set(
        'time_range',
        JSON.stringify({
          since: params.timeRange.since,
          until: params.timeRange.until,
        })
      );
    }

    if (params.timeIncrement) {
      queryParams.set('time_increment', params.timeIncrement);
    }

    if (params.breakdowns && params.breakdowns.length > 0) {
      queryParams.set('breakdowns', params.breakdowns.join(','));
    }

    const url = this.getApiUrl(`/act_${adAccountId}/insights?${queryParams.toString()}`);
    return this.apiRequest<MetaInsightsResponse>(url);
  }

  /**
   * Parse insights response into storage format
   */
  parseInsights(
    response: MetaInsightsResponse,
    adBundleIdMap: Map<string, string>
  ): ParsedInsight[] {
    const parsed: ParsedInsight[] = [];

    for (const data of response.data) {
      // Determine which bundle this insight belongs to
      const metaAdId = data.ad_id;
      if (!metaAdId) continue;

      const adBundleId = adBundleIdMap.get(metaAdId);
      if (!adBundleId) continue;

      const insight: ParsedInsight = {
        adBundleId,
        date: data.date_start ?? new Date().toISOString().split('T')[0],
        metrics: {
          impressions: data.impressions ? parseInt(data.impressions, 10) : undefined,
          clicks: data.clicks ? parseInt(data.clicks, 10) : undefined,
          spend: data.spend ? parseFloat(data.spend) : undefined,
          reach: data.reach ? parseInt(data.reach, 10) : undefined,
          frequency: data.frequency ? parseFloat(data.frequency) : undefined,
          cpc: data.cpc ? parseFloat(data.cpc) : undefined,
          cpm: data.cpm ? parseFloat(data.cpm) : undefined,
          ctr: data.ctr ? parseFloat(data.ctr) : undefined,
          actions: data.actions,
          cost_per_action_type: data.cost_per_action_type,
        },
        source: 'meta',
      };

      parsed.push(insight);
    }

    return parsed;
  }

  // ================================
  // Campaign/AdSet/Ad/Creative Methods (Full Auto Mode)
  // ================================

  /**
   * Check if operation mode supports entity creation
   */
  supportsEntityCreation(mode: OperationMode): boolean {
    return mode === 'auto';
  }

  /**
   * Create a campaign
   */
  async createCampaign(
    adAccountId: string,
    accessToken: string,
    input: CreateCampaignInput
  ): Promise<MetaEntityCreationResponse> {
    const url = this.getApiUrl(`/act_${adAccountId}/campaigns`);

    const body = {
      name: input.name,
      objective: input.objective,
      status: input.status ?? 'PAUSED',
      special_ad_categories: input.specialAdCategories ?? [],
      buying_type: input.buyingType ?? 'AUCTION',
      access_token: accessToken,
    };

    if (input.dailyBudget) {
      Object.assign(body, { daily_budget: input.dailyBudget });
    }
    if (input.lifetimeBudget) {
      Object.assign(body, { lifetime_budget: input.lifetimeBudget });
    }

    return this.apiRequest<MetaEntityCreationResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Create an ad set
   */
  async createAdSet(
    adAccountId: string,
    accessToken: string,
    input: CreateAdSetInput
  ): Promise<MetaEntityCreationResponse> {
    const url = this.getApiUrl(`/act_${adAccountId}/adsets`);

    const body = {
      name: input.name,
      campaign_id: input.campaignId,
      billing_event: input.billingEvent,
      optimization_goal: input.optimizationGoal,
      targeting: input.targeting,
      status: input.status ?? 'PAUSED',
      access_token: accessToken,
    };

    if (input.dailyBudget) {
      Object.assign(body, { daily_budget: input.dailyBudget });
    }
    if (input.lifetimeBudget) {
      Object.assign(body, { lifetime_budget: input.lifetimeBudget });
    }
    if (input.startTime) {
      Object.assign(body, { start_time: input.startTime });
    }
    if (input.endTime) {
      Object.assign(body, { end_time: input.endTime });
    }
    if (input.bidStrategy) {
      Object.assign(body, { bid_strategy: input.bidStrategy });
    }
    if (input.bidAmount) {
      Object.assign(body, { bid_amount: input.bidAmount });
    }

    return this.apiRequest<MetaEntityCreationResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Create an ad
   */
  async createAd(
    adAccountId: string,
    accessToken: string,
    input: CreateAdInput
  ): Promise<MetaEntityCreationResponse> {
    const url = this.getApiUrl(`/act_${adAccountId}/ads`);

    const body = {
      name: input.name,
      adset_id: input.adsetId,
      creative: { creative_id: input.creativeId },
      status: input.status ?? 'PAUSED',
      access_token: accessToken,
    };

    if (input.trackingSpecs) {
      Object.assign(body, { tracking_specs: input.trackingSpecs });
    }

    return this.apiRequest<MetaEntityCreationResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Create a creative
   */
  async createCreative(
    adAccountId: string,
    accessToken: string,
    input: CreateCreativeInput
  ): Promise<MetaEntityCreationResponse> {
    const url = this.getApiUrl(`/act_${adAccountId}/adcreatives`);

    const body = {
      name: input.name,
      object_story_spec: input.objectStorySpec,
      access_token: accessToken,
    };

    if (input.degreesOfFreedomSpec) {
      Object.assign(body, { degrees_of_freedom_spec: input.degreesOfFreedomSpec });
    }

    return this.apiRequest<MetaEntityCreationResponse>(url, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Update entity status (pause/activate)
   */
  async updateEntityStatus(
    entityId: string,
    accessToken: string,
    status: 'ACTIVE' | 'PAUSED' | 'DELETED'
  ): Promise<{ success: boolean }> {
    const url = this.getApiUrl(`/${entityId}`);

    return this.apiRequest<{ success: boolean }>(url, {
      method: 'POST',
      body: JSON.stringify({
        status,
        access_token: accessToken,
      }),
    });
  }

  /**
   * Delete an entity
   */
  async deleteEntity(entityId: string, accessToken: string): Promise<{ success: boolean }> {
    const url = this.getApiUrl(`/${entityId}`);

    return this.apiRequest<{ success: boolean }>(url, {
      method: 'DELETE',
      body: JSON.stringify({ access_token: accessToken }),
    });
  }

  // ================================
  // Token Management
  // ================================

  /**
   * Validate access token
   */
  async validateToken(
    accessToken: string
  ): Promise<{ isValid: boolean; expiresAt?: number; scopes?: string[] }> {
    try {
      const params = new URLSearchParams({
        input_token: accessToken,
        access_token: `${this.config.appId}|${this.config.appSecret}`,
      });

      const url = this.getApiUrl(`/debug_token?${params.toString()}`);
      const response = await this.apiRequest<{
        data: {
          is_valid: boolean;
          expires_at?: number;
          scopes?: string[];
        };
      }>(url);

      return {
        isValid: response.data.is_valid,
        expiresAt: response.data.expires_at,
        scopes: response.data.scopes,
      };
    } catch {
      return { isValid: false };
    }
  }
}

/**
 * Token Store Interface
 * Abstraction for secure token storage (KV, Secrets Manager, etc.)
 */
export interface ITokenStore {
  /**
   * Store encrypted token
   */
  store(tenantId: string, token: string): Promise<string>;

  /**
   * Retrieve decrypted token
   */
  retrieve(tokenRef: string): Promise<string | null>;

  /**
   * Delete stored token
   */
  delete(tokenRef: string): Promise<boolean>;
}

/**
 * Simple KV-based token store implementation
 * In production, use proper encryption with KMS
 */
export class KVTokenStore implements ITokenStore {
  private kv: KVNamespace;
  private prefix: string;

  constructor(kv: KVNamespace, prefix = 'meta_token_') {
    this.kv = kv;
    this.prefix = prefix;
  }

  async store(tenantId: string, token: string): Promise<string> {
    const tokenRef = `${this.prefix}${ulid()}`;
    // In production: encrypt token before storing
    await this.kv.put(tokenRef, JSON.stringify({ tenantId, token }), {
      expirationTtl: 60 * 24 * 60 * 60, // 60 days
    });
    return tokenRef;
  }

  async retrieve(tokenRef: string): Promise<string | null> {
    const data = await this.kv.get(tokenRef);
    if (!data) return null;
    // In production: decrypt token after retrieving
    const parsed = JSON.parse(data) as { token: string };
    return parsed.token;
  }

  async delete(tokenRef: string): Promise<boolean> {
    await this.kv.delete(tokenRef);
    return true;
  }
}

/**
 * Insights sync service
 * Handles scheduled insights synchronization
 */
export class InsightsSyncService {
  private metaService: MetaService;
  private tokenStore: ITokenStore;

  constructor(metaService: MetaService, tokenStore: ITokenStore) {
    this.metaService = metaService;
    this.tokenStore = tokenStore;
  }

  /**
   * Sync insights for a connection
   */
  async syncForConnection(
    connection: MetaConnection,
    adBundleIdMap: Map<string, string>,
    dateRange?: { since: string; until: string }
  ): Promise<InsightsSyncResult> {
    const startTime = Date.now();
    let synced = 0;
    let errors = 0;

    try {
      // Get access token
      const accessToken = await this.tokenStore.retrieve(connection.tokenRef);
      if (!accessToken) {
        throw new MetaServiceError('Token not found', 'TOKEN_NOT_FOUND');
      }

      if (!connection.adAccountId) {
        throw new MetaServiceError('No ad account configured', 'NO_AD_ACCOUNT');
      }

      // Determine date range
      const range = dateRange ?? {
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        until: new Date().toISOString().split('T')[0],
      };

      // Fetch daily insights
      const dailyResponse = await this.metaService.fetchInsights(
        connection.adAccountId,
        accessToken,
        {
          level: 'ad',
          timeRange: range,
          timeIncrement: '1',
        }
      );

      const parsedDaily = this.metaService.parseInsights(dailyResponse, adBundleIdMap);
      synced += parsedDaily.length;

      return {
        success: true,
        synced,
        errors,
        lastSyncAt: new Date().toISOString(),
        details: {
          hourly: 0,
          daily: parsedDaily.length,
        },
      };
    } catch (error) {
      errors++;
      console.error('Insights sync error:', error);
      return {
        success: false,
        synced,
        errors,
        lastSyncAt: new Date().toISOString(),
      };
    }
  }
}
