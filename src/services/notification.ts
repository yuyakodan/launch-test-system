/**
 * Notification Service
 * Manages notification dispatch for the Launch Test System
 *
 * Channels:
 * - email: Email notifications
 * - slack: Slack webhook notifications
 * - webhook: Generic webhook notifications
 *
 * Event Types:
 * - run.started: Run has started
 * - run.completed: Run has completed
 * - run.paused: Run has been paused
 * - stop_condition.triggered: Stop condition has been triggered
 * - approval.requested: Approval has been requested
 * - approval.approved: Approval has been granted
 * - approval.rejected: Approval has been rejected
 * - incident.created: New incident has been created
 */

import type { Notification, NotificationChannel, NotificationStatus } from '../types/entities.js';
import type { PaginatedResult, PaginationParams } from '../repositories/interfaces/base.js';
import type {
  INotificationRepository,
  CreateNotificationInput,
  NotificationFilter,
  NotificationEventType,
  NotificationStats,
} from '../repositories/interfaces/notification.js';
import { D1NotificationRepository } from '../repositories/d1/notification.js';

/**
 * Notification creation options
 */
export interface CreateNotificationOptions {
  tenantId: string;
  channel: NotificationChannel;
  eventType: NotificationEventType;
  payload: NotificationPayload;
}

/**
 * Notification payload structure
 */
export interface NotificationPayload {
  title: string;
  message: string;
  url?: string;
  metadata?: Record<string, unknown>;
  recipients?: string[];
}

/**
 * Email notification payload
 */
export interface EmailNotificationPayload extends NotificationPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  htmlBody?: string;
}

/**
 * Slack notification payload
 */
export interface SlackNotificationPayload extends NotificationPayload {
  channel?: string;
  username?: string;
  iconEmoji?: string;
  blocks?: unknown[];
}

/**
 * Webhook notification payload
 */
export interface WebhookNotificationPayload extends NotificationPayload {
  webhookUrl: string;
  headers?: Record<string, string>;
  method?: 'POST' | 'PUT';
}

/**
 * Notification Service class
 */
export class NotificationService {
  private repository: INotificationRepository;

  constructor(db: D1Database) {
    this.repository = new D1NotificationRepository(db);
  }

  /**
   * Create a new notification
   */
  async createNotification(options: CreateNotificationOptions): Promise<Notification> {
    const input: CreateNotificationInput = {
      tenantId: options.tenantId,
      channel: options.channel,
      eventType: options.eventType,
      payloadJson: JSON.stringify(options.payload),
    };

    return this.repository.create(input);
  }

  /**
   * Get notification by ID
   */
  async getNotification(id: string): Promise<Notification | null> {
    return this.repository.findById(id);
  }

  /**
   * List notifications for a tenant
   */
  async listNotifications(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<Notification>> {
    return this.repository.findByTenantId(tenantId, params);
  }

  /**
   * List notifications with filter
   */
  async listNotificationsWithFilter(
    filter: NotificationFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<Notification>> {
    return this.repository.findByFilter(filter, params);
  }

  /**
   * Get pending notifications ready for dispatch
   */
  async getPendingNotifications(limit?: number): Promise<Notification[]> {
    return this.repository.findPending(limit);
  }

  /**
   * Mark notification as sent
   */
  async markAsSent(id: string): Promise<Notification | null> {
    return this.repository.markAsSent(id);
  }

  /**
   * Mark notification as failed
   */
  async markAsFailed(id: string): Promise<Notification | null> {
    return this.repository.markAsFailed(id);
  }

  /**
   * Resend a notification
   */
  async resendNotification(id: string): Promise<Notification | null> {
    return this.repository.resend(id);
  }

  /**
   * Get notification statistics for a tenant
   */
  async getStats(tenantId: string): Promise<NotificationStats> {
    return this.repository.getStats(tenantId);
  }

  /**
   * Get notification payload as object
   */
  getNotificationPayload<T extends NotificationPayload = NotificationPayload>(
    notification: Notification
  ): T {
    try {
      return JSON.parse(notification.payloadJson) as T;
    } catch {
      return { title: '', message: '' } as T;
    }
  }

  /**
   * Cleanup old notifications
   */
  async cleanupOldNotifications(daysOld: number): Promise<number> {
    const olderThan = new Date();
    olderThan.setDate(olderThan.getDate() - daysOld);
    return this.repository.deleteOld(olderThan.toISOString());
  }

  // ==========================================
  // Convenience methods for common notifications
  // ==========================================

  /**
   * Notify run started
   */
  async notifyRunStarted(
    tenantId: string,
    channel: NotificationChannel,
    runId: string,
    runName: string,
    operatorName?: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'run.started',
      payload: {
        title: 'Run Started',
        message: `Run "${runName}" has been started${operatorName ? ` by ${operatorName}` : ''}.`,
        metadata: { runId, runName, operatorName },
      },
    });
  }

