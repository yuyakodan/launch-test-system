/**
 * Event Processor Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventProcessor } from '../../../src/services/events/event-processor.js';
import type { EventPayload } from '../../../src/types/events.js';

// Mock D1Database
function createMockDb() {
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockRun = vi.fn().mockResolvedValue({ success: true });
  const mockBatch = vi.fn().mockResolvedValue([]);

  const mockPrepare = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      first: mockFirst,
      all: mockAll,
      run: mockRun,
    }),
  });

  return {
    prepare: mockPrepare,
    batch: mockBatch,
    _mocks: { mockFirst, mockAll, mockRun, mockBatch, mockPrepare },
  } as unknown as D1Database & { _mocks: Record<string, ReturnType<typeof vi.fn>> };
}

// Valid 26-character ULIDs for testing (Crockford Base32)
const ULID_RUN = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
const ULID_LP_VARIANT = '01ARZ3NDEKTSV4RRFFQ69G5FBV';
const ULID_AD_BUNDLE = '01ARZ3NDEKTSV4RRFFQ69G5FCV';
const ULID_CREATIVE = '01ARZ3NDEKTSV4RRFFQ69G5FDV';

// Helper to create valid event payload
function createValidPayload(overrides: Partial<EventPayload> = {}): EventPayload {
  return {
    v: 1,
    event_id: 'test-event-123',
    ts_ms: Date.now(),
    event_type: 'pageview',
    session_id: 'session-456',
    run_id: ULID_RUN,
    lp_variant_id: ULID_LP_VARIANT,
    page_url: 'https://example.com/lp?utm_source=meta',
    ...overrides,
  };
}

describe('EventProcessor', () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let processor: EventProcessor;

  beforeEach(() => {
    mockDb = createMockDb();
    processor = new EventProcessor(mockDb);
  });

  describe('validateEvent', () => {
    it('should accept valid event payload', () => {
      const payload = createValidPayload();
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid protocol version', () => {
      const payload = createValidPayload({ v: 2 });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'v',
          message: 'Invalid protocol version',
        })
      );
    });

    it('should reject missing event_id', () => {
      const payload = createValidPayload({ event_id: '' });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'event_id',
        })
      );
    });

    it('should reject missing ts_ms', () => {
      const payload = createValidPayload({ ts_ms: undefined as unknown as number });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'ts_ms',
        })
      );
    });

    it('should reject events that are too old', () => {
      const sevenDaysAgoMs = Date.now() - (8 * 24 * 60 * 60 * 1000);
      const payload = createValidPayload({ ts_ms: sevenDaysAgoMs });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'ts_ms',
          message: 'Event timestamp is too old',
        })
      );
    });

    it('should reject events in the future', () => {
      const tenMinutesInFuture = Date.now() + (10 * 60 * 1000);
      const payload = createValidPayload({ ts_ms: tenMinutesInFuture });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'ts_ms',
          message: 'Event timestamp is in the future',
        })
      );
    });

    it('should allow slight clock skew (5 minutes into future)', () => {
      const fourMinutesInFuture = Date.now() + (4 * 60 * 1000);
      const payload = createValidPayload({ ts_ms: fourMinutesInFuture });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid event_type', () => {
      const payload = createValidPayload({ event_type: 'invalid' as any });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'event_type',
        })
      );
    });

    it('should accept all valid event types', () => {
      const eventTypes = ['pageview', 'cta_click', 'form_submit', 'form_success'] as const;

      for (const eventType of eventTypes) {
        const payload = createValidPayload({ event_type: eventType });
        const result = processor.validateEvent(payload);
        expect(result.valid).toBe(true);
      }
    });

    it('should reject missing session_id', () => {
      const payload = createValidPayload({ session_id: '' });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'session_id',
        })
      );
    });

    it('should reject missing run_id', () => {
      const payload = createValidPayload({ run_id: '' });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'run_id',
        })
      );
    });

    it('should reject missing lp_variant_id', () => {
      const payload = createValidPayload({ lp_variant_id: '' });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'lp_variant_id',
        })
      );
    });

    it('should reject invalid page_url', () => {
      const payload = createValidPayload({ page_url: 'not-a-valid-url' });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          field: 'page_url',
          message: 'page_url must be a valid URL',
        })
      );
    });

    it('should collect all validation errors', () => {
      const payload = createValidPayload({
        v: 2,
        event_id: '',
        event_type: 'invalid' as any,
      });
      const result = processor.validateEvent(payload);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('processEvent', () => {
    it('should return success for valid event', async () => {
      const payload = createValidPayload();
      const result = await processor.processEvent(payload, '192.168.1.1');

      expect(result.ok).toBe(true);
      expect(result.event_id).toBe(payload.event_id);
      expect(result.error).toBeUndefined();
    });

    it('should return error for invalid event', async () => {
      const payload = createValidPayload({ v: 99 });
      const result = await processor.processEvent(payload, '192.168.1.1');

      expect(result.ok).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should silently accept duplicate events', async () => {
      // Setup mock to return existing event
      mockDb._mocks.mockFirst.mockResolvedValueOnce({ id: 'existing' });

      const payload = createValidPayload();
      const result = await processor.processEvent(payload, '192.168.1.1');

      expect(result.ok).toBe(true);
      expect(result.event_id).toBe(payload.event_id);
    });

    it('should handle null client IP', async () => {
      const payload = createValidPayload();
      const result = await processor.processEvent(payload, null);

      expect(result.ok).toBe(true);
    });
  });

  describe('processBatch', () => {
    it('should process multiple valid events', async () => {
      const batch = {
        events: [
          createValidPayload({ event_id: 'event-1' }),
          createValidPayload({ event_id: 'event-2' }),
          createValidPayload({ event_id: 'event-3' }),
        ],
      };

      const result = await processor.processBatch(batch, '192.168.1.1');

      expect(result.ok).toBe(true);
      expect(result.accepted).toBe(3);
      expect(result.rejected).toBe(0);
    });

    it('should reject batch exceeding max size', async () => {
      const events = Array.from({ length: 150 }, (_, i) =>
        createValidPayload({ event_id: `event-${i}` })
      );

      const result = await processor.processBatch({ events }, '192.168.1.1');

      expect(result.ok).toBe(false);
      expect(result.rejected).toBe(150);
      expect(result.errors?.batch).toContain('exceeds maximum');
    });

    it('should handle mixed valid and invalid events', async () => {
      const batch = {
        events: [
          createValidPayload({ event_id: 'valid-1' }),
          createValidPayload({ event_id: 'invalid', v: 99 }),
          createValidPayload({ event_id: 'valid-2' }),
        ],
      };

      const result = await processor.processBatch(batch, '192.168.1.1');

      expect(result.ok).toBe(false); // Has rejections
      expect(result.accepted).toBe(2);
      expect(result.rejected).toBe(1);
      expect(result.errors?.invalid).toBeDefined();
    });

    it('should deduplicate within batch', async () => {
      const batch = {
        events: [
          createValidPayload({ event_id: 'duplicate' }),
          createValidPayload({ event_id: 'duplicate' }),
          createValidPayload({ event_id: 'unique' }),
        ],
      };

      const result = await processor.processBatch(batch, '192.168.1.1');

      expect(result.accepted).toBe(2);
      expect(result.deduplicated).toBe(1);
    });

    it('should return ok=true for empty batch', async () => {
      const result = await processor.processBatch({ events: [] }, '192.168.1.1');

      expect(result.ok).toBe(true);
      expect(result.accepted).toBe(0);
    });
  });

  describe('enrichEvent', () => {
    it('should add received_at_ms timestamp', async () => {
      const payload = createValidPayload();
      const before = Date.now();

      const enriched = await processor.enrichEvent(payload, null);

      expect(enriched.received_at_ms).toBeGreaterThanOrEqual(before);
    });

    it('should parse UTM parameters from page_url', async () => {
      const payload = createValidPayload({
        page_url: `https://example.com/lp?ab_id=${ULID_AD_BUNDLE}&cv_id=${ULID_CREATIVE}`,
      });

      const enriched = await processor.enrichEvent(payload, null);

      expect(enriched.ad_bundle_id).toBe(ULID_AD_BUNDLE);
      expect(enriched.creative_variant_id).toBe(ULID_CREATIVE);
    });

    it('should hash IP address', async () => {
      const payload = createValidPayload();

      const enriched = await processor.enrichEvent(payload, '192.168.1.1');

      expect(enriched.ip_hash).toBeDefined();
      expect(enriched.ip_hash).toHaveLength(16);
    });

    it('should set ip_hash to null when no IP provided', async () => {
      const payload = createValidPayload();

      const enriched = await processor.enrichEvent(payload, null);

      expect(enriched.ip_hash).toBeNull();
    });

    it('should stringify meta to JSON', async () => {
      const payload = createValidPayload({
        meta: { customField: 'value', nested: { key: 123 } },
      });

      const enriched = await processor.enrichEvent(payload, null);

      expect(enriched.meta_json).toBe(JSON.stringify(payload.meta));
    });

    it('should use empty object for missing meta', async () => {
      const payload = createValidPayload();
      delete payload.meta;

      const enriched = await processor.enrichEvent(payload, null);

      expect(enriched.meta_json).toBe('{}');
    });
  });

  describe('checkDuplicate', () => {
    it('should return true for existing event', async () => {
      mockDb._mocks.mockFirst.mockResolvedValueOnce({ id: 'exists' });

      const result = await processor.checkDuplicate('test-event');

      expect(result).toBe(true);
    });

    it('should return false for new event', async () => {
      mockDb._mocks.mockFirst.mockResolvedValueOnce(null);

      const result = await processor.checkDuplicate('new-event');

      expect(result).toBe(false);
    });

    it('should return false on database error', async () => {
      mockDb._mocks.mockFirst.mockRejectedValueOnce(new Error('DB Error'));

      const result = await processor.checkDuplicate('test-event');

      expect(result).toBe(false);
    });
  });

  describe('checkDuplicateBatch', () => {
    it('should return set of existing event IDs', async () => {
      mockDb._mocks.mockAll.mockResolvedValueOnce({
        results: [{ id: 'exists-1' }, { id: 'exists-2' }],
      });

      const result = await processor.checkDuplicateBatch(['exists-1', 'exists-2', 'new-1']);

      expect(result.has('exists-1')).toBe(true);
      expect(result.has('exists-2')).toBe(true);
      expect(result.has('new-1')).toBe(false);
    });

    it('should return empty set for empty input', async () => {
      const result = await processor.checkDuplicateBatch([]);

      expect(result.size).toBe(0);
    });

    it('should return empty set on database error', async () => {
      mockDb._mocks.mockAll.mockRejectedValueOnce(new Error('DB Error'));

      const result = await processor.checkDuplicateBatch(['test-1', 'test-2']);

      expect(result.size).toBe(0);
    });
  });
});
