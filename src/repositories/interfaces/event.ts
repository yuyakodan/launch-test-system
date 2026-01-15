/**
 * Event Repository Interface
 * Defines contract for event storage and retrieval operations
 */

import type { Event, EventType } from '../../types/entities.js';
import type { IBaseRepository, PaginationParams, PaginatedResult } from './base.js';

/**
 * Input for creating a new event
 */
export interface CreateEventInput {
  id: string;
  tenantId: string;
  runId: string;
  intentId?: string | null;
  lpVariantId: string;
  creativeVariantId?: string | null;
  adBundleId?: string | null;
  eventType: EventType;
  tsMs: number;
  sessionId: string;
  pageUrl: string;
  referrer?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  metaJson?: string;
}

/**
 * Filter options for querying events
 */
export interface EventFilter {
  /** Filter by tenant ID */
  tenantId?: string;
  /** Filter by run ID */
  runId?: string;
  /** Filter by intent ID */
  intentId?: string;
  /** Filter by LP variant ID */
  lpVariantId?: string;
  /** Filter by creative variant ID */
  creativeVariantId?: string;
  /** Filter by ad bundle ID */
  adBundleId?: string;
  /** Filter by event type */
  eventType?: EventType;
  /** Filter by session ID */
  sessionId?: string;
  /** Filter events after this timestamp (inclusive) */
  fromTsMs?: number;
  /** Filter events before this timestamp (inclusive) */
  toTsMs?: number;
}

/**
 * Result of batch insert operation
 */
export interface BatchInsertResult {
  /** Number of events successfully inserted */
  ingested: number;
  /** Number of events skipped due to deduplication */
  deduped: number;
}

/**
 * Event aggregation by variant
 */
export interface EventAggregation {
  /** LP variant ID */
  lpVariantId: string;
  /** Intent ID */
  intentId: string | null;
  /** Creative variant ID */
  creativeVariantId: string | null;
  /** Ad bundle ID */
  adBundleId: string | null;
  /** Total pageviews */
  pageviews: number;
  /** Total CTA clicks */
  ctaClicks: number;
  /** Total form submissions */
  formSubmits: number;
  /** Total form successes (conversions) */
  formSuccesses: number;
  /** Unique sessions */
  uniqueSessions: number;
}

/**
 * Event Repository Interface
 * Extends base repository with event-specific operations
 */
export interface IEventRepository
  extends Omit<IBaseRepository<Event, CreateEventInput, never>, 'update'> {
  /**
   * Find events by filter with pagination
   */
  findByFilter(
    filter: EventFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Event>>;

  /**
   * Check if an event exists by ID (for deduplication)
   */
  existsById(eventId: string): Promise<boolean>;

  /**
   * Check multiple event IDs for existence (batch deduplication)
   * Returns set of existing event IDs
   */
  existsByIds(eventIds: string[]): Promise<Set<string>>;

  /**
   * Create multiple events in batch, skipping duplicates
   * Returns count of ingested and deduped events
   */
  createBatch(inputs: CreateEventInput[]): Promise<BatchInsertResult>;

  /**
   * Get aggregated event counts by variant for a run
   */
  getAggregationByRun(runId: string): Promise<EventAggregation[]>;

  /**
   * Get aggregated event counts by variant for a time range
   */
  getAggregationByTimeRange(
    runId: string,
    fromTsMs: number,
    toTsMs: number
  ): Promise<EventAggregation[]>;

  /**
   * Count events by type for a run
   */
  countByType(runId: string): Promise<Record<EventType, number>>;

  /**
   * Get unique session count for a run
   */
  countUniqueSessions(runId: string): Promise<number>;

  /**
   * Find events by session ID
   */
  findBySession(sessionId: string): Promise<Event[]>;

  /**
   * Delete old events before a timestamp (cleanup)
   */
  deleteOlderThan(tsMs: number): Promise<number>;
}
