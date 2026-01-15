/**
 * Next Run Generation Types
 * Based on requirements.md section 9 and JSON Schema 3-c
 */

// ================================
// Fixed Granularity Types
// ================================

/**
 * LP Block types that can be locked
 */
export type LpBlockType =
  | 'fv'
  | 'empathy'
  | 'solution'
  | 'proof'
  | 'steps'
  | 'faq'
  | 'cta'
  | 'disclaimer';

/**
 * Creative sizes that can be locked
 */
export type LockedSize = '1:1' | '4:5' | '9:16';

/**
 * Intent fixed granularity settings
 */
export interface IntentFixed {
  /** Intent IDs to lock for next run (keep same messaging angles) */
  lock_intent_ids: string[];
}

/**
 * LP fixed granularity settings
 */
export interface LpFixed {
  /** Lock the overall LP structure (block order) */
  lock_structure: boolean;
  /** Lock the theme/design template */
  lock_theme: boolean;
  /** Specific blocks to lock (fv, proof, faq, etc.) */
  lock_blocks: LpBlockType[];
  /** JSONPath-like paths to lock specific copy elements (e.g., blocks.fv.headline) */
  lock_copy_paths: string[];
}

/**
 * Banner/Creative fixed granularity settings
 */
export interface BannerFixed {
  /** Lock the banner template */
  lock_template: boolean;
  /** Lock the image layout/composition */
  lock_image_layout: boolean;
  /** Lock all text layers */
  lock_text_layers: boolean;
  /** Lock specific sizes */
  lock_sizes: LockedSize[];
}

/**
 * Ad Copy fixed granularity settings
 */
export interface AdCopyFixed {
  /** Lock primary text */
  lock_primary_text: boolean;
  /** Lock headline */
  lock_headline: boolean;
  /** Lock description */
  lock_description: boolean;
}

/**
 * Combined fixed settings
 */
export interface FixedSettings {
  intent?: IntentFixed;
  lp?: LpFixed;
  banner?: BannerFixed;
  ad_copy?: AdCopyFixed;
}

// ================================
// Explore Types
// ================================

/**
 * Intent exploration settings
 */
export interface IntentExplore {
  /** Maximum number of new intents to add */
  max_new_intents: number;
  /** Allow replacing existing intents */
  allow_replace_intents: boolean;
}

/**
 * LP exploration settings
 */
export interface LpExplore {
  /** Maximum new FV copy variations */
  max_new_fv_copies: number;
  /** Maximum new CTA copy variations */
  max_new_cta_copies: number;
  /** Allow reordering blocks */
  allow_block_reorder: boolean;
}

/**
 * Banner exploration settings
 */
export interface BannerExplore {
  /** Maximum new text variants for banners */
  max_new_text_variants: number;
  /** Allow using new templates */
  allow_new_templates: boolean;
}

/**
 * Combined explore settings
 */
export interface ExploreSettings {
  intent?: IntentExplore;
  lp?: LpExplore;
  banner?: BannerExplore;
}

// ================================
// Fixed Granularity Schema (JSON)
// ================================

/**
 * Full fixed granularity configuration
 * Maps to runs.fixed_granularity_json
 */
export interface FixedGranularityConfig {
  version: string;
  fixed: FixedSettings;
  explore: ExploreSettings;
}

// ================================
// Difference Log Types
// ================================

/**
 * Types of changes that can occur
 */
export type ChangeType =
  | 'intent_added'
  | 'intent_replaced'
  | 'fv_copy_generated'
  | 'cta_copy_generated'
  | 'faq_replaced'
  | 'banner_text_generated'
  | 'proof_updated'
  | 'block_reordered';

/**
 * Single difference entry
 */
export interface DiffEntry {
  /** Type of change */
  type: ChangeType;
  /** What was changed */
  target: string;
  /** Original value (null if new) */
  from: unknown | null;
  /** New value */
  to: unknown;
  /** Why this change was made */
  reason: string;
  /** Timestamp of change */
  timestamp: string;
}

/**
 * Complete difference log for next run generation
 */
export interface DiffLog {
  /** Source run ID */
  sourceRunId: string;
  /** Generated run ID */
  targetRunId: string;
  /** Fixed granularity config used */
  fixedConfig: FixedGranularityConfig;
  /** All changes made */
  changes: DiffEntry[];
  /** Generation timestamp */
  generatedAt: string;
}

