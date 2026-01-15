/**
 * D1 Event Repository Implementation
 * Provides event storage with deduplication support
 */

import type { D1Database } from '@cloudflare/workers-types';
import { D1Executor, select, insert, count } from '../../lib/db/index.js';
import type { Event, EventType } from '../../types/entities.js';
import type {
  IEventRepository,
  CreateEventInput,
  EventFilter,
  BatchInsertResult,
  EventAggregation,
} from '../interfaces/event.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * D1 Event Repository
 * Implements event storage with optimized batch operations
 */
export class D1EventRepository implements IEventRepository {
  private readonly executor: D1Executor;
  private readonly db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
    this.executor = new D1Executor(db);
  }

  /**
   * Convert database row to Event entity
   */
  private rowToEntity(row: Record<string, unknown>): Event {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      runId: row.run_id as string,
      intentId: row.intent_id as string | null,
      lpVariantId: row.lp_variant_id as string,
      creativeVariantId: row.creative_variant_id as string | null,
      adBundleId: row.ad_bundle_id as string | null,
      eventType: row.event_type as EventType,
      tsMs: row.ts_ms as number,
      sessionId: row.session_id as string,
      pageUrl: row.page_url as string,
      referrer: row.referrer as string | null,
      userAgent: row.user_agent as string | null,
      ipHash: row.ip_hash as string | null,
      metaJson: row.meta_json as string,
    };
  }

  /**
   * Find event by ID
   */
  async findById(id: string): Promise<Event | null> {
    const builder = select('events').where('id', '=', id);
    const row = await this.executor.first<Record<string, unknown>>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all events with pagination
   */
  async findAll(params?: PaginationParams): Promise<PaginatedResult<Event>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const total = await this.count();

    const builder = select('events')
      .orderBy('ts_ms', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<Record<string, unknown>>(builder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Find events by filter with pagination
   */
  async findByFilter(
    filter: EventFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Event>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Build WHERE conditions
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (filter.tenantId) {
      conditions.push('tenant_id = ?');
      bindings.push(filter.tenantId);
    }
    if (filter.runId) {
      conditions.push('run_id = ?');
      bindings.push(filter.runId);
    }
    if (filter.intentId) {
      conditions.push('intent_id = ?');
      bindings.push(filter.intentId);
    }
    if (filter.lpVariantId) {
      conditions.push('lp_variant_id = ?');
      bindings.push(filter.lpVariantId);
    }
    if (filter.creativeVariantId) {
      conditions.push('creative_variant_id = ?');
      bindings.push(filter.creativeVariantId);
    }
    if (filter.adBundleId) {
      conditions.push('ad_bundle_id = ?');
      bindings.push(filter.adBundleId);
    }
    if (filter.eventType) {
      conditions.push('event_type = ?');
      bindings.push(filter.eventType);
    }
    if (filter.sessionId) {
      conditions.push('session_id = ?');
      bindings.push(filter.sessionId);
    }
    if (filter.fromTsMs !== undefined) {
      conditions.push('ts_ms >= ?');
      bindings.push(filter.fromTsMs);
    }
    if (filter.toTsMs !== undefined) {
      conditions.push('ts_ms <= ?');
      bindings.push(filter.toTsMs);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Get total count
    const countQuery = `SELECT COUNT(*) as cnt FROM events ${whereClause}`;
    const countResult = await this.db
      .prepare(countQuery)
      .bind(...bindings)
      .first<{ cnt: number }>();
    const total = countResult?.cnt ?? 0;

    // Get paginated results
    const selectQuery = `
      SELECT * FROM events
      ${whereClause}
      ORDER BY ts_ms DESC
      LIMIT ? OFFSET ?
    `;
    const results = await this.db
      .prepare(selectQuery)
      .bind(...bindings, limit, offset)
      .all<Record<string, unknown>>();

    const items = results.results.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  /**
   * Create a single event
   */
  async create(input: CreateEventInput): Promise<Event> {
    const builder = insert('events').values({
      id: input.id,
      tenant_id: input.tenantId,
      run_id: input.runId,
      intent_id: input.intentId ?? null,
      lp_variant_id: input.lpVariantId,
      creative_variant_id: input.creativeVariantId ?? null,
      ad_bundle_id: input.adBundleId ?? null,
      event_type: input.eventType,
      ts_ms: input.tsMs,
      session_id: input.sessionId,
      page_url: input.pageUrl,
      referrer: input.referrer ?? null,
      user_agent: input.userAgent ?? null,
      ip_hash: input.ipHash ?? null,
      meta_json: input.metaJson ?? '{}',
    });

    await this.executor.insert(builder);

    const created = await this.findById(input.id);
    if (!created) {
      throw new Error('Failed to create event');
    }

    return created;
  }

  /**
   * Delete an event by ID
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    await this.db.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
    return true;
  }

  /**
   * Check if event exists
   */
  async exists(id: string): Promise<boolean> {
    return this.existsById(id);
  }

  /**
   * Count total events
   */
  async count(): Promise<number> {
    const builder = count('events');
    return this.executor.count(builder);
  }

  /**
   * Check if event exists by ID (optimized for deduplication)
   */
  async existsById(eventId: string): Promise<boolean> {
    const result = await this.db
      .prepare('SELECT 1 FROM events WHERE id = ? LIMIT 1')
      .bind(eventId)
      .first();
    return result !== null;
  }

  /**
   * Check multiple event IDs for existence (batch deduplication)
   */
  async existsByIds(eventIds: string[]): Promise<Set<string>> {
    const existing = new Set<string>();

    if (eventIds.length === 0) {
      return existing;
    }

    // Build IN clause with placeholders
    const placeholders = eventIds.map(() => '?').join(', ');
    const results = await this.db
      .prepare(`SELECT id FROM events WHERE id IN (${placeholders})`)
      .bind(...eventIds)
      .all<{ id: string }>();

    for (const row of results.results) {
      existing.add(row.id);
    }

    return existing;
  }

  /**
   * Create multiple events in batch with deduplication
   */
  async createBatch(inputs: CreateEventInput[]): Promise<BatchInsertResult> {
    if (inputs.length === 0) {
      return { ingested: 0, deduped: 0 };
    }

    // Check for existing IDs
    const inputIds = inputs.map((e) => e.id);
    const existingIds = await this.existsByIds(inputIds);

    // Filter out duplicates
    const newInputs = inputs.filter((e) => !existingIds.has(e.id));
    const deduped = inputs.length - newInputs.length;

    if (newInputs.length === 0) {
      return { ingested: 0, deduped };
    }

    // Batch insert using D1 batch API
    const statements = newInputs.map((input) =>
      this.db
        .prepare(
          `INSERT INTO events (
            id, tenant_id, run_id, intent_id, lp_variant_id,
            creative_variant_id, ad_bundle_id, event_type, ts_ms,
            session_id, page_url, referrer, user_agent, ip_hash, meta_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          input.id,
          input.tenantId,
          input.runId,
          input.intentId ?? null,
          input.lpVariantId,
          input.creativeVariantId ?? null,
          input.adBundleId ?? null,
          input.eventType,
          input.tsMs,
          input.sessionId,
          input.pageUrl,
          input.referrer ?? null,
          input.userAgent ?? null,
          input.ipHash ?? null,
          input.metaJson ?? '{}'
        )
    );

    await this.db.batch(statements);

    return {
      ingested: newInputs.length,
      deduped,
    };
  }

  /**
   * Get aggregated event counts by variant for a run
   */
  async getAggregationByRun(runId: string): Promise<EventAggregation[]> {
    const query = `
      SELECT
        lp_variant_id,
        intent_id,
        creative_variant_id,
        ad_bundle_id,
        SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) as pageviews,
        SUM(CASE WHEN event_type = 'cta_click' THEN 1 ELSE 0 END) as cta_clicks,
        SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) as form_submits,
        SUM(CASE WHEN event_type = 'form_success' THEN 1 ELSE 0 END) as form_successes,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM events
      WHERE run_id = ?
      GROUP BY lp_variant_id, intent_id, creative_variant_id, ad_bundle_id
    `;

    const results = await this.db
      .prepare(query)
      .bind(runId)
      .all<{
        lp_variant_id: string;
        intent_id: string | null;
        creative_variant_id: string | null;
        ad_bundle_id: string | null;
        pageviews: number;
        cta_clicks: number;
        form_submits: number;
        form_successes: number;
        unique_sessions: number;
      }>();

    return results.results.map((row) => ({
      lpVariantId: row.lp_variant_id,
      intentId: row.intent_id,
      creativeVariantId: row.creative_variant_id,
      adBundleId: row.ad_bundle_id,
      pageviews: row.pageviews,
      ctaClicks: row.cta_clicks,
      formSubmits: row.form_submits,
      formSuccesses: row.form_successes,
      uniqueSessions: row.unique_sessions,
    }));
  }

  /**
   * Get aggregated event counts by variant for a time range
   */
  async getAggregationByTimeRange(
    runId: string,
    fromTsMs: number,
    toTsMs: number
  ): Promise<EventAggregation[]> {
    const query = `
      SELECT
        lp_variant_id,
        intent_id,
        creative_variant_id,
        ad_bundle_id,
        SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) as pageviews,
        SUM(CASE WHEN event_type = 'cta_click' THEN 1 ELSE 0 END) as cta_clicks,
        SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) as form_submits,
        SUM(CASE WHEN event_type = 'form_success' THEN 1 ELSE 0 END) as form_successes,
        COUNT(DISTINCT session_id) as unique_sessions
      FROM events
      WHERE run_id = ? AND ts_ms >= ? AND ts_ms <= ?
      GROUP BY lp_variant_id, intent_id, creative_variant_id, ad_bundle_id
    `;

    const results = await this.db
      .prepare(query)
      .bind(runId, fromTsMs, toTsMs)
      .all<{
        lp_variant_id: string;
        intent_id: string | null;
        creative_variant_id: string | null;
        ad_bundle_id: string | null;
        pageviews: number;
        cta_clicks: number;
        form_submits: number;
        form_successes: number;
        unique_sessions: number;
      }>();

    return results.results.map((row) => ({
      lpVariantId: row.lp_variant_id,
      intentId: row.intent_id,
      creativeVariantId: row.creative_variant_id,
      adBundleId: row.ad_bundle_id,
      pageviews: row.pageviews,
      ctaClicks: row.cta_clicks,
      formSubmits: row.form_submits,
      formSuccesses: row.form_successes,
      uniqueSessions: row.unique_sessions,
    }));
  }

  /**
   * Count events by type for a run
   */
  async countByType(runId: string): Promise<Record<EventType, number>> {
    const query = `
      SELECT
        event_type,
        COUNT(*) as cnt
      FROM events
      WHERE run_id = ?
      GROUP BY event_type
    `;

    const results = await this.db
      .prepare(query)
      .bind(runId)
      .all<{ event_type: EventType; cnt: number }>();

    const counts: Record<EventType, number> = {
      pageview: 0,
      cta_click: 0,
      form_submit: 0,
      form_success: 0,
    };

    for (const row of results.results) {
      counts[row.event_type] = row.cnt;
    }

    return counts;
  }

  /**
   * Get unique session count for a run
   */
  async countUniqueSessions(runId: string): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(DISTINCT session_id) as cnt FROM events WHERE run_id = ?')
      .bind(runId)
      .first<{ cnt: number }>();

    return result?.cnt ?? 0;
  }

  /**
   * Find events by session ID
   */
  async findBySession(sessionId: string): Promise<Event[]> {
    const results = await this.db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts_ms ASC')
      .bind(sessionId)
      .all<Record<string, unknown>>();

    return results.results.map((row) => this.rowToEntity(row));
  }

  /**
   * Delete old events before a timestamp (cleanup)
   */
  async deleteOlderThan(tsMs: number): Promise<number> {
    const result = await this.db
      .prepare('DELETE FROM events WHERE ts_ms < ?')
      .bind(tsMs)
      .run();

    return result.meta.changes ?? 0;
  }
}
