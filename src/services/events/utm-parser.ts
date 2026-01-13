/**
 * UTM Parameter Parser
 * Extracts UTM parameters and custom tracking IDs from URLs
 */

import type { ParsedUtmParams } from '../../types/events.js';

/**
 * Standard UTM parameter names
 */
const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

/**
 * Custom parameter names for bundle/variant tracking
 * These are embedded in utm_content or as separate parameters
 */
const CUSTOM_PARAMS = {
  AD_BUNDLE_ID: 'ab_id',
  CREATIVE_VARIANT_ID: 'cv_id',
  INTENT_ID: 'int_id',
} as const;

/**
 * Delimiter used in utm_content for encoding multiple IDs
 * Format: ab_id:cv_id:int_id
 */
const UTM_CONTENT_DELIMITER = ':';

/**
 * Parse UTM parameters from a URL string
 *
 * @param url - Full URL string to parse
 * @returns Parsed UTM parameters including custom tracking IDs
 *
 * @example
 * ```typescript
 * const params = parseUtmParams('https://example.com?utm_source=meta&utm_campaign=test&ab_id=abc123');
 * // { utm_source: 'meta', utm_campaign: 'test', ad_bundle_id: 'abc123' }
 * ```
 */
export function parseUtmParams(url: string): ParsedUtmParams {
  const result: ParsedUtmParams = {};

  try {
    const urlObj = new URL(url);
    const searchParams = urlObj.searchParams;

    // Extract standard UTM parameters
    for (const param of UTM_PARAMS) {
      const value = searchParams.get(param);
      if (value) {
        result[param] = decodeURIComponent(value);
      }
    }

    // Extract custom parameters from query string directly
    const adBundleId = searchParams.get(CUSTOM_PARAMS.AD_BUNDLE_ID);
    if (adBundleId) {
      result.ad_bundle_id = decodeURIComponent(adBundleId);
    }

    const creativeVariantId = searchParams.get(CUSTOM_PARAMS.CREATIVE_VARIANT_ID);
    if (creativeVariantId) {
      result.creative_variant_id = decodeURIComponent(creativeVariantId);
    }

    const intentId = searchParams.get(CUSTOM_PARAMS.INTENT_ID);
    if (intentId) {
      result.intent_id = decodeURIComponent(intentId);
    }

    // If not found directly, try to extract from utm_content
    // Format: ad_bundle_id:creative_variant_id:intent_id
    if (result.utm_content && (!result.ad_bundle_id || !result.creative_variant_id)) {
      const parsed = parseUtmContent(result.utm_content);
      if (parsed.ad_bundle_id && !result.ad_bundle_id) {
        result.ad_bundle_id = parsed.ad_bundle_id;
      }
      if (parsed.creative_variant_id && !result.creative_variant_id) {
        result.creative_variant_id = parsed.creative_variant_id;
      }
      if (parsed.intent_id && !result.intent_id) {
        result.intent_id = parsed.intent_id;
      }
    }
  } catch {
    // Invalid URL, return empty result
    return {};
  }

  return result;
}

/**
 * Parse custom IDs from utm_content parameter
 * Expected format: ad_bundle_id:creative_variant_id:intent_id
 *
 * @param utmContent - The utm_content parameter value
 * @returns Extracted IDs
 */
export function parseUtmContent(utmContent: string): Pick<ParsedUtmParams, 'ad_bundle_id' | 'creative_variant_id' | 'intent_id'> {
  const result: Pick<ParsedUtmParams, 'ad_bundle_id' | 'creative_variant_id' | 'intent_id'> = {};

  if (!utmContent) {
    return result;
  }

  const parts = utmContent.split(UTM_CONTENT_DELIMITER);

  // First part is ad_bundle_id
  if (parts[0] && isValidUlid(parts[0])) {
    result.ad_bundle_id = parts[0];
  }

  // Second part is creative_variant_id
  if (parts[1] && isValidUlid(parts[1])) {
    result.creative_variant_id = parts[1];
  }

  // Third part is intent_id
  if (parts[2] && isValidUlid(parts[2])) {
    result.intent_id = parts[2];
  }

  return result;
}

/**
 * Build a UTM string from parameters
 *
 * @param params - UTM parameters to encode
 * @returns URL query string (without leading ?)
 *
 * @example
 * ```typescript
 * const utmString = buildUtmString({ utm_source: 'meta', ad_bundle_id: 'abc123' });
 * // 'utm_source=meta&ab_id=abc123'
 * ```
 */
export function buildUtmString(params: ParsedUtmParams): string {
  const searchParams = new URLSearchParams();

  // Add standard UTM parameters
  if (params.utm_source) searchParams.set('utm_source', params.utm_source);
  if (params.utm_medium) searchParams.set('utm_medium', params.utm_medium);
  if (params.utm_campaign) searchParams.set('utm_campaign', params.utm_campaign);
  if (params.utm_term) searchParams.set('utm_term', params.utm_term);
  if (params.utm_content) searchParams.set('utm_content', params.utm_content);

  // Add custom tracking parameters
  if (params.ad_bundle_id) searchParams.set(CUSTOM_PARAMS.AD_BUNDLE_ID, params.ad_bundle_id);
  if (params.creative_variant_id) searchParams.set(CUSTOM_PARAMS.CREATIVE_VARIANT_ID, params.creative_variant_id);
  if (params.intent_id) searchParams.set(CUSTOM_PARAMS.INTENT_ID, params.intent_id);

  return searchParams.toString();
}

/**
 * Build utm_content value with embedded IDs
 *
 * @param adBundleId - Ad bundle ID
 * @param creativeVariantId - Creative variant ID
 * @param intentId - Intent ID
 * @returns Encoded utm_content string
 */
export function buildUtmContent(
  adBundleId?: string,
  creativeVariantId?: string,
  intentId?: string
): string {
  const parts = [
    adBundleId || '',
    creativeVariantId || '',
    intentId || '',
  ];

  // Remove trailing empty parts
  while (parts.length > 0 && parts[parts.length - 1] === '') {
    parts.pop();
  }

  return parts.join(UTM_CONTENT_DELIMITER);
}

/**
 * Validate if a string looks like a ULID
 * ULIDs are 26 characters, base32 encoded
 *
 * @param value - String to validate
 * @returns Whether the string is a valid ULID format
 */
export function isValidUlid(value: string): boolean {
  if (!value || value.length !== 26) {
    return false;
  }

  // ULID uses Crockford's Base32 alphabet
  const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  return ULID_REGEX.test(value);
}

/**
 * Extract domain from URL for analytics grouping
 *
 * @param url - Full URL string
 * @returns Domain name or null if invalid
 */
export function extractDomain(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

/**
 * Normalize URL for comparison (remove tracking params, lowercase, etc.)
 *
 * @param url - URL to normalize
 * @returns Normalized URL string
 */
export function normalizeUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);

    // Remove UTM and tracking parameters
    const paramsToRemove = [
      ...UTM_PARAMS,
      CUSTOM_PARAMS.AD_BUNDLE_ID,
      CUSTOM_PARAMS.CREATIVE_VARIANT_ID,
      CUSTOM_PARAMS.INTENT_ID,
      'fbclid',
      'gclid',
      '_ga',
    ];

    for (const param of paramsToRemove) {
      urlObj.searchParams.delete(param);
    }

    // Sort remaining params for consistent comparison
    urlObj.searchParams.sort();

    // Return normalized URL
    return urlObj.toString().toLowerCase();
  } catch {
    return null;
  }
}