// ================================
// Next Run Generation Types
// ================================

/**
 * Request to generate next run
 */
export interface GenerateNextRunRequest {
  /** Optional name for the new run (defaults to "[source name] - Next") */
  name?: string;
  /** Fixed granularity overrides (merged with source run's config) */
  fixedGranularityOverrides?: Partial<FixedGranularityConfig>;
  /** Specific intents to add (if explore allows) */
  newIntents?: Array<{
    title: string;
    hypothesis?: string;
  }>;
  /** Whether to auto-approve copied elements */
  autoApproveCarryOver?: boolean;
}

/**
 * Result of next run generation
 */
export interface GenerateNextRunResult {
  /** New run ID */
  runId: string;
  /** New run name */
  name: string;
  /** Difference log */
  diffLog: DiffLog;
  /** Summary of what was generated */
  summary: {
    intentsCarried: number;
    intentsAdded: number;
    lpVariantsCarried: number;
    lpVariantsGenerated: number;
    creativeVariantsCarried: number;
    creativeVariantsGenerated: number;
    adCopiesCarried: number;
    adCopiesGenerated: number;
  };
}

/**
 * Request to set fixed granularity
 */
export interface SetFixedGranularityRequest {
  fixedGranularityJson: string;
}

// ================================
// Validation Types
// ================================

/**
 * Validation error for fixed granularity config
 */
export interface FixedGranularityValidationError {
  path: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result for fixed granularity config
 */
export interface FixedGranularityValidationResult {
  valid: boolean;
  errors: FixedGranularityValidationError[];
  normalized?: FixedGranularityConfig;
}

// ================================
// Default Values
// ================================

/**
 * Default intent fixed settings
 */
export const DEFAULT_INTENT_FIXED: IntentFixed = {
  lock_intent_ids: [],
};

/**
 * Default LP fixed settings
 */
export const DEFAULT_LP_FIXED: LpFixed = {
  lock_structure: false,
  lock_theme: false,
  lock_blocks: [],
  lock_copy_paths: [],
};

/**
 * Default banner fixed settings
 */
export const DEFAULT_BANNER_FIXED: BannerFixed = {
  lock_template: false,
  lock_image_layout: false,
  lock_text_layers: false,
  lock_sizes: [],
};

/**
 * Default ad copy fixed settings
 */
export const DEFAULT_AD_COPY_FIXED: AdCopyFixed = {
  lock_primary_text: false,
  lock_headline: false,
  lock_description: false,
};

/**
 * Default intent explore settings
 */
export const DEFAULT_INTENT_EXPLORE: IntentExplore = {
  max_new_intents: 1,
  allow_replace_intents: true,
};

/**
 * Default LP explore settings
 */
export const DEFAULT_LP_EXPLORE: LpExplore = {
  max_new_fv_copies: 3,
  max_new_cta_copies: 2,
  allow_block_reorder: false,
};

/**
 * Default banner explore settings
 */
export const DEFAULT_BANNER_EXPLORE: BannerExplore = {
  max_new_text_variants: 6,
  allow_new_templates: true,
};

/**
 * Default fixed granularity config
 */
export const DEFAULT_FIXED_GRANULARITY_CONFIG: FixedGranularityConfig = {
  version: '1.0',
  fixed: {
    intent: DEFAULT_INTENT_FIXED,
    lp: DEFAULT_LP_FIXED,
    banner: DEFAULT_BANNER_FIXED,
    ad_copy: DEFAULT_AD_COPY_FIXED,
  },
  explore: {
    intent: DEFAULT_INTENT_EXPLORE,
    lp: DEFAULT_LP_EXPLORE,
    banner: DEFAULT_BANNER_EXPLORE,
  },
};

/**
 * Valid LP block types for validation
 */
export const VALID_LP_BLOCK_TYPES: readonly LpBlockType[] = [
  'fv',
  'empathy',
  'solution',
  'proof',
  'steps',
  'faq',
  'cta',
  'disclaimer',
] as const;

/**
 * Valid creative sizes for validation
 */
export const VALID_LOCKED_SIZES: readonly LockedSize[] = [
  '1:1',
  '4:5',
  '9:16',
] as const;
