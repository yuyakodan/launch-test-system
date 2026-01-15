/**
 * D1 Insights Repository implementation
 * Handles CRUD operations for insights_hourly and insights_daily tables
 */

import { D1Executor, select } from '../../lib/db/index.js';
import type { InsightHourly, InsightDaily, InsightSource } from '../../types/entities.js';
import type {
  IInsightsHourlyRepository,
  IInsightsDailyRepository,
  UpsertInsightHourlyInput,
  UpsertInsightDailyInput,
  InsightFilter,
  AggregatedInsightMetrics,
  InsightMetrics,
} from '../interfaces/insights.js';

/**
 * Database row type for insights_hourly table
 */
interface InsightHourlyRow {
  ad_bundle_id: string;
  ts_hour: string;
  metrics_json: string;
  source: InsightSource;
  updated_at: string;
}

/**
 * Database row type for insights_daily table
 */
interface InsightDailyRow {
  ad_bundle_id: string;
  date_yyyy_mm_dd: string;
  metrics_json: string;
  source: InsightSource;
  updated_at: string;
}

/**
 * Helper function to calculate aggregated metrics
 */
function calculateAggregatedMetrics(metrics: InsightMetrics[]): AggregatedInsightMetrics {
  let totalCost = 0;
  let totalClicks = 0;
  let totalImpressions = 0;
  let totalConversions = 0;

  for (const m of metrics) {
    totalCost += m.cost || 0;
    totalClicks += m.clicks || 0;
    totalImpressions += m.impressions || 0;
    totalConversions += m.conversions || 0;
  }

  const ctr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
  const cpc = totalClicks > 0 ? totalCost / totalClicks : 0;
  const cpm = totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0;
  const cpa = totalConversions > 0 ? totalCost / totalConversions : null;

  return {
    totalCost,
    totalClicks,
    totalImpressions,
    totalConversions,
    ctr,
    cpc,
    cpm,
    cpa,
    recordCount: metrics.length,
  };
}

/**
 * D1 Insights Hourly Repository
 */
export class D1InsightsHourlyRepository implements IInsightsHourlyRepository {
  private executor: D1Executor;
  private tableName = 'insights_hourly';

  constructor(db: D1Database) {
    this.executor = new D1Executor(db);
  }

  private rowToEntity(row: InsightHourlyRow): InsightHourly {
    return {
      adBundleId: row.ad_bundle_id,
      tsHour: row.ts_hour,
      metricsJson: row.metrics_json,
      source: row.source,
      updatedAt: row.updated_at,
    };
  }

