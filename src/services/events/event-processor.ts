/**
 * Event Processor Service
 * Handles event validation, enrichment, deduplication, and storage
 */

import type { D1Database } from '@cloudflare/workers-types';
import type {
  EventPayload,
  EventBatchPayload,
  EventResponse,
  EventBatchResponse,
  ProcessedEvent,
  EventValidationResult,
  EventValidationError,
  EventProcessorConfig,
} from '../../types/events.js';
import {
  EVENT_PROTOCOL_VERSION,
  SUPPORTED_EVENT_TYPES,
  DEFAULT_EVENT_PROCESSOR_CONFIG,
} from '../../types/events.js';
import { parseUtmParams } from './utm-parser.js';

/**
 * Event Processor class
 * Handles the full lifecycle of event processing
 */
export class EventProcessor {
  private readonly db: D1Database;
  private readonly config: EventProcessorConfig;

  constructor(db: D1Database, config: Partial<EventProcessorConfig> = {}) {
    this.db = db;
    this.config = { ...DEFAULT_EVENT_PROCESSOR_CONFIG, ...config };
  }

  /**
   * Process a single event
   *
   * @param payload - Event payload from client
   * @param clientIp - Client IP address for hashing
   * @returns Event response indicating success or failure
   */
  async processEvent(
    payload: EventPayload,
    clientIp: string | null
  ): Promise<EventResponse> {
    // Validate event
    const validation = this.validateEvent(payload);
    if (!validation.valid) {
      return {
        ok: false,
        event_id: payload.event_id || 'unknown',
        error: validation.errors.map((e) => e.message).join('; '),
      };
    }

    // Check for duplicate
    if (this.config.enableDeduplication) {
      const isDuplicate = await this.checkDuplicate(payload.event_id);
      if (isDuplicate) {
        return {
          ok: true,
          event_id: payload.event_id,
          // Silently accept duplicates (idempotent)
        };
      }
    }

    // Enrich and process event
    const processedEvent = await this.enrichEvent(payload, clientIp);

    // Store event
    await this.storeEvent(processedEvent);

    return {
      ok: true,
      event_id: payload.event_id,
    };
  }

  /**
   * Process a batch of events
   *
   * @param batch - Batch of events to process
   * @param clientIp - Client IP address for hashing
   * @returns Batch response with statistics
   */
  async processBatch(
    batch: EventBatchPayload,
    clientIp: string | null
  ): Promise<EventBatchResponse> {
    const result: EventBatchResponse = {
      ok: true,
      accepted: 0,
      rejected: 0,
      deduplicated: 0,
      errors: {},
    };

    // Validate batch size
    if (batch.events.length > this.config.maxBatchSize) {
      return {
        ok: false,
        accepted: 0,
        rejected: batch.events.length,
        deduplicated: 0,
        errors: {
          batch: `Batch size ${batch.events.length} exceeds maximum ${this.config.maxBatchSize}`,
        },
      };
    }

    // Collect valid events for batch insert
    const validEvents: ProcessedEvent[] = [];
    const eventIds = new Set<string>();

    for (const payload of batch.events) {
      // Validate event
      const validation = this.validateEvent(payload);
      if (!validation.valid) {
        result.rejected++;
        result.errors![payload.event_id || 'unknown'] = validation.errors
          .map((e) => e.message)
          .join('; ');
        continue;
      }

      // Check for in-batch duplicates
      if (eventIds.has(payload.event_id)) {
        result.deduplicated++;
        continue;
      }
      eventIds.add(payload.event_id);

      // Enrich event
      const processedEvent = await this.enrichEvent(payload, clientIp);
      validEvents.push(processedEvent);
    }

    // Check database duplicates in batch
    if (this.config.enableDeduplication && validEvents.length > 0) {
      const existingIds = await this.checkDuplicateBatch(
        validEvents.map((e) => e.id)
      );
      const newEvents = validEvents.filter((e) => {
        if (existingIds.has(e.id)) {
          result.deduplicated++;
          return false;
        }
        return true;
      });

      // Store non-duplicate events
      if (newEvents.length > 0) {
        await this.storeEventBatch(newEvents);
        result.accepted = newEvents.length;
      }
    } else if (validEvents.length > 0) {
      // Store all valid events without deduplication check
      await this.storeEventBatch(validEvents);
      result.accepted = validEvents.length;
    }

    // Set overall ok status
    result.ok = result.rejected === 0;

    return result;
  }

