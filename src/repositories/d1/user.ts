/**
 * D1 User and Membership Repository implementations
 */

import { BaseD1Repository, generateColumnMappings, removeUndefined } from './base.js';
import { D1Executor, select, insert, update, del, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { User, Membership, MembershipRole, MembershipStatus } from '../../types/entities.js';
import type {
  IUserRepository,
  CreateUserInput,
  UpdateUserInput,
  UserFilter,
  UserWithMembership,
  IMembershipRepository,
  CreateMembershipInput,
  UpdateMembershipInput,
  PaginationParams,
  PaginatedResult,
} from '../interfaces/index.js';

/**
 * Database row type for users table
 */
interface UserRow {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Database row type for memberships table
 */
interface MembershipRow {
  tenant_id: string;
  user_id: string;
  role: MembershipRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
}

/**
 * D1 User Repository
 */
export class D1UserRepository
  extends BaseD1Repository<User, CreateUserInput, UpdateUserInput>
  implements IUserRepository
{
  protected columnMappings = generateColumnMappings([
    'id',
    'email',
    'name',
    'createdAt',
    'updatedAt',
  ]);

  constructor(db: D1Database) {
    super(db, 'users');
  }

  protected rowToEntity(row: UserRow): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  protected createInputToRow(input: CreateUserInput): Record<string, unknown> {
    const now = this.now();
    return {
      id: input.id ?? ulid(),
      email: input.email,
      name: input.name ?? null,
      created_at: now,
      updated_at: now,
    };
  }

  protected updateInputToRow(input: UpdateUserInput): Record<string, unknown> {
    return removeUndefined({
      email: input.email,
      name: input.name,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    const builder = select(this.tableName).where('email', '=', email);
    const row = await this.executor.first<UserRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByFilter(
    filter: UserFilter,
    params?: PaginationParams
  ): Promise<PaginatedResult<User>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Count query
    let countBuilder = count(this.tableName);
    if (filter.emailContains) {
      countBuilder = countBuilder.where('email', 'LIKE', `%${filter.emailContains}%`);
    }
    if (filter.nameContains) {
      countBuilder = countBuilder.where('name', 'LIKE', `%${filter.nameContains}%`);
    }

    const total = await this.executor.count(countBuilder);

    // Select query
    let selectBuilder = select(this.tableName);
    if (filter.emailContains) {
      selectBuilder = selectBuilder.where('email', 'LIKE', `%${filter.emailContains}%`);
    }
    if (filter.nameContains) {
      selectBuilder = selectBuilder.where('name', 'LIKE', `%${filter.nameContains}%`);
    }

    selectBuilder = selectBuilder
      .orderBy('created_at', 'DESC')
      .limit(limit)
      .offset(offset);

    const rows = await this.executor.all<UserRow>(selectBuilder);
    const items = rows.map((row) => this.rowToEntity(row));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<UserWithMembership>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Count total users for tenant
    const countSql = `
      SELECT COUNT(*) as count
      FROM users u
      INNER JOIN memberships m ON u.id = m.user_id
      WHERE m.tenant_id = ?
    `;
    const countResult = await this.executor.rawFirst<{ count: number }>(countSql, [tenantId]);
    const total = countResult?.count ?? 0;

    // Get users with membership info
    const sql = `
      SELECT u.*, m.role, m.status as membership_status, m.created_at as membership_created_at, m.updated_at as membership_updated_at
      FROM users u
      INNER JOIN memberships m ON u.id = m.user_id
      WHERE m.tenant_id = ?
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await this.executor.raw<UserRow & { role: MembershipRole; membership_status: MembershipStatus; membership_created_at: string; membership_updated_at: string }>(
      sql,
      [tenantId, limit, offset]
    );

    const items: UserWithMembership[] = rows.map((row) => ({
      ...this.rowToEntity(row),
      membership: {
        tenantId,
        userId: row.id,
        role: row.role,
        status: row.membership_status,
        createdAt: row.membership_created_at,
        updatedAt: row.membership_updated_at,
      },
    }));

    return {
      items,
      total,
      limit,
      offset,
      hasMore: offset + items.length < total,
    };
  }

  async isEmailAvailable(email: string, excludeId?: string): Promise<boolean> {
    let builder = count(this.tableName).where('email', '=', email);

    if (excludeId) {
      builder = builder.where('id', '!=', excludeId);
    }

    const total = await this.executor.count(builder);
    return total === 0;
  }
}

/**
 * D1 Membership Repository
 */
export class D1MembershipRepository implements IMembershipRepository {
  private executor: D1Executor;
  private tableName = 'memberships';

  constructor(db: D1Database) {
    this.executor = new D1Executor(db);
  }

  private now(): string {
    return new Date().toISOString();
  }

  private rowToEntity(row: MembershipRow): Membership {
    return {
      tenantId: row.tenant_id,
      userId: row.user_id,
      role: row.role,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findByTenantAndUser(tenantId: string, userId: string): Promise<Membership | null> {
    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId);

    const row = await this.executor.first<MembershipRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByUserId(userId: string): Promise<Membership[]> {
    const builder = select(this.tableName)
      .where('user_id', '=', userId)
      .orderBy('created_at', 'DESC');

    const rows = await this.executor.all<MembershipRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByTenantId(tenantId: string): Promise<Membership[]> {
    const builder = select(this.tableName)
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'DESC');

    const rows = await this.executor.all<MembershipRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async create(input: CreateMembershipInput): Promise<Membership> {
    const now = this.now();
    const row = {
      tenant_id: input.tenantId,
      user_id: input.userId,
      role: input.role,
      status: input.status ?? 'active',
      created_at: now,
      updated_at: now,
    };

    const builder = insert(this.tableName).values(row);
    await this.executor.insert(builder);

    const created = await this.findByTenantAndUser(input.tenantId, input.userId);
    if (!created) {
      throw new Error('Failed to create membership');
    }

    return created;
  }

  async update(
    tenantId: string,
    userId: string,
    input: UpdateMembershipInput
  ): Promise<Membership | null> {
    const existing = await this.findByTenantAndUser(tenantId, userId);
    if (!existing) {
      return null;
    }

    const updateData = removeUndefined({
      role: input.role,
      status: input.status,
      updated_at: this.now(),
    });

    if (Object.keys(updateData).length <= 1) {
      // Only updated_at was set
      return existing;
    }

    const builder = update(this.tableName)
      .set(updateData)
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId);

    await this.executor.update(builder);
    return this.findByTenantAndUser(tenantId, userId);
  }

  async delete(tenantId: string, userId: string): Promise<boolean> {
    const existing = await this.findByTenantAndUser(tenantId, userId);
    if (!existing) {
      return false;
    }

    const builder = del(this.tableName)
      .where('tenant_id', '=', tenantId)
      .where('user_id', '=', userId);

    await this.executor.delete(builder);
    return true;
  }

  async hasRole(tenantId: string, userId: string, role: MembershipRole): Promise<boolean> {
    const membership = await this.findByTenantAndUser(tenantId, userId);
    return membership?.role === role;
  }

  async hasAnyRole(
    tenantId: string,
    userId: string,
    roles: MembershipRole[]
  ): Promise<boolean> {
    const membership = await this.findByTenantAndUser(tenantId, userId);
    return membership ? roles.includes(membership.role) : false;
  }

  async getRole(tenantId: string, userId: string): Promise<MembershipRole | null> {
    const membership = await this.findByTenantAndUser(tenantId, userId);
    return membership?.role ?? null;
  }
}