  /**
   * Notify run completed
   */
  async notifyRunCompleted(
    tenantId: string,
    channel: NotificationChannel,
    runId: string,
    runName: string,
    confidence: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'run.completed',
      payload: {
        title: 'Run Completed',
        message: `Run "${runName}" has completed with ${confidence} confidence.`,
        metadata: { runId, runName, confidence },
      },
    });
  }

  /**
   * Notify run paused
   */
  async notifyRunPaused(
    tenantId: string,
    channel: NotificationChannel,
    runId: string,
    runName: string,
    reason?: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'run.paused',
      payload: {
        title: 'Run Paused',
        message: `Run "${runName}" has been paused${reason ? `: ${reason}` : '.'}`,
        metadata: { runId, runName, reason },
      },
    });
  }

  /**
   * Notify stop condition triggered
   */
  async notifyStopConditionTriggered(
    tenantId: string,
    channel: NotificationChannel,
    runId: string,
    runName: string,
    ruleId: string,
    ruleMessage: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'stop_condition.triggered',
      payload: {
        title: 'Stop Condition Triggered',
        message: ruleMessage,
        metadata: { runId, runName, ruleId },
      },
    });
  }

  /**
   * Notify approval requested
   */
  async notifyApprovalRequested(
    tenantId: string,
    channel: NotificationChannel,
    approvalId: string,
    targetType: string,
    targetName: string,
    requesterName?: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'approval.requested',
      payload: {
        title: 'Approval Requested',
        message: `Approval requested for ${targetType} "${targetName}"${requesterName ? ` by ${requesterName}` : ''}.`,
        metadata: { approvalId, targetType, targetName, requesterName },
      },
    });
  }

  /**
   * Notify approval approved
   */
  async notifyApprovalApproved(
    tenantId: string,
    channel: NotificationChannel,
    approvalId: string,
    targetType: string,
    targetName: string,
    approverName?: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'approval.approved',
      payload: {
        title: 'Approval Granted',
        message: `${targetType} "${targetName}" has been approved${approverName ? ` by ${approverName}` : ''}.`,
        metadata: { approvalId, targetType, targetName, approverName },
      },
    });
  }

  /**
   * Notify approval rejected
   */
  async notifyApprovalRejected(
    tenantId: string,
    channel: NotificationChannel,
    approvalId: string,
    targetType: string,
    targetName: string,
    rejectorName?: string,
    reason?: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'approval.rejected',
      payload: {
        title: 'Approval Rejected',
        message: `${targetType} "${targetName}" has been rejected${rejectorName ? ` by ${rejectorName}` : ''}${reason ? `: ${reason}` : '.'}`,
        metadata: { approvalId, targetType, targetName, rejectorName, reason },
      },
    });
  }

  /**
   * Notify incident created
   */
  async notifyIncidentCreated(
    tenantId: string,
    channel: NotificationChannel,
    incidentId: string,
    incidentType: string,
    severity: string,
    reason: string,
    runId?: string
  ): Promise<Notification> {
    return this.createNotification({
      tenantId,
      channel,
      eventType: 'incident.created',
      payload: {
        title: `Incident Created [${severity.toUpperCase()}]`,
        message: `New ${incidentType} incident: ${reason}`,
        metadata: { incidentId, incidentType, severity, runId },
      },
    });
  }
}

/**
 * Create Notification service factory
 */
export function createNotificationService(db: D1Database): NotificationService {
  return new NotificationService(db);
}
