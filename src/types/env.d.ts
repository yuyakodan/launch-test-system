/**
 * Cloudflare Workers Environment Type Definitions
 * Defines bindings for D1, R2, Queues, and environment variables
 *
 * Note: D1Database, D1PreparedStatement, D1Result, R2Bucket, and other
 * Cloudflare types are provided by @cloudflare/workers-types
 */

/**
 * Environment bindings interface
 * Maps to wrangler.toml configuration
 */
export interface Env {
  // Environment variables
  ENVIRONMENT: 'development' | 'staging' | 'production';

  // D1 Database binding
  DB: D1Database;

  // R2 Storage binding
  STORAGE: R2Bucket;

  // Queue binding
  TASK_QUEUE: Queue<QueueMessage>;

  // Optional feature flags
  DB_TYPE?: string;
  DB_MIGRATION_PHASE?: string;

  // LP Publishing
  LP_BASE_URL?: string;
}

/**
 * Queue message structure
 */
export interface QueueMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

/**
 * Scheduled event for Cron Triggers
 */
export interface ScheduledEvent {
  cron: string;
  scheduledTime: number;
}

/**
 * Message batch for Queue consumers
 */
export interface MessageBatch<T> {
  queue: string;
  messages: Message<T>[];
}

/**
 * Individual queue message
 */
export interface Message<T> {
  id: string;
  timestamp: Date;
  body: T;
  ack(): void;
  retry(): void;
}

export {};
