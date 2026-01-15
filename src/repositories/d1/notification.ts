/**
 * D1 Notification Repository implementation
 * Handles notification persistence in Cloudflare D1
 */

import { select, count } from '../../lib/db/index.js';
import type { Notification, NotificationChannel, NotificationStatus } from '../../types/entities.js';
import type { PaginatedResult, PaginationParams } from '../interfaces/base.js';
import type {
  INotificationRepository,
  CreateNotificationInput,
  UpdateNotificationInput,
  NotificationFilter,
  NotificationEventType,
  NotificationStats,
} from '../interfaces/notification.js';
import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';

/**
 * D1 Notification Repository
 */
export class D1NotificationRepository
  extends BaseD1Repository<Notification, CreateNotificationInput, UpdateNotificationInput>
  implements INotificationRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'tenantId',
    'channel',
    'eventType',
    'payloadJson',
    'status',
    'sentAt',
    'createdAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'notifications');
  }

  protected rowToEntity(row: Record<string, unknown>): Notification {
    return {
      id: row.id as string,
      tenantId: row.tenant_id as string,
      channel: row.channel as NotificationChannel,
      eventType: row.event_type as string,
      payloadJson: row.payload_json as string,
      status: row.status as NotificationStatus,
      sentAt: row.sent_at as string | null,
      createdAt: row.created_at as string,
    };
  }

  protected createInputToRow(input: CreateNotificationInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: this.generateId(),
      tenant_id: input.tenantId,
      channel: input.channel,
      event_type: input.eventType,
      payload_json: input.payloadJson ?? '{}',
      status: 'pending',
      sent_at: null,
      created_at: now,
    };
  }

  protected updateInputToRow(input: UpdateNotificationInput): Record<string, unknown> {
    return removeUndefined({
      status: input.status,
      sent_at: input.sentAt,
    });
  }

  async findByTenantId(tenantId: string, params?: PaginationParams): Promise<PaginatedResult<Notification>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    const countBuilder = count(this.tableName).where('tenant_id', '=', tenantId);
    const total = await this.executor.count(countBuilder);

    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<Record<string, unknown>>(builder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByFilter(filter: NotificationFilter, params?: PaginationParams): Promise<PaginatedResult<Notification>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    let countBuilder = count(this.tableName);
    let queryBuilder = select(this.tableName);

    if (filter.tenantId) {
      countBuilder = countBuilder.where('tenant_id', '=', filter.tenantId);
      queryBuilder = queryBuilder.where('tenant_id', '=', filter.tenantId);
    }

    if (filter.channel) {
      countBuilder = countBuilder.where('channel', '=', filter.channel);
      queryBuilder = queryBuilder.where('channel', '=', filter.channel);
    }

    if (filter.eventType) {
      countBuilder = countBuilder.where('event_type', '=', filter.eventType);
      queryBuilder = queryBuilder.where('event_type', '=', filter.eventType);
    }

    if (filter.status) {
      countBuilder = countBuilder.where('status', '=', filter.status);
      queryBuilder = queryBuilder.where('status', '=', filter.status);
    }

    if (filter.statuses && filter.statuses.length > 0) {
      countBuilder = countBuilder.whereIn('status', filter.statuses);
      queryBuilder = queryBuilder.whereIn('status', filter.statuses);
    }

    if (filter.createdAfter) {
      countBuilder = countBuilder.where('created_at', '>=', filter.createdAfter);
      queryBuilder = queryBuilder.where('created_at', '>=', filter.createdAfter);
    }

    if (filter.createdBefore) {
      countBuilder = countBuilder.where('created_at', '<=', filter.createdBefore);
      queryBuilder = queryBuilder.where('created_at', '<=', filter.createdBefore);
    }

    const total = await this.executor.count(countBuilder);

    queryBuilder = queryBuilder
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<Record<string, unknown>>(queryBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findPending(limit = 100): Promise<Notification[]> {
    const builder = select(this.tableName)
      .where('status', '=', 'pending')
      .orderBy('created_at', 'ASC')
      .limit(limit);

    const rows = await this.executor.all<Record<string, unknown>>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByChannel(
    tenantId: string,
    channel: NotificationChannel,
    params?: PaginationParams
  ): Promise<PaginatedResult<Notification>> {
    return this.findByFilter({ tenantId, channel }, params);
  }

  async findByEventType(
    tenantId: string,
    eventType: NotificationEventType | string,
    params?: PaginationParams
  ): Promise<PaginatedResult<Notification>> {
    return this.findByFilter({ tenantId, eventType }, params);
  }

  async markAsSent(id: string): Promise<Notification | null> {
    return this.update(id, {
      status: 'sent',
      sentAt: this.now(),
    });
  }

  async markAsFailed(id: string): Promise<Notification | null> {
    return this.update(id, {
      status: 'failed',
    });
  }

  async resend(id: string): Promise<Notification | null> {
    const original = await this.findById(id);
    if (!original) return null;

    return this.create({
      tenantId: original.tenantId,
      channel: original.channel,
      eventType: original.eventType,
      payloadJson: original.payloadJson,
    });
  }

  async countByStatus(tenantId: string, status: NotificationStatus): Promise<number> {
    const builder = count(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('status', '=', status);
    return this.executor.count(builder);
  }

  async getStats(tenantId: string): Promise<NotificationStats> {
    const [total, pending, sent, failed] = await Promise.all([
      this.executor.count(count(this.tableName).where('tenant_id', '=', tenantId)),
      this.countByStatus(tenantId, 'pending'),
      this.countByStatus(tenantId, 'sent'),
      this.countByStatus(tenantId, 'failed'),
    ]);

    return {
      total,
      pending,
      sent,
      failed,
    };
  }

  async deleteOld(olderThan: string): Promise<number> {
    const countBuilder = count(this.tableName)
      .where('created_at', '<', olderThan);

    const toDelete = await this.executor.count(countBuilder);

    if (toDelete > 0) {
      const sql = `DELETE FROM notifications WHERE created_at < ?`;
      await this.executor.raw(sql, [olderThan]);
    }

    return toDelete;
  }
}
