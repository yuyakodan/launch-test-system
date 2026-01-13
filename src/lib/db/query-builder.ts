/**
 * Query Builder for D1 Database
 * Provides type-safe query construction and execution
 */

/**
 * Comparison operators for WHERE clauses
 */
export type ComparisonOperator = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'LIKE' | 'IN' | 'IS NULL' | 'IS NOT NULL';

/**
 * Logical operators for combining conditions
 */
export type LogicalOperator = 'AND' | 'OR';

/**
 * Sort direction
 */
export type SortDirection = 'ASC' | 'DESC';

/**
 * WHERE condition
 */
export interface WhereCondition {
  field: string;
  operator: ComparisonOperator;
  value?: unknown;
  logical?: LogicalOperator;
}

/**
 * ORDER BY clause
 */
export interface OrderByClause {
  field: string;
  direction: SortDirection;
}

/**
 * SELECT query builder
 */
export class SelectBuilder {
  private tableName: string;
  private selectFields: string[] = ['*'];
  private whereConditions: WhereCondition[] = [];
  private orderByClause: OrderByClause[] = [];
  private limitValue?: number;
  private offsetValue?: number;
  private joinClauses: string[] = [];

  constructor(table: string) {
    this.tableName = table;
  }

  /**
   * Specify fields to select
   */
  select(...fields: string[]): this {
    this.selectFields = fields;
    return this;
  }

  /**
   * Add a WHERE condition
   */
  where(field: string, operator: ComparisonOperator, value?: unknown): this {
    this.whereConditions.push({ field, operator, value, logical: 'AND' });
    return this;
  }

  /**
   * Add an OR WHERE condition
   */
  orWhere(field: string, operator: ComparisonOperator, value?: unknown): this {
    this.whereConditions.push({ field, operator, value, logical: 'OR' });
    return this;
  }

  /**
   * Add WHERE IN condition
   */
  whereIn(field: string, values: unknown[]): this {
    this.whereConditions.push({ field, operator: 'IN', value: values, logical: 'AND' });
    return this;
  }

  /**
   * Add WHERE IS NULL condition
   */
  whereNull(field: string): this {
    this.whereConditions.push({ field, operator: 'IS NULL', logical: 'AND' });
    return this;
  }

  /**
   * Add WHERE IS NOT NULL condition
   */
  whereNotNull(field: string): this {
    this.whereConditions.push({ field, operator: 'IS NOT NULL', logical: 'AND' });
    return this;
  }

  /**
   * Add ORDER BY clause
   */
  orderBy(field: string, direction: SortDirection = 'ASC'): this {
    this.orderByClause.push({ field, direction });
    return this;
  }

  /**
   * Set LIMIT
   */
  limit(value: number): this {
    this.limitValue = value;
    return this;
  }

  /**
   * Set OFFSET
   */
  offset(value: number): this {
    this.offsetValue = value;
    return this;
  }

  /**
   * Add a JOIN clause
   */
  join(table: string, condition: string, type: 'INNER' | 'LEFT' | 'RIGHT' = 'INNER'): this {
    this.joinClauses.push(`${type} JOIN ${table} ON ${condition}`);
    return this;
  }

  /**
   * Build the query and return SQL with bound values
   */
  build(): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    let sql = `SELECT ${this.selectFields.join(', ')} FROM ${this.tableName}`;

    // Add JOINs
    if (this.joinClauses.length > 0) {
      sql += ' ' + this.joinClauses.join(' ');
    }

    // Add WHERE clauses
    if (this.whereConditions.length > 0) {
      const whereParts: string[] = [];

      for (let i = 0; i < this.whereConditions.length; i++) {
        const condition = this.whereConditions[i];
        let part = '';

        if (i > 0) {
          part += ` ${condition.logical} `;
        }

        if (condition.operator === 'IS NULL') {
          part += `${condition.field} IS NULL`;
        } else if (condition.operator === 'IS NOT NULL') {
          part += `${condition.field} IS NOT NULL`;
        } else if (condition.operator === 'IN') {
          const inValues = condition.value as unknown[];
          const placeholders = inValues.map(() => '?').join(', ');
          part += `${condition.field} IN (${placeholders})`;
          values.push(...inValues);
        } else {
          part += `${condition.field} ${condition.operator} ?`;
          values.push(condition.value);
        }

        whereParts.push(part);
      }

      sql += ' WHERE ' + whereParts.join('');
    }