  async findByBundleAndHour(adBundleId: string, tsHour: string): Promise<InsightHourly | null> {
    const builder = select(this.tableName)
      .where('ad_bundle_id', '=', adBundleId)
      .where('ts_hour', '=', tsHour);
    const row = await this.executor.first<InsightHourlyRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByBundleId(adBundleId: string, filter?: InsightFilter): Promise<InsightHourly[]> {
    let builder = select(this.tableName).where('ad_bundle_id', '=', adBundleId);

    if (filter?.source) {
      builder = builder.where('source', '=', filter.source);
    }
    if (filter?.from) {
      builder = builder.where('ts_hour', '>=', filter.from);
    }
    if (filter?.to) {
      builder = builder.where('ts_hour', '<=', filter.to);
    }

    builder = builder.orderBy('ts_hour', 'ASC');
    const rows = await this.executor.all<InsightHourlyRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByBundleIds(adBundleIds: string[], filter?: InsightFilter): Promise<InsightHourly[]> {
    if (adBundleIds.length === 0) return [];

    let builder = select(this.tableName).whereIn('ad_bundle_id', adBundleIds);

    if (filter?.source) {
      builder = builder.where('source', '=', filter.source);
    }
    if (filter?.from) {
      builder = builder.where('ts_hour', '>=', filter.from);
    }
    if (filter?.to) {
      builder = builder.where('ts_hour', '<=', filter.to);
    }

    builder = builder.orderBy('ts_hour', 'ASC');
    const rows = await this.executor.all<InsightHourlyRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async upsert(input: UpsertInsightHourlyInput): Promise<InsightHourly> {
    const now = new Date().toISOString();
    const metricsJson = JSON.stringify(input.metrics);

    // Use INSERT OR REPLACE for SQLite upsert
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName}
      (ad_bundle_id, ts_hour, metrics_json, source, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    await this.executor.raw(sql, [
      input.adBundleId,
      input.tsHour,
      metricsJson,
      input.source,
      now,
    ]);

    return {
      adBundleId: input.adBundleId,
      tsHour: input.tsHour,
      metricsJson,
      source: input.source,
      updatedAt: now,
    };
  }

  async batchUpsert(inputs: UpsertInsightHourlyInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    const now = new Date().toISOString();
    let count = 0;

    for (const input of inputs) {
      const metricsJson = JSON.stringify(input.metrics);
      const sql = `
        INSERT OR REPLACE INTO ${this.tableName}
        (ad_bundle_id, ts_hour, metrics_json, source, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      await this.executor.raw(sql, [
        input.adBundleId,
        input.tsHour,
        metricsJson,
        input.source,
        now,
      ]);
      count++;
    }

    return count;
  }

  async deleteByBundleId(adBundleId: string): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE ad_bundle_id = ?`;
    const result = await this.executor.raw(sql, [adBundleId]);
    return (result as unknown as { changes?: number }).changes || 0;
  }

  async deleteByDateRange(adBundleId: string, from: string, to: string): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE ad_bundle_id = ? AND ts_hour >= ? AND ts_hour <= ?
    `;
    const result = await this.executor.raw(sql, [adBundleId, from, to]);
    return (result as unknown as { changes?: number }).changes || 0;
  }

  async aggregateByBundleId(
    adBundleId: string,
    filter?: InsightFilter
  ): Promise<AggregatedInsightMetrics> {
    const insights = await this.findByBundleId(adBundleId, filter);
    const metrics = insights.map((i) => JSON.parse(i.metricsJson) as InsightMetrics);
    return calculateAggregatedMetrics(metrics);
  }

  async aggregateByBundleIds(
    adBundleIds: string[],
    filter?: InsightFilter
  ): Promise<Map<string, AggregatedInsightMetrics>> {
    const result = new Map<string, AggregatedInsightMetrics>();

    if (adBundleIds.length === 0) return result;

    const insights = await this.findByBundleIds(adBundleIds, filter);

    // Group by bundle ID
    const groupedMetrics = new Map<string, InsightMetrics[]>();
    for (const insight of insights) {
      const metrics = JSON.parse(insight.metricsJson) as InsightMetrics;
      const existing = groupedMetrics.get(insight.adBundleId) || [];
      existing.push(metrics);
      groupedMetrics.set(insight.adBundleId, existing);
    }

    // Calculate aggregates for each bundle
    for (const [bundleId, metrics] of groupedMetrics) {
      result.set(bundleId, calculateAggregatedMetrics(metrics));
    }

    // Ensure all requested bundles are in result (with zero metrics if no data)
    for (const bundleId of adBundleIds) {
      if (!result.has(bundleId)) {
        result.set(bundleId, calculateAggregatedMetrics([]));
      }
    }

    return result;
  }

  async aggregateTotal(
    adBundleIds: string[],
    filter?: InsightFilter
  ): Promise<AggregatedInsightMetrics> {
    if (adBundleIds.length === 0) return calculateAggregatedMetrics([]);

    const insights = await this.findByBundleIds(adBundleIds, filter);
    const metrics = insights.map((i) => JSON.parse(i.metricsJson) as InsightMetrics);
    return calculateAggregatedMetrics(metrics);
  }
}

/**
 * D1 Insights Daily Repository
 */
export class D1InsightsDailyRepository implements IInsightsDailyRepository {
  private executor: D1Executor;
  private tableName = 'insights_daily';

  constructor(db: D1Database) {
    this.executor = new D1Executor(db);
  }

  private rowToEntity(row: InsightDailyRow): InsightDaily {
    return {
      adBundleId: row.ad_bundle_id,
      dateYyyyMmDd: row.date_yyyy_mm_dd,
      metricsJson: row.metrics_json,
      source: row.source,
      updatedAt: row.updated_at,
    };
  }

  async findByBundleAndDate(adBundleId: string, dateYyyyMmDd: string): Promise<InsightDaily | null> {
    const builder = select(this.tableName)
      .where('ad_bundle_id', '=', adBundleId)
      .where('date_yyyy_mm_dd', '=', dateYyyyMmDd);
    const row = await this.executor.first<InsightDailyRow>(builder);
    return row ? this.rowToEntity(row) : null;
  }

  async findByBundleId(adBundleId: string, filter?: InsightFilter): Promise<InsightDaily[]> {
    let builder = select(this.tableName).where('ad_bundle_id', '=', adBundleId);

    if (filter?.source) {
      builder = builder.where('source', '=', filter.source);
    }
    if (filter?.from) {
      builder = builder.where('date_yyyy_mm_dd', '>=', filter.from);
    }
    if (filter?.to) {
      builder = builder.where('date_yyyy_mm_dd', '<=', filter.to);
    }

    builder = builder.orderBy('date_yyyy_mm_dd', 'ASC');
    const rows = await this.executor.all<InsightDailyRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async findByBundleIds(adBundleIds: string[], filter?: InsightFilter): Promise<InsightDaily[]> {
    if (adBundleIds.length === 0) return [];

    let builder = select(this.tableName).whereIn('ad_bundle_id', adBundleIds);

    if (filter?.source) {
      builder = builder.where('source', '=', filter.source);
    }
    if (filter?.from) {
      builder = builder.where('date_yyyy_mm_dd', '>=', filter.from);
    }
    if (filter?.to) {
      builder = builder.where('date_yyyy_mm_dd', '<=', filter.to);
    }

    builder = builder.orderBy('date_yyyy_mm_dd', 'ASC');
    const rows = await this.executor.all<InsightDailyRow>(builder);
    return rows.map((row) => this.rowToEntity(row));
  }

  async upsert(input: UpsertInsightDailyInput): Promise<InsightDaily> {
    const now = new Date().toISOString();
    const metricsJson = JSON.stringify(input.metrics);

    // Use INSERT OR REPLACE for SQLite upsert
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName}
      (ad_bundle_id, date_yyyy_mm_dd, metrics_json, source, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `;

    await this.executor.raw(sql, [
      input.adBundleId,
      input.dateYyyyMmDd,
      metricsJson,
      input.source,
      now,
    ]);

    return {
      adBundleId: input.adBundleId,
      dateYyyyMmDd: input.dateYyyyMmDd,
      metricsJson,
      source: input.source,
      updatedAt: now,
    };
  }

  async batchUpsert(inputs: UpsertInsightDailyInput[]): Promise<number> {
    if (inputs.length === 0) return 0;

    const now = new Date().toISOString();
    let count = 0;

    for (const input of inputs) {
      const metricsJson = JSON.stringify(input.metrics);
      const sql = `
        INSERT OR REPLACE INTO ${this.tableName}
        (ad_bundle_id, date_yyyy_mm_dd, metrics_json, source, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `;

      await this.executor.raw(sql, [
        input.adBundleId,
        input.dateYyyyMmDd,
        metricsJson,
        input.source,
        now,
      ]);
      count++;
    }

    return count;
  }

  async deleteByBundleId(adBundleId: string): Promise<number> {
    const sql = `DELETE FROM ${this.tableName} WHERE ad_bundle_id = ?`;
    const result = await this.executor.raw(sql, [adBundleId]);
    return (result as unknown as { changes?: number }).changes || 0;
  }

  async deleteByDateRange(adBundleId: string, from: string, to: string): Promise<number> {
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE ad_bundle_id = ? AND date_yyyy_mm_dd >= ? AND date_yyyy_mm_dd <= ?
    `;
    const result = await this.executor.raw(sql, [adBundleId, from, to]);
    return (result as unknown as { changes?: number }).changes || 0;
  }

  async aggregateByBundleId(
    adBundleId: string,
    filter?: InsightFilter
  ): Promise<AggregatedInsightMetrics> {
    const insights = await this.findByBundleId(adBundleId, filter);
    const metrics = insights.map((i) => JSON.parse(i.metricsJson) as InsightMetrics);
    return calculateAggregatedMetrics(metrics);
  }

  async aggregateByBundleIds(
    adBundleIds: string[],
    filter?: InsightFilter
  ): Promise<Map<string, AggregatedInsightMetrics>> {
    const result = new Map<string, AggregatedInsightMetrics>();

    if (adBundleIds.length === 0) return result;

    const insights = await this.findByBundleIds(adBundleIds, filter);

    // Group by bundle ID
    const groupedMetrics = new Map<string, InsightMetrics[]>();
    for (const insight of insights) {
      const metrics = JSON.parse(insight.metricsJson) as InsightMetrics;
      const existing = groupedMetrics.get(insight.adBundleId) || [];
      existing.push(metrics);
      groupedMetrics.set(insight.adBundleId, existing);
    }

    // Calculate aggregates for each bundle
    for (const [bundleId, metrics] of groupedMetrics) {
      result.set(bundleId, calculateAggregatedMetrics(metrics));
    }

    // Ensure all requested bundles are in result (with zero metrics if no data)
    for (const bundleId of adBundleIds) {
      if (!result.has(bundleId)) {
        result.set(bundleId, calculateAggregatedMetrics([]));
      }
    }

    return result;
  }

  async aggregateTotal(
    adBundleIds: string[],
    filter?: InsightFilter
  ): Promise<AggregatedInsightMetrics> {
    if (adBundleIds.length === 0) return calculateAggregatedMetrics([]);

    const insights = await this.findByBundleIds(adBundleIds, filter);
    const metrics = insights.map((i) => JSON.parse(i.metricsJson) as InsightMetrics);
    return calculateAggregatedMetrics(metrics);
  }

  async getDateRange(adBundleIds: string[]): Promise<{ from: string | null; to: string | null }> {
    if (adBundleIds.length === 0) {
      return { from: null, to: null };
    }

    // Using raw SQL for MIN/MAX aggregation
    const placeholders = adBundleIds.map(() => '?').join(',');
    const sql = `
      SELECT
        MIN(date_yyyy_mm_dd) as min_date,
        MAX(date_yyyy_mm_dd) as max_date
      FROM ${this.tableName}
      WHERE ad_bundle_id IN (${placeholders})
    `;

    const rows = await this.executor.raw<{ min_date: string | null; max_date: string | null }>(
      sql,
      adBundleIds
    );

    if (rows.length === 0 || !rows[0]) {
      return { from: null, to: null };
    }

    return {
      from: rows[0].min_date,
      to: rows[0].max_date,
    };
  }
}
