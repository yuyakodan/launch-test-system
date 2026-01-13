/**
 * Event Routes
 * First-party event tracking endpoints
 *
 * POST /e - Single event submission
 * POST /e/batch - Batch event submission
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../types/env.js';
import type { EventPayload, EventBatchPayload } from '../types/events.js';
import { createEventProcessor } from '../services/events/index.js';

/**
 * Create event routes with proper CORS configuration
 * Events can come from any LP domain, so CORS must be permissive
 */
export function createEventRoutes() {
  const events = new Hono<{ Bindings: Env }>();

  // CORS configuration for event endpoints
  // Allow any origin since LPs are hosted on various domains
  events.use(
    '*',
    cors({
      origin: '*',
      allowMethods: ['POST', 'OPTIONS'],
      allowHeaders: ['Content-Type'],
      maxAge: 86400, // 24 hours
    })
  );

  /**
   * POST /e - Submit a single event
   *
   * Request body: EventPayload
   * Response: EventResponse
   *
   * Example:
   * ```json
   * {
   *   "v": 1,
   *   "event_id": "unique-uuid",
   *   "ts_ms": 1699999999999,
   *   "event_type": "pageview",
   *   "session_id": "session-uuid",
   *   "run_id": "01HXXXXXXXXXXXXXXX",
   *   "lp_variant_id": "01HXXXXXXXXXXXXXXX",
   *   "page_url": "https://example.com/lp?utm_source=meta"
   * }
   * ```
   */
  events.post('/', async (c) => {
    try {
      // Parse request body
      const payload = await c.req.json<EventPayload>();

      // Get client IP from CF headers or connection
      const clientIp = getClientIp(c.req.raw);

      // Create processor and process event
      const processor = createEventProcessor(c.env.DB);
      const result = await processor.processEvent(payload, clientIp);

      // Return appropriate status code
      if (result.ok) {
        return c.json(result, 200);
      } else {
        return c.json(result, 400);
      }
    } catch (error) {
      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return c.json(
          {
            ok: false,
            event_id: 'unknown',
            error: 'Invalid JSON payload',
          },
          400
        );
      }

      // Log unexpected errors
      console.error('Event processing error:', error);

      return c.json(
        {
          ok: false,
          event_id: 'unknown',
          error: 'Internal server error',
        },
        500
      );
    }
  });

  /**
   * POST /e/batch - Submit multiple events
   *
   * Request body: EventBatchPayload
   * Response: EventBatchResponse
   *
   * Example:
   * ```json
   * {
   *   "events": [
   *     { "v": 1, "event_id": "uuid-1", ... },
   *     { "v": 1, "event_id": "uuid-2", ... }
   *   ]
   * }
   * ```
   */
  events.post('/batch', async (c) => {
    try {
      // Parse request body
      const payload = await c.req.json<EventBatchPayload>();

      // Validate events array exists
      if (!payload.events || !Array.isArray(payload.events)) {
        return c.json(
          {
            ok: false,
            accepted: 0,
            rejected: 0,
            deduplicated: 0,
            errors: { batch: 'events array is required' },
          },
          400
        );
      }

      // Check for empty batch
      if (payload.events.length === 0) {
        return c.json(
          {
            ok: true,
            accepted: 0,
            rejected: 0,
            deduplicated: 0,
          },
          200
        );
      }

      // Get client IP from CF headers or connection
      const clientIp = getClientIp(c.req.raw);

      // Create processor and process batch
      const processor = createEventProcessor(c.env.DB);
      const result = await processor.processBatch(payload, clientIp);

      // Return 200 even if some events failed (partial success)
      return c.json(result, 200);
    } catch (error) {
      // Handle JSON parse errors
      if (error instanceof SyntaxError) {
        return c.json(
          {
            ok: false,
            accepted: 0,
            rejected: 0,
            deduplicated: 0,
            errors: { batch: 'Invalid JSON payload' },
          },
          400
        );
      }

      // Log unexpected errors
      console.error('Batch event processing error:', error);

      return c.json(
        {
          ok: false,
          accepted: 0,
          rejected: 0,
          deduplicated: 0,
          errors: { batch: 'Internal server error' },
        },
        500
      );
    }
  });

  return events;
}

/**
 * Extract client IP address from request
 * Prioritizes Cloudflare headers, falls back to standard headers
 *
 * @param request - Raw Request object
 * @returns Client IP or null
 */
function getClientIp(request: Request): string | null {
  // Cloudflare provides the connecting IP in this header
  const cfConnectingIp = request.headers.get('CF-Connecting-IP');
  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Standard forwarded header
  const xForwardedFor = request.headers.get('X-Forwarded-For');
  if (xForwardedFor) {
    // Take the first IP in the chain (original client)
    return xForwardedFor.split(',')[0].trim();
  }

  // X-Real-IP header (some proxies)
  const xRealIp = request.headers.get('X-Real-IP');
  if (xRealIp) {
    return xRealIp;
  }

  return null;
}

/**
 * Export default routes
 */
export const eventRoutes = createEventRoutes();