    // Add ORDER BY
    if (this.orderByClause.length > 0) {
      const orderParts = this.orderByClause.map((o) => `${o.field} ${o.direction}`);
      sql += ' ORDER BY ' + orderParts.join(', ');
    }

    // Add LIMIT
    if (this.limitValue !== undefined) {
      sql += ` LIMIT ${this.limitValue}`;
    }

    // Add OFFSET
    if (this.offsetValue !== undefined) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return { sql, values };
  }
}

/**
 * INSERT query builder
 */
export class InsertBuilder {
  private tableName: string;
  private data: Record<string, unknown> = {};

  constructor(table: string) {
    this.tableName = table;
  }

  /**
   * Set values to insert
   */
  values(data: Record<string, unknown>): this {
    this.data = data;
    return this;
  }

  /**
   * Build the query and return SQL with bound values
   */
  build(): { sql: string; values: unknown[] } {
    const fields = Object.keys(this.data);
    const values = Object.values(this.data);
    const placeholders = fields.map(() => '?').join(', ');

    const sql = `INSERT INTO ${this.tableName} (${fields.join(', ')}) VALUES (${placeholders})`;

    return { sql, values };
  }
}

/**
 * UPDATE query builder
 */
export class UpdateBuilder {
  private tableName: string;
  private data: Record<string, unknown> = {};
  private whereConditions: WhereCondition[] = [];

  constructor(table: string) {
    this.tableName = table;
  }

  /**
   * Set values to update
   */
  set(data: Record<string, unknown>): this {
    this.data = data;
    return this;
  }

  /**
   * Add a WHERE condition
   */
  where(field: string, operator: ComparisonOperator, value?: unknown): this {
    this.whereConditions.push({ field, operator, value, logical: 'AND' });
    return this;
  }

  /**
   * Build the query and return SQL with bound values
   */
  build(): { sql: string; values: unknown[] } {
    const fields = Object.keys(this.data);
    const values: unknown[] = Object.values(this.data);

    const setParts = fields.map((f) => `${f} = ?`).join(', ');
    let sql = `UPDATE ${this.tableName} SET ${setParts}`;

    // Add WHERE clauses
    if (this.whereConditions.length > 0) {
      const whereParts: string[] = [];

      for (let i = 0; i < this.whereConditions.length; i++) {
        const condition = this.whereConditions[i];
        let part = '';

        if (i > 0) {
          part += ` ${condition.logical} `;
        }

        part += `${condition.field} ${condition.operator} ?`;
        values.push(condition.value);
        whereParts.push(part);
      }

      sql += ' WHERE ' + whereParts.join('');
    }

    return { sql, values };
  }
}

/**
 * DELETE query builder
 */
export class DeleteBuilder {
  private tableName: string;
  private whereConditions: WhereCondition[] = [];

  constructor(table: string) {
    this.tableName = table;
  }

  /**
   * Add a WHERE condition
   */
  where(field: string, operator: ComparisonOperator, value?: unknown): this {
    this.whereConditions.push({ field, operator, value, logical: 'AND' });
    return this;
  }

  /**
   * Build the query and return SQL with bound values
   */
  build(): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    let sql = `DELETE FROM ${this.tableName}`;

    // Add WHERE clauses
    if (this.whereConditions.length > 0) {
      const whereParts: string[] = [];

      for (let i = 0; i < this.whereConditions.length; i++) {
        const condition = this.whereConditions[i];
        let part = '';

        if (i > 0) {
          part += ` ${condition.logical} `;
        }

        part += `${condition.field} ${condition.operator} ?`;
        values.push(condition.value);
        whereParts.push(part);
      }

      sql += ' WHERE ' + whereParts.join('');
    }

    return { sql, values };
  }
}

/**
 * COUNT query builder
 */
export class CountBuilder {
  private tableName: string;
  private whereConditions: WhereCondition[] = [];
  private countField = '*';

  constructor(table: string) {
    this.tableName = table;
  }

  /**
   * Specify field to count (default: *)
   */
  field(name: string): this {
    this.countField = name;
    return this;
  }

  /**
   * Add a WHERE condition
   */
  where(field: string, operator: ComparisonOperator, value?: unknown): this {
    this.whereConditions.push({ field, operator, value, logical: 'AND' });
    return this;
  }

  /**
   * Add WHERE IN condition
   */
  whereIn(field: string, values: unknown[]): this {
    this.whereConditions.push({ field, operator: 'IN', value: values, logical: 'AND' });
    return this;
  }

