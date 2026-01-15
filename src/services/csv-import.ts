/**
 * CSV Import Service
 * Handles parsing and validation of CSV files for Manual Mode
 * - insights_csv: cost, clicks, impressions import
 * - mapping_csv: Ad Bundle mapping import
 */

import type {
  InsightsCsvRow,
  MappingCsvRow,
  CsvParseResult,
  CsvRowError,
} from '../types/manual-mode.js';

/**
 * CSV parsing options
 */
export interface CsvParseOptions {
  /** Skip header row (default: true) */
  skipHeader?: boolean;
  /** Delimiter character (default: ',') */
  delimiter?: string;
  /** Allow empty values for optional fields */
  allowEmpty?: boolean;
}

/**
 * Default CSV parse options
 */
const DEFAULT_OPTIONS: CsvParseOptions = {
  skipHeader: true,
  delimiter: ',',
  allowEmpty: true,
};

/**
 * CSV Import Service
 * Provides parsing and validation for Manual Mode CSV imports
 */
export class CsvImportService {
  /**
   * Parse CSV content into rows
   */
  private parseCsvContent(content: string, options: CsvParseOptions): string[][] {
    const delimiter = options.delimiter ?? ',';
    const lines = content.split(/\r?\n/).filter((line) => line.trim() !== '');

    const rows: string[][] = [];
    for (const line of lines) {
      const row = this.parseCsvLine(line, delimiter);
      rows.push(row);
    }

    // Skip header if configured
    if (options.skipHeader && rows.length > 0) {
      rows.shift();
    }

    return rows;
  }

  /**
   * Parse a single CSV line, handling quoted fields
   */
  private parseCsvLine(line: string, delimiter: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          // Escaped quote
          current += '"';
          i++;
        } else if (char === '"') {
          // End of quoted field
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          // Start of quoted field
          inQuotes = true;
        } else if (char === delimiter) {
          // End of field
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }

    // Add last field
    result.push(current.trim());

