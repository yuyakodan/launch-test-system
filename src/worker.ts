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
import { createVariantRoutes } from './routes/variants.js';
import { createQaRoutes } from './routes/qa.js';
import {
  createStopConditionRoutes,
  createInternalStopConditionRoutes,
} from './routes/stop-condition.js';
import { createGenerationRoutes } from './routes/generation.js';
import { createReportRoutes } from './routes/report.js';
import { createApprovalRoutes, createRunApprovalRoutes } from './routes/approvals.js';
import { createPublishRoutes } from './routes/publish.js';
import { createNextRunRoutes } from './routes/next-run.js';
import { createJobRoutes } from './routes/jobs.js';
import { createNotificationRoutes } from './routes/notifications.js';
import { createIncidentRoutes } from './routes/incidents.js';
import { createMetaRoutes, createInternalMetaRoutes } from './routes/meta.js';
import { createManualRoutes, createRunMetricsRoutes } from './routes/manual.js';
import { createFeatureFlagsRoutes } from './routes/feature-flags.js';

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
// GET /api/me/notifications - Get notification settings
// PATCH /api/me/notifications - Update notification settings
// GET /api/me/api-keys - List API keys
// POST /api/me/api-keys - Generate new API key
// DELETE /api/me/api-keys/:id - Revoke API key
// GET /api/me/webhooks - Get webhook settings
// PATCH /api/me/webhooks - Update webhook settings
api.route('/', createAuthRoutes());

// Mount Tenant routes
// GET /api/tenant - Get current tenant
// PATCH /api/tenant - Update tenant
api.route('/tenant', createTenantRoutes());

// Mount Feature Flags routes (under /api/tenant/flags)
// GET /api/tenant/flags - Get all feature flags
// GET /api/tenant/flags/:key - Get specific flag
// PATCH /api/tenant/flags/:key - Update flag
// DELETE /api/tenant/flags/:key - Reset flag to default
// GET /api/tenant/flags/migration/status - Get migration status
api.route('/tenant/flags', createFeatureFlagsRoutes());

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
// POST /api/runs/:id/stop - Stop run (mark completed)
api.route('/runs', createRunRoutes());

// Mount Intent routes
// GET /api/runs/:runId/intents - List intents for run
// POST /api/runs/:runId/intents - Create intent for run
// PATCH /api/intents/:id - Update intent
// GET /api/intents/:id/metrics - Get intent metrics
// POST /api/intents/:id/metrics - Update intent metrics
api.route('/', createIntentRoutes());

// Mount Decision routes
// POST /api/runs/:id/decide - Make decision
// GET /api/runs/:id/report - Get report
api.route('/', createDecisionRoutes());

// Mount Variant routes
// GET /api/intents/:intentId/lp-variants - List LP variants
// POST /api/intents/:intentId/lp-variants - Create LP variant
// GET /api/intents/:intentId/creative-variants - List creative variants
// POST /api/intents/:intentId/creative-variants - Create creative variant
// GET /api/intents/:intentId/ad-copies - List ad copies
// POST /api/intents/:intentId/ad-copies - Create ad copy
// PATCH /api/ad-copies/:id - Update ad copy
api.route('/', createVariantRoutes());

// Mount QA routes
// POST /api/qa/check - Check content for NG expressions
// POST /api/qa/smoke-test - Submit smoke test job
// GET /api/qa/smoke-test/:jobId - Get smoke test result
// POST /api/qa/smoke-test/:jobId/result - Receive smoke test result (webhook)
api.route('/qa', createQaRoutes());

// Mount Stop Condition routes (Run-scoped)
// GET /api/runs/:runId/stop-rules - Get stop rules for a run
api.route('/', createStopConditionRoutes());

// Mount Internal Stop Condition routes
// POST /api/internal/stop-rules/evaluate - Evaluate stop rules (Cron/Queue trigger)
api.route('/internal/stop-rules', createInternalStopConditionRoutes());

// Mount Generation routes
// POST /api/runs/:runId/generate - Submit generation job
// GET /api/runs/:runId/jobs - List generation jobs
// POST /api/jobs/:jobId/retry - Retry failed job
api.route('/', createGenerationRoutes());

// Mount Report routes
// GET /api/runs/:runId/report - Get comprehensive report for a run
// POST /api/internal/report/generate - Generate report job (internal)
// GET /api/internal/report/job/:jobId - Get report job status
api.route('/', createReportRoutes());

// Mount Approval routes
// POST /api/approvals - Create submitted approval (target_hash required)
// POST /api/approvals/:approvalId/approve - Approve
// POST /api/approvals/:approvalId/reject - Reject
api.route('/approvals', createApprovalRoutes());

// Mount Run Approval routes
// POST /api/runs/:runId/submit-review - Submit run for review
// GET /api/runs/:runId/approvals - Get run approvals list
api.route('/runs', createRunApprovalRoutes());

// Mount Publish routes
// POST /api/runs/:runId/publish - Publish run (generate URLs, UTMs, snapshots, ad bundles)
// POST /api/runs/:runId/rollback - Rollback a published deployment
// GET /api/runs/:runId/deployment - Get deployment information
api.route('/', createPublishRoutes());

// Mount Next Run routes
// POST /api/runs/:runId/next-run - Generate next run based on fixed/explore settings
// POST /api/runs/:runId/fixed-granularity - Set fixed granularity configuration
// GET /api/runs/:runId/fixed-granularity - Get current fixed granularity configuration
api.route('/runs', createNextRunRoutes());

// Mount Job routes
// GET /api/jobs - List jobs
// GET /api/jobs/stats - Get job statistics
// GET /api/jobs/:id - Get job by ID
// POST /api/jobs/:id/retry - Retry a failed job
// POST /api/jobs/:id/cancel - Cancel a queued/running job
api.route('/jobs', createJobRoutes());

// Mount Notification routes
// GET /api/notifications - List notifications
// GET /api/notifications/stats - Get notification statistics
// GET /api/notifications/:id - Get notification by ID
// POST /api/notifications/:id/resend - Resend a notification
api.route('/notifications', createNotificationRoutes());

// Mount Incident routes
// GET /api/incidents - List incidents
// POST /api/incidents - Create incident
// GET /api/incidents/:id - Get incident
// PATCH /api/incidents/:id - Update incident
// POST /api/incidents/:id/resolve - Resolve incident
api.route('/incidents', createIncidentRoutes());

// Mount Meta routes
// POST /api/meta/connect/start - Start OAuth flow
// POST /api/meta/connect/callback - OAuth callback
// GET /api/meta/connections - List connections
// DELETE /api/meta/connections/:id - Disconnect
api.route('/meta', createMetaRoutes());

// Mount Internal Meta routes
// POST /api/internal/insights/sync - Sync insights (Cron trigger)
api.route('/internal', createInternalMetaRoutes());

// Mount Manual Mode routes
// POST /api/manual/ad-bundles/register - Register manual ad bundle mapping
// POST /api/manual/metrics/import - Import metrics from CSV
api.route('/manual', createManualRoutes());

// Mount Run Metrics routes (under /runs/:runId/metrics)
// GET /api/runs/:runId/metrics - Get combined metrics for a run
api.route('/runs', createRunMetricsRoutes());

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
