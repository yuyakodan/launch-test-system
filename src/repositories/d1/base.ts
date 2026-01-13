/**
 * Base D1 Repository implementation
 * Provides common CRUD operations and utility methods
 */

import { D1Executor, select, insert, update, del, count } from '../../lib/db/index.js';
import { ulid } from '../../lib/ulid.js';
import type { PaginationParams, PaginatedResult } from '../interfaces/base.js';

/**
 * Column mapping configuration
 * Maps entity property names to database column names
 */
export interface ColumnMapping {
  entityField: string;
  dbColumn: string;
}

/**
 * Base D1 Repository
 * Generic base class for all D1 repository implementations
 */
export abstract class BaseD1Repository<T, CreateInput, UpdateInput> {
  protected executor: D1Executor;
  protected tableName: string;
  protected primaryKey: string;

  /**
   * Column mappings for entity to database conversion
   * Override in subclass to define custom mappings
   */
  protected abstract columnMappings: ColumnMapping[];

  constructor(db: D1Database, tableName: string, primaryKey = 'id') {
    this.executor = new D1Executor(db);
    this.tableName = tableName;
    this.primaryKey = primaryKey;
  }

  /**
   * Generate a new ULID
   */
  protected generateId(): string {
    return ulid();
  }

  /**
   * Get current timestamp in ISO8601 format
   */
  protected now(): string {
    return new Date().toISOString();
  }

  /**
   * Convert database row to entity
   * Note: Row type is any to allow subclasses to use specific row types
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract rowToEntity(row: any): T;

  /**
   * Convert entity field name to database column name
   */
  protected toDbColumn(entityField: string): string {
    const mapping = this.columnMappings.find((m) => m.entityField === entityField);
    return mapping?.dbColumn ?? entityField;
  }

  /**
   * Convert database column name to entity field name
   */
  protected toEntityField(dbColumn: string): string {
    const mapping = this.columnMappings.find((m) => m.dbColumn === dbColumn);
    return mapping?.entityField ?? dbColumn;
  }

  /**
   * Convert create input to database columns
   */
  protected abstract createInputToRow(input: CreateInput): Record<string, unknown>;

  /**
   * Convert update input to database columns
   */
  protected abstract updateInputToRow(input: UpdateInput): Record<string, unknown>;

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<T | null> {
    const builder = select(this.tableName).where(this.primaryKey, '=', id);
    const row = await this.executor.first<Record<string, unknown>>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  /**
   * Find all entities with pagination
   */
  async findAll(params?: PaginationParams): Promise<PaginatedResult<T>> {
    const limit = params?.limit ?? 100;
    const offset = params?.offset ?? 0;

    // Get total count
    const total = await this.count();

    // Get paginated results
    const builder = select(this.tableName)
      .orderBy(this.primaryKey, 'DESC')
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

  /**
   * Create a new entity
   */
  async create(input: CreateInput): Promise<T> {
    const row = this.createInputToRow(input);
    const insertBuilder = insert(this.tableName).values(row);
    await this.executor.insert(insertBuilder);

    const id = row[this.primaryKey] as string;
    const created = await this.findById(id);

    if (!created) {
      throw new Error(`Failed to create entity in ${this.tableName}`);
    }

    return created;
  }

  /**
   * Update an entity
   */
  async update(id: string, input: UpdateInput): Promise<T | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    const row = this.updateInputToRow(input);

    // Only update if there are fields to update
    if (Object.keys(row).length === 0) {
      return existing;
    }

    // Add updated_at timestamp if the table has it
    if (this.columnMappings.some((m) => m.dbColumn === 'updated_at')) {
      row.updated_at = this.now();
    }

    const updateBuilder = update(this.tableName)
      .set(row)
      .where(this.primaryKey, '=', id);

    await this.executor.update(updateBuilder);
    return this.findById(id);
  }

  /**
   * Delete an entity
   */
  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) {
      return false;
    }

    const deleteBuilder = del(this.tableName).where(this.primaryKey, '=', id);
    await this.executor.delete(deleteBuilder);
    return true;
  }

  /**
   * Check if entity exists
   */
  async exists(id: string): Promise<boolean> {
    const builder = count(this.tableName).where(this.primaryKey, '=', id);
    const total = await this.executor.count(builder);
    return total > 0;
  }

  /**
   * Count total entities
   */
  async count(): Promise<number> {
    const builder = count(this.tableName);
    return this.executor.count(builder);
  }

  /**
   * Execute batch operations in a transaction
   */
  async runTransaction<R>(
    callback: (statements: D1PreparedStatement[]) => Promise<{ statements: D1PreparedStatement[]; result: R }>
  ): Promise<R> {
    const { statements, result } = await callback([]);
    await this.executor.batch(statements);
    return result;
  }
}

/**
 * Helper function to filter out undefined values from an object
 */
export function removeUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key as keyof T] = value as T[keyof T];
    }
  }

  return result;
}

/**
 * Helper function to convert camelCase to snake_case
 */
export function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Helper function to convert snake_case to camelCase
 */
export function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Generate column mappings from entity fields
 */
export function generateColumnMappings(fields: string[]): ColumnMapping[] {
  return fields.map((field) => ({
    entityField: field,
    dbColumn: camelToSnake(field),
  }));
}
