/**
 * Event tracking type definitions
 * For first-party event collection via /e endpoint
 */

import type { EventType } from './entities.js';

/**
 * Protocol version for event tracking
 */
export const EVENT_PROTOCOL_VERSION = 1;

/**
 * Supported event types for tracking
 */
export const SUPPORTED_EVENT_TYPES: EventType[] = [
  'pageview',
  'cta_click',
  'form_submit',
  'form_success',
];

/**
 * Single event payload from client
 * All required fields must be present for valid event
 */
export interface EventPayload {
  /** Protocol version (must be 1) */
  v: number;

  /** Unique event ID for deduplication (client-generated UUID) */
  event_id: string;

  /** Unix timestamp in milliseconds when event occurred */
  ts_ms: number;

  /** Type of event */
  event_type: EventType;

  /** Session identifier (client-generated) */
  session_id: string;

  /** Run ID the event belongs to */
  run_id: string;

  /** LP variant ID being tracked */
  lp_variant_id: string;

  /** Full page URL where event occurred */
  page_url: string;

  /** Optional: Referrer URL */
  referrer?: string;

  /** Optional: User agent string */
  user_agent?: string;

  /** Optional: Additional metadata as JSON object */
  meta?: Record<string, unknown>;
}

/**
 * Batch event payload for multiple events
 */
export interface EventBatchPayload {
  /** Array of events to process */
  events: EventPayload[];
}

/**
 * Response for single event submission
 */
export interface EventResponse {
  /** Whether event was accepted */
  ok: boolean;

  /** Event ID that was processed */
  event_id: string;

  /** Optional error message if not ok */
  error?: string;
}

/**
 * Response for batch event submission
 */
export interface EventBatchResponse {
  /** Whether all events were accepted */
  ok: boolean;

  /** Number of events accepted */
  accepted: number;

  /** Number of events rejected (validation errors) */
  rejected: number;

  /** Number of events deduplicated (already existed) */
  deduplicated: number;

  /** Errors for specific events, keyed by event_id */
  errors?: Record<string, string>;
}

/**
 * Simplified batch response format per requirements spec
 * Used for POST /e/batch endpoint
 */
export interface EventIngestResponse {
  /** Whether operation succeeded */
  ok: boolean;

  /** Number of events successfully ingested */
  ingested: number;

  /** Number of events skipped due to deduplication */
  deduped: number;

  /** Optional error message */
  error?: string;
}

/**
 * Parsed UTM parameters from page URL
 */
export interface ParsedUtmParams {
  /** utm_source parameter */
  utm_source?: string;

  /** utm_medium parameter */
  utm_medium?: string;

  /** utm_campaign parameter */
  utm_campaign?: string;

  /** utm_term parameter */
  utm_term?: string;

  /** utm_content parameter */
  utm_content?: string;

  /** Custom: ad_bundle_id extracted from UTM */
  ad_bundle_id?: string;

  /** Custom: creative_variant_id extracted from UTM */
  creative_variant_id?: string;

  /** Custom: intent_id extracted from UTM */
  intent_id?: string;
}

/**
 * Internal event representation after processing
 * Includes server-side enrichments
 */
export interface ProcessedEvent {
  /** Original event ID */
  id: string;

  /** Resolved tenant ID */
  tenant_id: string;

  /** Run ID from payload */
  run_id: string;

  /** Intent ID (resolved from UTM or variant lookup) */
  intent_id: string | null;

  /** LP variant ID from payload */
  lp_variant_id: string;

  /** Creative variant ID (resolved from UTM) */
  creative_variant_id: string | null;

  /** Ad bundle ID (resolved from UTM) */
  ad_bundle_id: string | null;

  /** Event type */
  event_type: EventType;

  /** Original timestamp in milliseconds */
  ts_ms: number;

  /** Server-side received timestamp in milliseconds */
  received_at_ms: number;

  /** Session ID */
  session_id: string;

  /** Page URL */
  page_url: string;

  /** Referrer URL */
  referrer: string | null;

  /** User agent */
  user_agent: string | null;

  /** Hashed IP address for privacy */
  ip_hash: string | null;

  /** Additional metadata as JSON string */
  meta_json: string;
}

/**
 * Validation error for event payload
 */
export interface EventValidationError {
  /** Field that failed validation */
  field: string;

  /** Error message */
  message: string;

  /** Expected value or format */
  expected?: string;

  /** Actual value received */
  received?: unknown;
}

/**
 * Result of event validation
 */
export interface EventValidationResult {
  /** Whether event is valid */
  valid: boolean;

  /** Validation errors if not valid */
  errors: EventValidationError[];
}

/**
 * Configuration for event processing
 */
export interface EventProcessorConfig {
  /** Enable deduplication check */
  enableDeduplication: boolean;

  /** Deduplication window in milliseconds (default: 24 hours) */
  deduplicationWindowMs: number;

  /** Maximum events per batch */
  maxBatchSize: number;

  /** Maximum age of event timestamp in milliseconds */
  maxEventAgeMs: number;

  /** Minimum age of event timestamp (reject future events) */
  minEventAgeMs: number;
}

/**
 * Default event processor configuration
 */
export const DEFAULT_EVENT_PROCESSOR_CONFIG: EventProcessorConfig = {
  enableDeduplication: true,
  deduplicationWindowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxBatchSize: 100,
  maxEventAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  minEventAgeMs: -5 * 60 * 1000, // 5 minutes into future (clock skew tolerance)
};
