/**
 * User repository interface
 */

import type { User, Membership, MembershipRole, MembershipStatus } from '../../types/entities.js';
import type { IBaseRepository, PaginatedResult, PaginationParams } from './base.js';

/**
 * Input for creating a user
 */
export interface CreateUserInput {
  id?: string;
  email: string;
  name?: string | null;
}

/**
 * Input for updating a user
 */
export interface UpdateUserInput {
  email?: string;
  name?: string | null;
}

/**
 * Filter options for finding users
 */
export interface UserFilter {
  emailContains?: string;
  nameContains?: string;
  tenantId?: string;
}

/**
 * User with membership info
 */
export interface UserWithMembership extends User {
  membership?: Membership;
}

/**
 * User repository interface
 */
export interface IUserRepository extends IBaseRepository<User, CreateUserInput, UpdateUserInput> {
  /**
   * Find user by email
   */
  findByEmail(email: string): Promise<User | null>;

  /**
   * Find users by filter with pagination
   */
  findByFilter(filter: UserFilter, params?: PaginationParams): Promise<PaginatedResult<User>>;

  /**
   * Find users by tenant ID with their membership info
   */
  findByTenantId(
    tenantId: string,
    params?: PaginationParams
  ): Promise<PaginatedResult<UserWithMembership>>;

  /**
   * Check if email is available
   */
  isEmailAvailable(email: string, excludeId?: string): Promise<boolean>;
}

/**
 * Input for creating a membership
 */
export interface CreateMembershipInput {
  tenantId: string;
  userId: string;
  role: MembershipRole;
  status?: MembershipStatus;
}

/**
 * Input for updating a membership
 */
export interface UpdateMembershipInput {
  role?: MembershipRole;
  status?: MembershipStatus;
}

/**
 * Membership repository interface
 */
export interface IMembershipRepository {
  /**
   * Find membership by tenant and user IDs
   */
  findByTenantAndUser(tenantId: string, userId: string): Promise<Membership | null>;

  /**
   * Find all memberships for a user
   */
  findByUserId(userId: string): Promise<Membership[]>;

  /**
   * Find all memberships for a tenant
   */
  findByTenantId(tenantId: string): Promise<Membership[]>;

  /**
   * Create a new membership
   */
  create(input: CreateMembershipInput): Promise<Membership>;

  /**
   * Update an existing membership
   */
  update(tenantId: string, userId: string, input: UpdateMembershipInput): Promise<Membership | null>;

  /**
   * Delete a membership
   */
  delete(tenantId: string, userId: string): Promise<boolean>;

  /**
   * Check if user has specific role in tenant
   */
  hasRole(tenantId: string, userId: string, role: MembershipRole): Promise<boolean>;

  /**
   * Check if user has any of the specified roles
   */
  hasAnyRole(tenantId: string, userId: string, roles: MembershipRole[]): Promise<boolean>;

  /**
   * Get user's role in tenant
   */
  getRole(tenantId: string, userId: string): Promise<MembershipRole | null>;
}
