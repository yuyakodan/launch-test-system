/**
 * Launch Test System - Cloudflare Workers Entry Point
 * Hono framework based API server
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import type { Env, ScheduledEvent, MessageBatch, QueueMessage } from './types/env.js';
import { createEventRoutes } from './routes/events.js';
import { createAuthRoutes } from './routes/auth.js';
import { createTenantRoutes } from './routes/tenants.js';
import { createProjectRoutes } from './routes/projects.js';
import { createRunRoutes } from './routes/runs.js';
import { createIntentRoutes } from './routes/intents.js';
import { createDecisionRoutes } from './routes/decisions.js';

// Create Hono app with environment bindings
const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', logger());
app.use('*', prettyJSON());
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check endpoint
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    service: 'launch-test-system',
    version: '0.1.0',
    environment: c.env.ENVIRONMENT,
    timestamp: new Date().toISOString(),
  });
});

// API Routes
const api = new Hono<{ Bindings: Env }>();

// API health check
api.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    checks: {
      database: 'connected',
      storage: 'available',
      queue: 'active',
    },
  });
});

// D1 Database example endpoint
api.get('/db/status', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 as check_value').first();
    return c.json({
      status: 'ok',
      database: 'connected',
      result,
    });
  } catch (error) {
    return c.json(
      {
        status: 'error',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

// R2 Storage example endpoint
api.get('/storage/status', async (c) => {
  try {
    const list = await c.env.STORAGE.list({ limit: 1 });
    return c.json({
      status: 'ok',
      storage: 'connected',
      objectCount: list.objects.length,
      truncated: list.truncated,
    });
  } catch (error) {
    return c.json(
      {
        status: 'error',
        storage: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

// Queue example endpoint
api.post('/queue/send', async (c) => {
  try {
    const body = await c.req.json();
    await c.env.TASK_QUEUE.send({
      type: 'task',
      payload: body,
      timestamp: new Date().toISOString(),
    });
    return c.json({
      status: 'ok',
      message: 'Message sent to queue',
    });
  } catch (error) {
    return c.json(
      {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

// Mount Auth routes
// GET /api/me - Get current user
// POST /api/auth/logout - Logout
api.route('/', createAuthRoutes());

// Mount Tenant routes
// GET /api/tenant - Get current tenant
// PATCH /api/tenant - Update tenant
api.route('/tenant', createTenantRoutes());

// Mount Project routes
// GET /api/projects - List projects
// POST /api/projects - Create project
// GET /api/projects/:id - Get project
// PATCH /api/projects/:id - Update project
api.route('/projects', createProjectRoutes());

// Mount Run routes
// GET /api/runs - List runs
// POST /api/runs - Create run
// GET /api/runs/:id - Get run
// PATCH /api/runs/:id - Update run
// POST /api/runs/:id/design - Set run design
// POST /api/runs/:id/stop-dsl - Set stop DSL
// POST /api/runs/:id/launch - Launch run
// POST /api/runs/:id/pause - Pause run
api.route('/runs', createRunRoutes());

// Mount Intent routes
// GET /api/runs/:runId/intents - List intents for run
// POST /api/runs/:runId/intents - Create intent for run
// PATCH /api/intents/:id - Update intent
api.route('/', createIntentRoutes());

// Mount Decision routes
// POST /api/runs/:id/decide - Make decision
// GET /api/runs/:id/report - Get report
api.route('/', createDecisionRoutes());

// Mount API routes
app.route('/api', api);

// Mount event tracking routes
// POST /e - single event
// POST /e/batch - batch events
app.route('/e', createEventRoutes());

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      status: 'error',
      message: 'Not Found',
      path: c.req.path,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      status: 'error',
      message: err.message || 'Internal Server Error',
    },
    500
  );
});

// Export handlers for Cloudflare Workers
export default {
  /**
   * HTTP request handler
   */
  fetch: app.fetch,

  /**
   * Scheduled task handler (Cron Triggers)
   */
  async scheduled(event: ScheduledEvent, _env: Env, _ctx: ExecutionContext): Promise<void> {
    const cronPattern = event.cron;
    console.log(`Running scheduled task: ${cronPattern} at ${new Date().toISOString()}`);

    switch (cronPattern) {
      case '0 * * * *':
        // Hourly health check
        console.log('Executing hourly health check');
        break;

      case '0 0 * * *':
        // Daily cleanup
        console.log('Executing daily cleanup');
        break;

      case '*/15 * * * *':
        // Sync tasks every 15 minutes
        console.log('Executing task sync');
        break;

      default:
        console.log(`Unknown cron pattern: ${cronPattern}`);
    }
  },

  /**
   * Queue message handler
   */
  async queue(batch: MessageBatch<QueueMessage>, _env: Env): Promise<void> {
    console.log(`Processing ${batch.messages.length} messages`);

    for (const message of batch.messages) {
      try {
        console.log(`Processing message: ${JSON.stringify(message.body)}`);
        // Process message here
        message.ack();
      } catch (error) {
        console.error(`Failed to process message: ${error}`);
        message.retry();
      }
    }
  },
};
