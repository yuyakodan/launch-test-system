/**
 * Event Routes Service
 * Creates Hono routes for event tracking endpoints
 * POST /e - Single event
 * POST /e/batch - Batch events
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { D1Database } from '@cloudflare/workers-types';
import type {
  EventPayload,
  EventIngestResponse,
  EventProcessorConfig,
} from '../../types/events.js';
import { EventProcessor } from './event-processor.js';
import { DEFAULT_EVENT_PROCESSOR_CONFIG } from '../../types/events.js';

/**
 * Configuration for event routes
 */
export interface EventRoutesConfig {
  /** Event processor configuration */
  processorConfig?: Partial<EventProcessorConfig>;

  /** Allowed origins for CORS (defaults to all) */
  allowedOrigins?: string[];

  /** IP header name (e.g., 'cf-connecting-ip' for Cloudflare) */
  ipHeaderName?: string;

  /** Salt for IP hashing (should be set from environment) */
  ipHashSalt?: string;
}

/**
 * Default configuration for event routes
 */
const DEFAULT_ROUTES_CONFIG: Required<EventRoutesConfig> = {
  processorConfig: {},
  allowedOrigins: ['*'],
  ipHeaderName: 'cf-connecting-ip',
  ipHashSalt: 'launch-test-system-ip-salt-v1',
};

/**
 * Environment bindings for event routes
 */
export interface EventRoutesEnv {
  DB: D1Database;
  IP_HASH_SALT?: string;
  ALLOWED_ORIGINS?: string;
}

/**
 * Create Hono app with event tracking routes
 *
 * @param db - D1 database instance
 * @param config - Optional configuration
 * @returns Hono app with /e and /e/batch routes
 */
export function createEventRoutes(
  db: D1Database,
  config: EventRoutesConfig = {}
): Hono {
  const mergedConfig = {
    ...DEFAULT_ROUTES_CONFIG,
    ...config,
    processorConfig: {
      ...DEFAULT_EVENT_PROCESSOR_CONFIG,
      ...config.processorConfig,
    },
  };

  const app = new Hono();

  // Configure CORS
  app.use(
    '*',
    cors({
      origin: mergedConfig.allowedOrigins,
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400,
    })
  );

  // Create event processor
  const processor = new EventProcessor(db, mergedConfig.processorConfig);

  /**
   * POST /e - Single event submission
   */
  app.post('/e', async (c) => {
    try {
      const payload = await c.req.json<EventPayload>();
      const clientIp = c.req.header(mergedConfig.ipHeaderName) ?? null;

      const result = await processor.processEvent(payload, clientIp);

      // Convert to simple response format
      const response: EventIngestResponse = {
        ok: result.ok,
        ingested: result.ok ? 1 : 0,
        deduped: 0,
        error: result.error,
      };

      return c.json(response, result.ok ? 200 : 400);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      const response: EventIngestResponse = {
        ok: false,
        ingested: 0,
        deduped: 0,
        error: `Invalid request: ${message}`,
      };

      return c.json(response, 400);
    }
  });

  /**
   * POST /e/batch - Batch event submission
   */
  app.post('/e/batch', async (c) => {
    try {
      const body = await c.req.json<{ v?: number; events: EventPayload[] }>();
      const clientIp = c.req.header(mergedConfig.ipHeaderName) ?? null;

      // Validate batch structure
      if (!body.events || !Array.isArray(body.events)) {
        const response: EventIngestResponse = {
          ok: false,
          ingested: 0,
          deduped: 0,
          error: 'Missing or invalid events array',
        };
        return c.json(response, 400);
      }

      const result = await processor.processBatch({ events: body.events }, clientIp);

      // Convert to simplified response format
      const response: EventIngestResponse = {
        ok: result.ok,
        ingested: result.accepted,
        deduped: result.deduplicated,
        error:
          result.rejected > 0
            ? `${result.rejected} events rejected due to validation errors`
            : undefined,
      };

      return c.json(response, result.ok ? 200 : 207);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';

      const response: EventIngestResponse = {
        ok: false,
        ingested: 0,
        deduped: 0,
        error: `Invalid request: ${message}`,
      };

      return c.json(response, 400);
    }
  });

  /**
   * Health check endpoint
   */
  app.get('/e/health', (c) => {
    return c.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

/**
 * Create event routes from environment bindings
 * Useful for Cloudflare Workers integration
 *
 * @param env - Environment bindings with DB and optional config
 * @returns Hono app with event routes
 */
export function createEventRoutesFromEnv(env: EventRoutesEnv): Hono {
  const allowedOrigins = env.ALLOWED_ORIGINS
    ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['*'];

  return createEventRoutes(env.DB, {
    allowedOrigins,
    ipHashSalt: env.IP_HASH_SALT,
  });
}
