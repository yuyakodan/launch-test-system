/**
 * Notification repository interface
 * Handles notification management for various events
 */

import type { Notification, NotificationChannel, NotificationStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Notification event types
 */
export type NotificationEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.paused'
  | 'stop_condition.triggered'
  | 'approval.requested'
  | 'approval.approved'
  | 'approval.rejected'
  | 'incident.created';

/**
 * Input for creating a new notification
 */
export interface CreateNotificationInput {
  tenantId: string;
  channel: NotificationChannel;
  eventType: NotificationEventType | string;
  payloadJson?: string;
}

/**
 * Input for updating a notification
 */
export interface UpdateNotificationInput {
  status?: NotificationStatus;
  sentAt?: string;
}

/**
 * Filter options for querying notifications
 */
export interface NotificationFilter {
  tenantId?: string;
  channel?: NotificationChannel;
  eventType?: NotificationEventType | string;
  status?: NotificationStatus;
  statuses?: NotificationStatus[];
  createdAfter?: string;
  createdBefore?: string;
}

/**
 * Notification repository interface
 */
export interface INotificationRepository extends IBaseRepository<Notification, CreateNotificationInput, UpdateNotificationInput> {
  /**
   * Find notifications by tenant ID
   */
  findByTenantId(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<Notification>>;

  /**
   * Find notifications by filter
   */
  findByFilter(filter: NotificationFilter, params?: PaginationParams): Promise<PaginatedResult<Notification>>;

  /**
   * Find pending notifications ready to send
   */
  findPending(limit?: number): Promise<Notification[]>;

  /**
   * Find notifications by channel
   */
  findByChannel(tenantId: string, channel: NotificationChannel, params?: PaginationParams): Promise<PaginatedResult<Notification>>;

  /**
   * Find notifications by event type
   */
  findByEventType(tenantId: string, eventType: NotificationEventType | string, params?: PaginationParams): Promise<PaginatedResult<Notification>>;

  /**
   * Mark notification as sent
   */
  markAsSent(id: string): Promise<Notification | null>;

  /**
   * Mark notification as failed
   */
  markAsFailed(id: string): Promise<Notification | null>;

  /**
   * Create a resend of a notification (creates a new pending notification with same payload)
   */
  resend(id: string): Promise<Notification | null>;

  /**
   * Count notifications by status for a tenant
   */
  countByStatus(tenantId: string, status: NotificationStatus): Promise<number>;

  /**
   * Get notification statistics for a tenant
   */
  getStats(tenantId: string): Promise<NotificationStats>;

  /**
   * Delete old notifications (cleanup)
   */
  deleteOld(olderThan: string): Promise<number>;
}

/**
 * Notification statistics
 */
export interface NotificationStats {
  total: number;
  pending: number;
  sent: number;
  failed: number;
}