    return result;
  }

  /**
   * Parse insights CSV content
   * Expected columns: ad_bundle_id|utm_content, date, hour?, cost, clicks, impressions, conversions?, reach?, frequency?
   */
  parseInsightsCsv(
    content: string,
    options: CsvParseOptions = {}
  ): CsvParseResult<InsightsCsvRow> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const rows = this.parseCsvContent(content, opts);

    const result: CsvParseResult<InsightsCsvRow> = {
      success: true,
      rows: [],
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      errors: [],
      warnings: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = opts.skipHeader ? i + 2 : i + 1; // Account for header
      const cols = rows[i];

      const parseResult = this.parseInsightsRow(cols, rowNum);

      if (parseResult.errors.length > 0) {
        result.invalidRows++;
        result.errors.push(...parseResult.errors);
      } else {
        result.validRows++;
        result.rows.push(parseResult.row!);
        if (parseResult.warnings.length > 0) {
          result.warnings.push(...parseResult.warnings);
        }
      }
    }

    result.success = result.invalidRows === 0;
    return result;
  }

  /**
   * Parse a single insights row
   */
  private parseInsightsRow(
    cols: string[],
    rowNum: number
  ): {
    row: InsightsCsvRow | null;
    errors: CsvRowError[];
    warnings: string[];
  } {
    const errors: CsvRowError[] = [];
    const warnings: string[] = [];

    // Minimum required columns: identifier, date, cost, clicks, impressions
    if (cols.length < 5) {
      errors.push({
        row: rowNum,
        field: 'columns',
        message: `Expected at least 5 columns, got ${cols.length}`,
        value: cols.length,
      });
      return { row: null, errors, warnings };
    }

    // Parse identifier (ad_bundle_id or utm_content)
    const identifier = cols[0];
    if (!identifier) {
      errors.push({
        row: rowNum,
        field: 'ad_bundle_id/utm_content',
        message: 'Identifier (ad_bundle_id or utm_content) is required',
      });
    }

    // Parse date
    const dateStr = cols[1];
    if (!dateStr) {
      errors.push({
        row: rowNum,
        field: 'date',
        message: 'Date is required',
      });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      errors.push({
        row: rowNum,
        field: 'date',
        message: 'Date must be in YYYY-MM-DD format',
        value: dateStr,
      });
    }

    // Parse hour (optional, column 2 if present and looks like time)
    let hour: string | undefined;
    let costIndex = 2;

    if (cols.length > 5 && /^\d{2}:\d{2}(:\d{2})?$/.test(cols[2])) {
      hour = cols[2].substring(0, 2) + ':00:00';
      costIndex = 3;
    }

    // Parse cost
    const costStr = cols[costIndex];
    const cost = parseFloat(costStr);
    if (isNaN(cost) || cost < 0) {
      errors.push({
        row: rowNum,
        field: 'cost',
        message: 'Cost must be a non-negative number',
        value: costStr,
      });
    }

    // Parse clicks
    const clicksStr = cols[costIndex + 1];
    const clicks = parseInt(clicksStr, 10);
    if (isNaN(clicks) || clicks < 0) {
      errors.push({
        row: rowNum,
        field: 'clicks',
        message: 'Clicks must be a non-negative integer',
        value: clicksStr,
      });
    }

    // Parse impressions
    const impressionsStr = cols[costIndex + 2];
    const impressions = parseInt(impressionsStr, 10);
    if (isNaN(impressions) || impressions < 0) {
      errors.push({
        row: rowNum,
        field: 'impressions',
        message: 'Impressions must be a non-negative integer',
        value: impressionsStr,
      });
    }

    // Parse optional fields
    let conversions: number | undefined;
    let reach: number | undefined;
    let frequency: number | undefined;

    if (cols.length > costIndex + 3) {
      const val = parseInt(cols[costIndex + 3], 10);
      if (!isNaN(val)) conversions = val;
    }
    if (cols.length > costIndex + 4) {
      const val = parseInt(cols[costIndex + 4], 10);
      if (!isNaN(val)) reach = val;
    }
    if (cols.length > costIndex + 5) {
      const val = parseFloat(cols[costIndex + 5]);
      if (!isNaN(val)) frequency = val;
    }

    if (errors.length > 0) {
      return { row: null, errors, warnings };
    }

    // Determine if identifier is ad_bundle_id or utm_content
    const isUtmContent = identifier.includes('_') && !identifier.match(/^[0-9A-Z]{26}$/);

    const row: InsightsCsvRow = {
      ...(isUtmContent ? { utm_content: identifier } : { ad_bundle_id: identifier }),
      date: dateStr,
      ...(hour && { hour }),
      cost,
      clicks,
      impressions,
      ...(conversions !== undefined && { conversions }),
      ...(reach !== undefined && { reach }),
      ...(frequency !== undefined && { frequency }),
    };

    return { row, errors, warnings };
  }

  /**
   * Parse mapping CSV content
   * Expected columns: ad_bundle_id, meta_campaign_id?, meta_adset_id?, meta_ad_id?, external_ad_name?
   */
  parseMappingCsv(
    content: string,
    options: CsvParseOptions = {}
  ): CsvParseResult<MappingCsvRow> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const rows = this.parseCsvContent(content, opts);

    const result: CsvParseResult<MappingCsvRow> = {
      success: true,
      rows: [],
      totalRows: rows.length,
      validRows: 0,
      invalidRows: 0,
      errors: [],
      warnings: [],
    };

    for (let i = 0; i < rows.length; i++) {
      const rowNum = opts.skipHeader ? i + 2 : i + 1;
      const cols = rows[i];

      const parseResult = this.parseMappingRow(cols, rowNum);

      if (parseResult.errors.length > 0) {
        result.invalidRows++;
        result.errors.push(...parseResult.errors);
      } else {
        result.validRows++;
        result.rows.push(parseResult.row!);
        if (parseResult.warnings.length > 0) {
          result.warnings.push(...parseResult.warnings);
        }
      }
    }

    result.success = result.invalidRows === 0;
    return result;
  }

  /**
   * Parse a single mapping row
   */
  private parseMappingRow(
    cols: string[],
    rowNum: number
  ): {
    row: MappingCsvRow | null;
    errors: CsvRowError[];
    warnings: string[];
  } {
    const errors: CsvRowError[] = [];
    const warnings: string[] = [];

    // Minimum required columns: ad_bundle_id
    if (cols.length < 1) {
      errors.push({
        row: rowNum,
        field: 'columns',
        message: 'Expected at least 1 column (ad_bundle_id)',
        value: cols.length,
      });
      return { row: null, errors, warnings };
    }

    const adBundleId = cols[0];
    if (!adBundleId) {
      errors.push({
        row: rowNum,
        field: 'ad_bundle_id',
        message: 'ad_bundle_id is required',
      });
      return { row: null, errors, warnings };
    }

    // At least one Meta ID should be provided
    const metaCampaignId = cols[1] || undefined;
    const metaAdsetId = cols[2] || undefined;
    const metaAdId = cols[3] || undefined;
    const externalAdName = cols[4] || undefined;

    if (!metaCampaignId && !metaAdsetId && !metaAdId) {
      warnings.push(`Row ${rowNum}: No Meta IDs provided for bundle ${adBundleId}`);
    }

    const row: MappingCsvRow = {
      ad_bundle_id: adBundleId,
      ...(metaCampaignId && { meta_campaign_id: metaCampaignId }),
      ...(metaAdsetId && { meta_adset_id: metaAdsetId }),
      ...(metaAdId && { meta_ad_id: metaAdId }),
      ...(externalAdName && { external_ad_name: externalAdName }),
    };

    return { row, errors, warnings };
  }

  /**
   * Validate that all bundle IDs exist in the system
   */
  validateBundleIds(
    bundleIds: string[],
    existingBundleIds: Set<string>
  ): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    for (const id of bundleIds) {
      if (existingBundleIds.has(id)) {
        valid.push(id);
      } else {
        invalid.push(id);
      }
    }

    return { valid, invalid };
  }

  /**
   * Generate CSV template for insights import
   */
  generateInsightsTemplate(): string {
    const headers = [
      'ad_bundle_id',
      'date',
      'hour',
      'cost',
      'clicks',
      'impressions',
      'conversions',
      'reach',
      'frequency',
    ];
    const exampleRow = [
      '01J3BUNDLE123456789012345',
      '2026-01-13',
      '10:00:00',
      '1000',
      '50',
      '5000',
      '5',
      '4000',
      '1.25',
    ];

    return [headers.join(','), exampleRow.join(',')].join('\n');
  }

  /**
   * Generate CSV template for mapping import
   */
  generateMappingTemplate(): string {
    const headers = [
      'ad_bundle_id',
      'meta_campaign_id',
      'meta_adset_id',
      'meta_ad_id',
      'external_ad_name',
    ];
    const exampleRow = [
      '01J3BUNDLE123456789012345',
      '23847654321',
      '23847654322',
      '23847654323',
      'Campaign A - Intent 1 - Creative 1',
    ];

    return [headers.join(','), exampleRow.join(',')].join('\n');
  }
}

/**
 * Create CSV Import Service instance
 */
export function createCsvImportService(): CsvImportService {
  return new CsvImportService();
}