  /**
   * Validate an event payload
   *
   * @param payload - Event payload to validate
   * @returns Validation result
   */
  validateEvent(payload: EventPayload): EventValidationResult {
    const errors: EventValidationError[] = [];

    // Check protocol version
    if (payload.v !== EVENT_PROTOCOL_VERSION) {
      errors.push({
        field: 'v',
        message: `Invalid protocol version`,
        expected: String(EVENT_PROTOCOL_VERSION),
        received: payload.v,
      });
    }

    // Check required fields
    if (!payload.event_id || typeof payload.event_id !== 'string') {
      errors.push({
        field: 'event_id',
        message: 'event_id is required and must be a string',
      });
    }

    if (!payload.ts_ms || typeof payload.ts_ms !== 'number') {
      errors.push({
        field: 'ts_ms',
        message: 'ts_ms is required and must be a number',
      });
    } else {
      // Check timestamp age
      const now = Date.now();
      const age = now - payload.ts_ms;

      if (age > this.config.maxEventAgeMs) {
        errors.push({
          field: 'ts_ms',
          message: 'Event timestamp is too old',
          expected: `Within ${this.config.maxEventAgeMs}ms`,
          received: payload.ts_ms,
        });
      }

      if (age < this.config.minEventAgeMs) {
        errors.push({
          field: 'ts_ms',
          message: 'Event timestamp is in the future',
          expected: `Not more than ${Math.abs(this.config.minEventAgeMs)}ms in future`,
          received: payload.ts_ms,
        });
      }
    }

    // Check event type
    if (!payload.event_type || !SUPPORTED_EVENT_TYPES.includes(payload.event_type)) {
      errors.push({
        field: 'event_type',
        message: 'Invalid event_type',
        expected: SUPPORTED_EVENT_TYPES.join(', '),
        received: payload.event_type,
      });
    }

    // Check session_id
    if (!payload.session_id || typeof payload.session_id !== 'string') {
      errors.push({
        field: 'session_id',
        message: 'session_id is required and must be a string',
      });
    }

    // Check run_id
    if (!payload.run_id || typeof payload.run_id !== 'string') {
      errors.push({
        field: 'run_id',
        message: 'run_id is required and must be a string',
      });
    }

    // Check lp_variant_id
    if (!payload.lp_variant_id || typeof payload.lp_variant_id !== 'string') {
      errors.push({
        field: 'lp_variant_id',
        message: 'lp_variant_id is required and must be a string',
      });
    }

    // Check page_url
    if (!payload.page_url || typeof payload.page_url !== 'string') {
      errors.push({
        field: 'page_url',
        message: 'page_url is required and must be a string',
      });
    } else {
      try {
        new URL(payload.page_url);
      } catch {
        errors.push({
          field: 'page_url',
          message: 'page_url must be a valid URL',
          received: payload.page_url,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Enrich an event with server-side data
   *
   * @param payload - Validated event payload
   * @param clientIp - Client IP for hashing
   * @returns Processed event with enrichments
   */
  async enrichEvent(
    payload: EventPayload,
    clientIp: string | null
  ): Promise<ProcessedEvent> {
    // Parse UTM parameters from page URL
    const utmParams = parseUtmParams(payload.page_url);

    // Resolve tenant ID from run_id
    const tenantId = await this.resolveTenantId(payload.run_id);

    // Resolve intent_id from lp_variant_id if not in UTM
    const intentId = utmParams.intent_id || await this.resolveIntentId(payload.lp_variant_id);

    // Hash IP address for privacy
    const ipHash = clientIp ? await this.hashIp(clientIp) : null;

    return {
      id: payload.event_id,
      tenant_id: tenantId || 'unknown',
      run_id: payload.run_id,
      intent_id: intentId,
      lp_variant_id: payload.lp_variant_id,
      creative_variant_id: utmParams.creative_variant_id || null,
      ad_bundle_id: utmParams.ad_bundle_id || null,
      event_type: payload.event_type,
      ts_ms: payload.ts_ms,
      received_at_ms: Date.now(),
      session_id: payload.session_id,
      page_url: payload.page_url,
      referrer: payload.referrer || null,
      user_agent: payload.user_agent || null,
      ip_hash: ipHash,
      meta_json: payload.meta ? JSON.stringify(payload.meta) : '{}',
    };
  }

  /**
   * Check if an event ID already exists (deduplication)
   *
   * @param eventId - Event ID to check
   * @returns Whether the event already exists
   */
  async checkDuplicate(eventId: string): Promise<boolean> {
    try {
      const result = await this.db
        .prepare('SELECT 1 FROM events WHERE id = ? LIMIT 1')
        .bind(eventId)
        .first();
      return result !== null;
    } catch {
      // If table doesn't exist or other error, assume no duplicate
      return false;
    }
  }

  /**
   * Check multiple event IDs for duplicates
   *
   * @param eventIds - Event IDs to check
   * @returns Set of existing event IDs
   */
  async checkDuplicateBatch(eventIds: string[]): Promise<Set<string>> {
    const existing = new Set<string>();

    if (eventIds.length === 0) {
      return existing;
    }

    try {
      // Build IN clause with placeholders
      const placeholders = eventIds.map(() => '?').join(', ');
      const results = await this.db
        .prepare(`SELECT id FROM events WHERE id IN (${placeholders})`)
        .bind(...eventIds)
        .all();

      for (const row of results.results) {
        existing.add(row.id as string);
      }
    } catch {
      // If table doesn't exist or other error, assume no duplicates
    }

    return existing;
  }

  /**
   * Store a single event in the database
   *
   * @param event - Processed event to store
   */
  async storeEvent(event: ProcessedEvent): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO events (
          id, tenant_id, run_id, intent_id, lp_variant_id,
          creative_variant_id, ad_bundle_id, event_type, ts_ms,
          session_id, page_url, referrer, user_agent, ip_hash, meta_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        event.id,
        event.tenant_id,
        event.run_id,
        event.intent_id,
        event.lp_variant_id,
        event.creative_variant_id,
        event.ad_bundle_id,
        event.event_type,
        event.ts_ms,
        event.session_id,
        event.page_url,
        event.referrer,
        event.user_agent,
        event.ip_hash,
        event.meta_json
      )
      .run();
  }

  /**
   * Store multiple events in the database (batch insert)
   *
   * @param events - Processed events to store
   */
  async storeEventBatch(events: ProcessedEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Use D1 batch API for better performance
    const statements = events.map((event) =>
      this.db
        .prepare(
          `INSERT INTO events (
            id, tenant_id, run_id, intent_id, lp_variant_id,
            creative_variant_id, ad_bundle_id, event_type, ts_ms,
            session_id, page_url, referrer, user_agent, ip_hash, meta_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          event.id,
          event.tenant_id,
          event.run_id,
          event.intent_id,
          event.lp_variant_id,
          event.creative_variant_id,
          event.ad_bundle_id,
          event.event_type,
          event.ts_ms,
          event.session_id,
          event.page_url,
          event.referrer,
          event.user_agent,
          event.ip_hash,
          event.meta_json
        )
    );

    await this.db.batch(statements);
  }

  /**
   * Resolve tenant ID from run ID
   *
   * @param runId - Run ID to lookup
   * @returns Tenant ID or null if not found
   */
  private async resolveTenantId(runId: string): Promise<string | null> {
    try {
      const result = await this.db
        .prepare(
          `SELECT p.tenant_id FROM runs r
           JOIN projects p ON r.project_id = p.id
           WHERE r.id = ?`
        )
        .bind(runId)
        .first<{ tenant_id: string }>();
      return result?.tenant_id || null;
    } catch {
      return null;
    }
  }

  /**
   * Resolve intent ID from LP variant ID
   *
   * @param lpVariantId - LP variant ID to lookup
   * @returns Intent ID or null if not found
   */
  private async resolveIntentId(lpVariantId: string): Promise<string | null> {
    try {
      const result = await this.db
        .prepare('SELECT intent_id FROM lp_variants WHERE id = ?')
        .bind(lpVariantId)
        .first<{ intent_id: string }>();
      return result?.intent_id || null;
    } catch {
      return null;
    }
  }

  /**
   * Hash IP address for privacy using SHA-256
   *
   * @param ip - IP address to hash
   * @returns Hashed IP (first 16 characters of hex)
   */
  private async hashIp(ip: string): Promise<string> {
    // Add a salt to prevent rainbow table attacks
    const salt = 'launch-test-system-ip-salt-v1';
    const data = new TextEncoder().encode(ip + salt);

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    // Return first 16 characters for storage efficiency
    return hashHex.substring(0, 16);
  }
}

/**
 * Create an event processor instance
 *
 * @param db - D1 database instance
 * @param config - Optional configuration overrides
 * @returns EventProcessor instance
 */
export function createEventProcessor(
  db: D1Database,
  config?: Partial<EventProcessorConfig>
): EventProcessor {
  return new EventProcessor(db, config);
}
