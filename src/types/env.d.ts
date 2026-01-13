/**
 * Cloudflare Workers Environment Type Definitions
 * Defines bindings for D1, R2, Queues, and environment variables
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

// Re-export Cloudflare Workers types for convenience
declare global {
  /**
   * D1 Database interface
   */
  interface D1Database {
    prepare(query: string): D1PreparedStatement;
    dump(): Promise<ArrayBuffer>;
    batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
    exec(query: string): Promise<D1ExecResult>;
  }

  interface D1PreparedStatement {
    bind(...values: unknown[]): D1PreparedStatement;
    first<T = unknown>(colName?: string): Promise<T | null>;
    run<T = unknown>(): Promise<D1Result<T>>;
    all<T = unknown>(): Promise<D1Result<T>>;
    raw<T = unknown>(): Promise<T[]>;
  }

  interface D1Result<T = unknown> {
    results?: T[];
    success: boolean;
    error?: string;
    meta: {
      changed_db: boolean;
      changes: number;
      duration: number;
      last_row_id: number;
      rows_read: number;
      rows_written: number;
    };
  }

  interface D1ExecResult {
    count: number;
    duration: number;
  }

  /**
   * R2 Bucket interface
   */
  interface R2Bucket {
    head(key: string): Promise<R2Object | null>;
    get(key: string, options?: R2GetOptions): Promise<R2ObjectBody | null>;
    put(key: string, value: ReadableStream | ArrayBuffer | string, options?: R2PutOptions): Promise<R2Object>;
    delete(keys: string | string[]): Promise<void>;
    list(options?: R2ListOptions): Promise<R2Objects>;
  }

  interface R2Object {
    key: string;
    version: string;
    size: number;
    etag: string;
    httpEtag: string;
    checksums: R2Checksums;
    uploaded: Date;
    httpMetadata?: R2HTTPMetadata;
    customMetadata?: Record<string, string>;
  }

  interface R2ObjectBody extends R2Object {
    body: ReadableStream;
    bodyUsed: boolean;
    arrayBuffer(): Promise<ArrayBuffer>;
    text(): Promise<string>;
    json<T>(): Promise<T>;
    blob(): Promise<Blob>;
  }

  interface R2GetOptions {
    onlyIf?: R2Conditional;
    range?: R2Range;
  }

  interface R2PutOptions {
    httpMetadata?: R2HTTPMetadata;
    customMetadata?: Record<string, string>;
    md5?: ArrayBuffer | string;
    sha1?: ArrayBuffer | string;
    sha256?: ArrayBuffer | string;
    sha384?: ArrayBuffer | string;
    sha512?: ArrayBuffer | string;
  }

  interface R2ListOptions {
    limit?: number;
    prefix?: string;
    cursor?: string;
    delimiter?: string;
    include?: ('httpMetadata' | 'customMetadata')[];
  }

  interface R2Objects {
    objects: R2Object[];
    truncated: boolean;
    cursor?: string;
    delimitedPrefixes: string[];
  }

  interface R2Conditional {
    etagMatches?: string;
    etagDoesNotMatch?: string;
    uploadedBefore?: Date;
    uploadedAfter?: Date;
  }

  interface R2Range {
    offset?: number;
    length?: number;
    suffix?: number;
  }

  interface R2HTTPMetadata {
    contentType?: string;
    contentLanguage?: string;
    contentDisposition?: string;
    contentEncoding?: string;
    cacheControl?: string;
    cacheExpiry?: Date;
  }

  interface R2Checksums {
    md5?: ArrayBuffer;
    sha1?: ArrayBuffer;
    sha256?: ArrayBuffer;
    sha384?: ArrayBuffer;
    sha512?: ArrayBuffer;
  }

  /**
   * Queue interface
   */
  interface Queue<T = unknown> {
    send(message: T, options?: QueueSendOptions): Promise<void>;
    sendBatch(messages: Iterable<MessageSendRequest<T>>): Promise<void>;
  }

  interface QueueSendOptions {
    contentType?: 'json' | 'text' | 'bytes' | 'v8';
    delaySeconds?: number;
  }

  interface MessageSendRequest<T> {
    body: T;
    contentType?: 'json' | 'text' | 'bytes' | 'v8';
    delaySeconds?: number;
  }

  /**
   * Execution context
   */
  interface ExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
  }
}

export {};
