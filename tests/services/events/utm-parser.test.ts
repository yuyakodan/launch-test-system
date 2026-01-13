/**
 * UTM Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parseUtmParams,
  parseUtmContent,
  buildUtmString,
  buildUtmContent,
  isValidUlid,
  extractDomain,
  normalizeUrl,
} from '../../../src/services/events/utm-parser.js';

// Valid 26-character ULIDs for testing (Crockford Base32)
const ULID_1 = '01ARZ3NDEKTSV4RRFFQ69G5FAV'; // 26 chars
const ULID_2 = '01ARZ3NDEKTSV4RRFFQ69G5FBV'; // 26 chars
const ULID_3 = '01ARZ3NDEKTSV4RRFFQ69G5FCV'; // 26 chars

describe('UTM Parser', () => {
  describe('parseUtmParams', () => {
    it('should parse standard UTM parameters', () => {
      const url = 'https://example.com/lp?utm_source=meta&utm_medium=cpc&utm_campaign=test_campaign&utm_term=keyword&utm_content=ad1';
      const result = parseUtmParams(url);

      expect(result.utm_source).toBe('meta');
      expect(result.utm_medium).toBe('cpc');
      expect(result.utm_campaign).toBe('test_campaign');
      expect(result.utm_term).toBe('keyword');
      expect(result.utm_content).toBe('ad1');
    });

    it('should parse custom tracking parameters', () => {
      const url = `https://example.com/lp?ab_id=${ULID_1}&cv_id=${ULID_2}&int_id=${ULID_3}`;
      const result = parseUtmParams(url);

      expect(result.ad_bundle_id).toBe(ULID_1);
      expect(result.creative_variant_id).toBe(ULID_2);
      expect(result.intent_id).toBe(ULID_3);
    });

    it('should extract IDs from utm_content when not provided separately', () => {
      const url = `https://example.com/lp?utm_content=${ULID_1}:${ULID_2}:${ULID_3}`;
      const result = parseUtmParams(url);

      expect(result.ad_bundle_id).toBe(ULID_1);
      expect(result.creative_variant_id).toBe(ULID_2);
      expect(result.intent_id).toBe(ULID_3);
    });

    it('should prefer explicit parameters over utm_content embedded values', () => {
      const explicitId = '01ARZ3NDEKTSV4RRFFQ69G5FDV';
      const url = `https://example.com/lp?ab_id=${explicitId}&utm_content=${ULID_1}:${ULID_2}`;
      const result = parseUtmParams(url);

      expect(result.ad_bundle_id).toBe(explicitId);
      expect(result.creative_variant_id).toBe(ULID_2);
    });

    it('should return empty object for invalid URL', () => {
      const result = parseUtmParams('not-a-valid-url');
      expect(result).toEqual({});
    });

    it('should return empty object for URL without params', () => {
      const result = parseUtmParams('https://example.com/lp');
      expect(result).toEqual({});
    });

    it('should decode URL-encoded values', () => {
      const url = 'https://example.com/lp?utm_source=meta%20ads&utm_campaign=test%20campaign';
      const result = parseUtmParams(url);

      expect(result.utm_source).toBe('meta ads');
      expect(result.utm_campaign).toBe('test campaign');
    });
  });

  describe('parseUtmContent', () => {
    it('should parse full format with all three IDs', () => {
      const result = parseUtmContent(`${ULID_1}:${ULID_2}:${ULID_3}`);

      expect(result.ad_bundle_id).toBe(ULID_1);
      expect(result.creative_variant_id).toBe(ULID_2);
      expect(result.intent_id).toBe(ULID_3);
    });

    it('should parse partial format with only ad_bundle_id', () => {
      const result = parseUtmContent(ULID_1);

      expect(result.ad_bundle_id).toBe(ULID_1);
      expect(result.creative_variant_id).toBeUndefined();
      expect(result.intent_id).toBeUndefined();
    });

    it('should parse partial format with two IDs', () => {
      const result = parseUtmContent(`${ULID_1}:${ULID_2}`);

      expect(result.ad_bundle_id).toBe(ULID_1);
      expect(result.creative_variant_id).toBe(ULID_2);
      expect(result.intent_id).toBeUndefined();
    });

    it('should ignore invalid ULID values', () => {
      const result = parseUtmContent(`invalid:${ULID_2}:too-short`);

      expect(result.ad_bundle_id).toBeUndefined();
      expect(result.creative_variant_id).toBe(ULID_2);
      expect(result.intent_id).toBeUndefined();
    });

    it('should return empty object for empty string', () => {
      const result = parseUtmContent('');
      expect(result).toEqual({});
    });
  });

  describe('buildUtmString', () => {
    it('should build query string from UTM params', () => {
      const result = buildUtmString({
        utm_source: 'meta',
        utm_medium: 'cpc',
        utm_campaign: 'test',
      });

      expect(result).toContain('utm_source=meta');
      expect(result).toContain('utm_medium=cpc');
      expect(result).toContain('utm_campaign=test');
    });

    it('should include custom tracking parameters', () => {
      const result = buildUtmString({
        ad_bundle_id: ULID_1,
        creative_variant_id: ULID_2,
      });

      expect(result).toContain(`ab_id=${ULID_1}`);
      expect(result).toContain(`cv_id=${ULID_2}`);
    });

    it('should return empty string for empty params', () => {
      const result = buildUtmString({});
      expect(result).toBe('');
    });
  });

  describe('buildUtmContent', () => {
    it('should build encoded utm_content with all IDs', () => {
      const result = buildUtmContent(ULID_1, ULID_2, ULID_3);

      expect(result).toBe(`${ULID_1}:${ULID_2}:${ULID_3}`);
    });

    it('should build partial content with only ad_bundle_id', () => {
      const result = buildUtmContent(ULID_1);
      expect(result).toBe(ULID_1);
    });

    it('should handle missing middle values', () => {
      const result = buildUtmContent(ULID_1, undefined, ULID_3);
      expect(result).toBe(`${ULID_1}::${ULID_3}`);
    });

    it('should return empty string for no values', () => {
      const result = buildUtmContent();
      expect(result).toBe('');
    });
  });

  describe('isValidUlid', () => {
    it('should return true for valid ULID', () => {
      expect(isValidUlid(ULID_1)).toBe(true);
      expect(isValidUlid(ULID_3)).toBe(true);
      // Real-world ULID example
      expect(isValidUlid('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(true);
    });

    it('should return false for invalid ULID', () => {
      expect(isValidUlid('')).toBe(false);
      expect(isValidUlid('too-short')).toBe(false);
      expect(isValidUlid('this-is-way-too-long-to-be-valid')).toBe(false);
      // Contains invalid characters (I, L, O, U are not in Crockford Base32)
      expect(isValidUlid('01HXILOU567890123456AAAA')).toBe(false);
    });

    it('should handle null and undefined', () => {
      expect(isValidUlid(null as unknown as string)).toBe(false);
      expect(isValidUlid(undefined as unknown as string)).toBe(false);
    });
  });

  describe('extractDomain', () => {
    it('should extract domain from URL', () => {
      expect(extractDomain('https://example.com/lp?foo=bar')).toBe('example.com');
      expect(extractDomain('https://sub.example.com/path')).toBe('sub.example.com');
    });

    it('should return null for invalid URL', () => {
      expect(extractDomain('not-a-url')).toBeNull();
      expect(extractDomain('')).toBeNull();
    });
  });

  describe('normalizeUrl', () => {
    it('should remove UTM parameters', () => {
      const result = normalizeUrl('https://example.com/lp?utm_source=meta&other=value');
      expect(result).not.toContain('utm_source');
      expect(result).toContain('other=value');
    });

    it('should remove tracking parameters', () => {
      const result = normalizeUrl('https://example.com/lp?fbclid=123&gclid=456&_ga=789');
      expect(result).not.toContain('fbclid');
      expect(result).not.toContain('gclid');
      expect(result).not.toContain('_ga');
    });

    it('should lowercase URL', () => {
      const result = normalizeUrl('https://Example.COM/Path');
      expect(result).toBe('https://example.com/path');
    });

    it('should return null for invalid URL', () => {
      expect(normalizeUrl('not-a-url')).toBeNull();
    });
  });
});
