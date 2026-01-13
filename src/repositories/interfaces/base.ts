/**
 * Base repository interface definitions
 * Provides common patterns for all repository implementations
 */

/**
 * Pagination parameters
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
}

/**
 * Paginated result wrapper
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Sort direction
 */
export type SortDirection = 'asc' | 'desc';

/**
 * Sort parameters
 */
export interface SortParams<T> {
  field: keyof T;
  direction: SortDirection;
}

/**
 * Base repository interface with common CRUD operations
 */
export interface IBaseRepository<T, CreateInput, UpdateInput> {
  /**
   * Find a single entity by ID
   */
  findById(id: string): Promise<T | null>;

  /**
   * Find all entities with optional pagination
   */
  findAll(params?: PaginationParams): Promise<PaginatedResult<T>>;

  /**
   * Create a new entity
   */
  create(input: CreateInput): Promise<T>;

  /**
   * Update an existing entity
   */
  update(id: string, input: UpdateInput): Promise<T | null>;

  /**
   * Delete an entity by ID
   */
  delete(id: string): Promise<boolean>;

  /**
   * Check if an entity exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Count total entities
   */
  count(): Promise<number>;
}

/**
 * Transaction callback type
 */
export type TransactionCallback<T> = (tx: TransactionContext) => Promise<T>;

/**
 * Transaction context for batch operations
 */
export interface TransactionContext {
  /**
   * Add a statement to the transaction
   */
  addStatement(statement: D1PreparedStatement): void;
}

/**
 * Repository with transaction support
 */
export interface ITransactionalRepository {
  /**
   * Execute multiple operations in a transaction
   */
  runTransaction<T>(callback: TransactionCallback<T>): Promise<T>;
}

/**
 * Database type for repository factory
 */
export type DatabaseType = 'd1' | 'neon';

/**
 * Feature flag for database selection
 */
export interface DatabaseFeatureFlag {
  dbType: DatabaseType;
  migrationPhase?: 'read-old' | 'dual-write' | 'read-new' | 'complete';
}
