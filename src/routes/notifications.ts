/**
 * Notifications Routes
 * Handles notification management endpoints
 *
 * GET /notifications - List notifications
 * GET /notifications/:id - Get notification by ID
 * POST /notifications/:id/resend - Resend a notification
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type { NotificationChannel, NotificationStatus } from '../types/entities.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { AuditService } from '../services/audit.js';
import { createNotificationService } from '../services/notification.js';

type NotificationEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * Create notification routes
 */
export function createNotificationRoutes() {
  const notifications = new Hono<NotificationEnv>();

  // Apply auth middleware to all routes
  notifications.use('*', authMiddleware());

  /**
   * GET /notifications - List notifications
   *
   * Query parameters:
   * - channel: string (optional filter)
   * - eventType: string (optional filter)
   * - status: string (optional filter)
   * - limit: number (default: 100)
   * - offset: number (default: 0)
   */
  notifications.get('/', requirePermission('notification', 'read'), async (c) => {
    const authContext = c.get('auth');
    const notificationService = createNotificationService(c.env.DB);

    // Parse query parameters
    const channel = c.req.query('channel') as NotificationChannel | undefined;
    const eventType = c.req.query('eventType');
    const status = c.req.query('status') as NotificationStatus | undefined;
    const limit = Math.min(parseInt(c.req.query('limit') ?? '100', 10), 100);
    const offset = parseInt(c.req.query('offset') ?? '0', 10);

    const result = await notificationService.listNotificationsWithFilter(
      {
        tenantId: authContext.tenantId,
        channel: channel ?? undefined,
        eventType: eventType ?? undefined,
        status: status ?? undefined,
      },
      { limit, offset }
    );

    return c.json({
      status: 'ok',
      data: {
        items: result.items.map((notification) => ({
          id: notification.id,
          tenantId: notification.tenantId,
          channel: notification.channel,
          eventType: notification.eventType,
          status: notification.status,
          sentAt: notification.sentAt,
          createdAt: notification.createdAt,
        })),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        hasMore: result.hasMore,
      },
    });
  });

  /**
   * GET /notifications/stats - Get notification statistics
   */
  notifications.get('/stats', requirePermission('notification', 'read'), async (c) => {
    const authContext = c.get('auth');
    const notificationService = createNotificationService(c.env.DB);

    const stats = await notificationService.getStats(authContext.tenantId);

    return c.json({
      status: 'ok',
      data: stats,
    });
  });

  /**
   * GET /notifications/:id - Get a notification by ID
   */
  notifications.get('/:id', requirePermission('notification', 'read'), async (c) => {
    const authContext = c.get('auth');
    const notificationService = createNotificationService(c.env.DB);
    const notificationId = c.req.param('id');

    const notification = await notificationService.getNotification(notificationId);
    if (!notification) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Notification not found',
        },
        404
      );
    }

    // Verify notification belongs to tenant
    if (notification.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Notification not found',
        },
        404
      );
    }

    // Get payload as parsed object
    const payload = notificationService.getNotificationPayload(notification);

    return c.json({
      status: 'ok',
      data: {
        id: notification.id,
        tenantId: notification.tenantId,
        channel: notification.channel,
        eventType: notification.eventType,
        payload,
        status: notification.status,
        sentAt: notification.sentAt,
        createdAt: notification.createdAt,
      },
    });
  });

  /**
   * POST /notifications/:id/resend - Resend a notification
   */
  notifications.post('/:id/resend', requirePermission('notification', 'update'), async (c) => {
    const authContext = c.get('auth');
    const notificationService = createNotificationService(c.env.DB);
    const notificationId = c.req.param('id');

    const notification = await notificationService.getNotification(notificationId);
    if (!notification) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Notification not found',
        },
        404
      );
    }

    // Verify notification belongs to tenant
    if (notification.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Notification not found',
        },
        404
      );
    }

    // Create a new pending notification with the same payload
    const newNotification = await notificationService.resendNotification(notificationId);
    if (!newNotification) {
      return c.json(
        {
          status: 'error',
          error: 'resend_failed',
          message: 'Failed to resend notification',
        },
        500
      );
    }

    // Record in audit log
    const auditService = new AuditService(c.env.DB);
    await auditService.log({
      tenantId: authContext.tenantId,
      actorUserId: authContext.userId,
      action: 'resend',
      targetType: 'notification',
      targetId: notificationId,
      before: {
        originalId: notification.id,
        status: notification.status,
      },
      after: {
        newId: newNotification.id,
        status: newNotification.status,
      },
      requestId: authContext.requestId,
      ipHash: c.req.header('CF-Connecting-IP') ?? undefined,
      userAgent: c.req.header('User-Agent') ?? undefined,
    });

    return c.json({
      status: 'ok',
      data: {
        originalId: notification.id,
        newNotification: {
          id: newNotification.id,
          tenantId: newNotification.tenantId,
          channel: newNotification.channel,
          eventType: newNotification.eventType,
          status: newNotification.status,
          createdAt: newNotification.createdAt,
        },
      },
    });
  });

  return notifications;
}

export const notificationRoutes = createNotificationRoutes();