  /**
   * Add WHERE IS NULL condition
   */
  whereNull(field: string): this {
    this.whereConditions.push({ field, operator: 'IS NULL', logical: 'AND' });
    return this;
  }

  /**
   * Add WHERE IS NOT NULL condition
   */
  whereNotNull(field: string): this {
    this.whereConditions.push({ field, operator: 'IS NOT NULL', logical: 'AND' });
    return this;
  }

  /**
   * Build the query and return SQL with bound values
   */
  build(): { sql: string; values: unknown[] } {
    const values: unknown[] = [];
    let sql = `SELECT COUNT(${this.countField}) as count FROM ${this.tableName}`;

    // Add WHERE clauses
    if (this.whereConditions.length > 0) {
      const whereParts: string[] = [];

      for (let i = 0; i < this.whereConditions.length; i++) {
        const condition = this.whereConditions[i];
        let part = '';

        if (i > 0) {
          part += ` ${condition.logical} `;
        }

        if (condition.operator === 'IS NULL') {
          part += `${condition.field} IS NULL`;
        } else if (condition.operator === 'IS NOT NULL') {
          part += `${condition.field} IS NOT NULL`;
        } else if (condition.operator === 'IN') {
          const inValues = condition.value as unknown[];
          const placeholders = inValues.map(() => '?').join(', ');
          part += `${condition.field} IN (${placeholders})`;
          values.push(...inValues);
        } else {
          part += `${condition.field} ${condition.operator} ?`;
          values.push(condition.value);
        }

        whereParts.push(part);
      }

      sql += ' WHERE ' + whereParts.join('');
    }

    return { sql, values };
  }
}

// Factory functions for fluent API
export const select = (table: string): SelectBuilder => new SelectBuilder(table);
export const insert = (table: string): InsertBuilder => new InsertBuilder(table);
export const update = (table: string): UpdateBuilder => new UpdateBuilder(table);
export const del = (table: string): DeleteBuilder => new DeleteBuilder(table);
export const count = (table: string): CountBuilder => new CountBuilder(table);

/**
 * D1 Query Executor
 * Executes built queries against D1 database
 */
export class D1Executor {
  constructor(private db: D1Database) {}

  /**
   * Execute a SELECT query and return all results
   */
  async all<T>(builder: SelectBuilder): Promise<T[]> {
    const { sql, values } = builder.build();
    const stmt = this.db.prepare(sql);
    const result = await stmt.bind(...values).all<T>();
    return result.results ?? [];
  }

  /**
   * Execute a SELECT query and return first result
   */
  async first<T>(builder: SelectBuilder): Promise<T | null> {
    const { sql, values } = builder.build();
    const stmt = this.db.prepare(sql);
    return stmt.bind(...values).first<T>();
  }

  /**
   * Execute an INSERT query
   */
  async insert(builder: InsertBuilder): Promise<D1Result<unknown>> {
    const { sql, values } = builder.build();
    const stmt = this.db.prepare(sql);
    return stmt.bind(...values).run();
  }

  /**
   * Execute an UPDATE query
   */
  async update(builder: UpdateBuilder): Promise<D1Result<unknown>> {
    const { sql, values } = builder.build();
    const stmt = this.db.prepare(sql);
    return stmt.bind(...values).run();
  }

  /**
   * Execute a DELETE query
   */
  async delete(builder: DeleteBuilder): Promise<D1Result<unknown>> {
    const { sql, values } = builder.build();
    const stmt = this.db.prepare(sql);
    return stmt.bind(...values).run();
  }

  /**
   * Execute a COUNT query
   */
  async count(builder: CountBuilder): Promise<number> {
    const { sql, values } = builder.build();
    const stmt = this.db.prepare(sql);
    const result = await stmt.bind(...values).first<{ count: number }>();
    return result?.count ?? 0;
  }

  /**
   * Execute raw SQL
   */
  async raw<T>(sql: string, values: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    const result = await stmt.bind(...values).all<T>();
    return result.results ?? [];
  }

  /**
   * Execute raw SQL and return first result
   */
  async rawFirst<T>(sql: string, values: unknown[] = []): Promise<T | null> {
    const stmt = this.db.prepare(sql);
    return stmt.bind(...values).first<T>();
  }

  /**
   * Execute a batch of statements in a transaction
   */
  async batch(statements: D1PreparedStatement[]): Promise<D1Result<unknown>[]> {
    return this.db.batch(statements);
  }

  /**
   * Prepare a statement for batch execution
   */
  prepare(sql: string): D1PreparedStatement {
    return this.db.prepare(sql);
  }
}
