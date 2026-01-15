/**
 * Next Run Generation Service
 * Based on requirements.md section 9 - Fixed/Explore Granularity
 *
 * Responsibilities:
 * - Validate fixed granularity configuration
 * - Generate next run based on fixed/explore settings
 * - Copy locked elements without modification
 * - Generate diff log for changed elements
 */

import { ulid } from '../lib/ulid.js';
import type { Run } from '../types/entities.js';
import type {
  FixedGranularityConfig,
  IntentFixed,
  LpFixed,
  BannerFixed,
  AdCopyFixed,
  IntentExplore,
  LpExplore,
  BannerExplore,
  DiffLog,
  DiffEntry,
  GenerateNextRunRequest,
  GenerateNextRunResult,
  FixedGranularityValidationResult,
  FixedGranularityValidationError,
  LpBlockType,
  LockedSize,
} from '../types/next-run.js';
import {
  DEFAULT_FIXED_GRANULARITY_CONFIG,
  VALID_LP_BLOCK_TYPES,
  VALID_LOCKED_SIZES,
} from '../types/next-run.js';
import type {
  IRunRepository,
  IIntentRepository,
  ILpVariantRepository,
  ICreativeVariantRepository,
  IAdCopyRepository,
  CreateRunInput,
  CreateIntentInput,
  CreateLpVariantInput,
  CreateCreativeVariantInput,
  CreateAdCopyInput,
} from '../repositories/interfaces/index.js';

// ================================
// Validation
// ================================

/**
 * Validate fixed granularity configuration
 */
export function validateFixedGranularity(
  config: unknown
): FixedGranularityValidationResult {
  const errors: FixedGranularityValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: [{ path: '', message: 'Config must be an object' }],
    };
  }

  const cfg = config as Record<string, unknown>;

  // Validate version
  if (!cfg.version || typeof cfg.version !== 'string') {
    errors.push({ path: 'version', message: 'version is required and must be a string' });
  } else if (!/^1\.(0|[1-9]\d*)$/.test(cfg.version)) {
    errors.push({
      path: 'version',
      message: 'version must match pattern ^1\\.(0|[1-9]\\d*)$',
      value: cfg.version,
    });
  }

  // Validate fixed section
  if (cfg.fixed !== undefined) {
    if (typeof cfg.fixed !== 'object' || cfg.fixed === null) {
      errors.push({ path: 'fixed', message: 'fixed must be an object' });
    } else {
      validateFixedSettings(cfg.fixed as Record<string, unknown>, errors);
    }
  }

  // Validate explore section
  if (cfg.explore !== undefined) {
    if (typeof cfg.explore !== 'object' || cfg.explore === null) {
      errors.push({ path: 'explore', message: 'explore must be an object' });
    } else {
      validateExploreSettings(cfg.explore as Record<string, unknown>, errors);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Return normalized config
  const normalized = normalizeFixedGranularityConfig(cfg);
  return { valid: true, errors: [], normalized };
}

/**
 * Validate fixed settings section
 */
function validateFixedSettings(
  fixed: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  // Validate intent fixed settings
  if (fixed.intent !== undefined) {
    validateIntentFixed(fixed.intent as Record<string, unknown>, errors);
  }

  // Validate lp fixed settings
  if (fixed.lp !== undefined) {
    validateLpFixed(fixed.lp as Record<string, unknown>, errors);
  }

  // Validate banner fixed settings
  if (fixed.banner !== undefined) {
    validateBannerFixed(fixed.banner as Record<string, unknown>, errors);
  }

  // Validate ad_copy fixed settings
  if (fixed.ad_copy !== undefined) {
    validateAdCopyFixed(fixed.ad_copy as Record<string, unknown>, errors);
  }
}

/**
 * Validate intent fixed settings
 */
function validateIntentFixed(
  intent: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (intent.lock_intent_ids !== undefined) {
    if (!Array.isArray(intent.lock_intent_ids)) {
      errors.push({
        path: 'fixed.intent.lock_intent_ids',
        message: 'lock_intent_ids must be an array',
      });
    } else {
      for (let i = 0; i < intent.lock_intent_ids.length; i++) {
        if (typeof intent.lock_intent_ids[i] !== 'string' || intent.lock_intent_ids[i].length === 0) {
          errors.push({
            path: `fixed.intent.lock_intent_ids[${i}]`,
            message: 'Each lock_intent_id must be a non-empty string',
          });
        }
      }
    }
  }
}

/**
 * Validate LP fixed settings
 */
function validateLpFixed(
  lp: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (lp.lock_structure !== undefined && typeof lp.lock_structure !== 'boolean') {
    errors.push({
      path: 'fixed.lp.lock_structure',
      message: 'lock_structure must be a boolean',
    });
  }

  if (lp.lock_theme !== undefined && typeof lp.lock_theme !== 'boolean') {
    errors.push({
      path: 'fixed.lp.lock_theme',
      message: 'lock_theme must be a boolean',
    });
  }

  if (lp.lock_blocks !== undefined) {
    if (!Array.isArray(lp.lock_blocks)) {
      errors.push({
        path: 'fixed.lp.lock_blocks',
        message: 'lock_blocks must be an array',
      });
    } else {
      for (let i = 0; i < lp.lock_blocks.length; i++) {
        const block = lp.lock_blocks[i] as string;
        if (!VALID_LP_BLOCK_TYPES.includes(block as LpBlockType)) {
          errors.push({
            path: `fixed.lp.lock_blocks[${i}]`,
            message: `Invalid block type: ${block}. Valid types: ${VALID_LP_BLOCK_TYPES.join(', ')}`,
          });
        }
      }
    }
  }

  if (lp.lock_copy_paths !== undefined) {
    if (!Array.isArray(lp.lock_copy_paths)) {
      errors.push({
        path: 'fixed.lp.lock_copy_paths',
        message: 'lock_copy_paths must be an array',
      });
    } else {
      for (let i = 0; i < lp.lock_copy_paths.length; i++) {
        if (typeof lp.lock_copy_paths[i] !== 'string' || lp.lock_copy_paths[i].length === 0) {
          errors.push({
            path: `fixed.lp.lock_copy_paths[${i}]`,
            message: 'Each lock_copy_path must be a non-empty string',
          });
        }
      }
    }
  }
}

/**
 * Validate banner fixed settings
 */
function validateBannerFixed(
  banner: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (banner.lock_template !== undefined && typeof banner.lock_template !== 'boolean') {
    errors.push({
      path: 'fixed.banner.lock_template',
      message: 'lock_template must be a boolean',
    });
  }

  if (banner.lock_image_layout !== undefined && typeof banner.lock_image_layout !== 'boolean') {
    errors.push({
      path: 'fixed.banner.lock_image_layout',
      message: 'lock_image_layout must be a boolean',
    });
  }

  if (banner.lock_text_layers !== undefined && typeof banner.lock_text_layers !== 'boolean') {
    errors.push({
      path: 'fixed.banner.lock_text_layers',
      message: 'lock_text_layers must be a boolean',
    });
  }

  if (banner.lock_sizes !== undefined) {
    if (!Array.isArray(banner.lock_sizes)) {
      errors.push({
        path: 'fixed.banner.lock_sizes',
        message: 'lock_sizes must be an array',
      });
    } else {
      for (let i = 0; i < banner.lock_sizes.length; i++) {
        const size = banner.lock_sizes[i] as string;
        if (!VALID_LOCKED_SIZES.includes(size as LockedSize)) {
          errors.push({
            path: `fixed.banner.lock_sizes[${i}]`,
            message: `Invalid size: ${size}. Valid sizes: ${VALID_LOCKED_SIZES.join(', ')}`,
          });
        }
      }
    }
  }
}

/**
 * Validate ad copy fixed settings
 */
function validateAdCopyFixed(
  adCopy: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (adCopy.lock_primary_text !== undefined && typeof adCopy.lock_primary_text !== 'boolean') {
    errors.push({
      path: 'fixed.ad_copy.lock_primary_text',
      message: 'lock_primary_text must be a boolean',
    });
  }

  if (adCopy.lock_headline !== undefined && typeof adCopy.lock_headline !== 'boolean') {
    errors.push({
      path: 'fixed.ad_copy.lock_headline',
      message: 'lock_headline must be a boolean',
    });
  }

  if (adCopy.lock_description !== undefined && typeof adCopy.lock_description !== 'boolean') {
    errors.push({
      path: 'fixed.ad_copy.lock_description',
      message: 'lock_description must be a boolean',
    });
  }
}

/**
 * Validate explore settings section
 */
function validateExploreSettings(
  explore: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  // Validate intent explore settings
  if (explore.intent !== undefined) {
    validateIntentExplore(explore.intent as Record<string, unknown>, errors);
  }

  // Validate lp explore settings
  if (explore.lp !== undefined) {
    validateLpExplore(explore.lp as Record<string, unknown>, errors);
  }

  // Validate banner explore settings
  if (explore.banner !== undefined) {
    validateBannerExplore(explore.banner as Record<string, unknown>, errors);
  }
}

/**
 * Validate intent explore settings
 */
function validateIntentExplore(
  intent: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (intent.max_new_intents !== undefined) {
    if (typeof intent.max_new_intents !== 'number' || intent.max_new_intents < 0) {
      errors.push({
        path: 'explore.intent.max_new_intents',
        message: 'max_new_intents must be a non-negative number',
      });
    }
  }

  if (intent.allow_replace_intents !== undefined && typeof intent.allow_replace_intents !== 'boolean') {
    errors.push({
      path: 'explore.intent.allow_replace_intents',
      message: 'allow_replace_intents must be a boolean',
    });
  }
}

/**
 * Validate LP explore settings
 */
function validateLpExplore(
  lp: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (lp.max_new_fv_copies !== undefined) {
    if (typeof lp.max_new_fv_copies !== 'number' || lp.max_new_fv_copies < 0) {
      errors.push({
        path: 'explore.lp.max_new_fv_copies',
        message: 'max_new_fv_copies must be a non-negative number',
      });
    }
  }

  if (lp.max_new_cta_copies !== undefined) {
    if (typeof lp.max_new_cta_copies !== 'number' || lp.max_new_cta_copies < 0) {
      errors.push({
        path: 'explore.lp.max_new_cta_copies',
        message: 'max_new_cta_copies must be a non-negative number',
      });
    }
  }

  if (lp.allow_block_reorder !== undefined && typeof lp.allow_block_reorder !== 'boolean') {
    errors.push({
      path: 'explore.lp.allow_block_reorder',
      message: 'allow_block_reorder must be a boolean',
    });
  }
}

/**
 * Validate banner explore settings
 */
function validateBannerExplore(
  banner: Record<string, unknown>,
  errors: FixedGranularityValidationError[]
): void {
  if (banner.max_new_text_variants !== undefined) {
    if (typeof banner.max_new_text_variants !== 'number' || banner.max_new_text_variants < 0) {
      errors.push({
        path: 'explore.banner.max_new_text_variants',
        message: 'max_new_text_variants must be a non-negative number',
      });
    }
  }

  if (banner.allow_new_templates !== undefined && typeof banner.allow_new_templates !== 'boolean') {
    errors.push({
      path: 'explore.banner.allow_new_templates',
      message: 'allow_new_templates must be a boolean',
    });
  }
}

/**
 * Normalize fixed granularity config with defaults
 */
export function normalizeFixedGranularityConfig(
  config: Record<string, unknown>
): FixedGranularityConfig {
  const fixed = (config.fixed ?? {}) as Record<string, unknown>;
  const explore = (config.explore ?? {}) as Record<string, unknown>;

  return {
    version: (config.version as string) ?? '1.0',
    fixed: {
      intent: normalizeIntentFixed(fixed.intent as Record<string, unknown> | undefined),
      lp: normalizeLpFixed(fixed.lp as Record<string, unknown> | undefined),
      banner: normalizeBannerFixed(fixed.banner as Record<string, unknown> | undefined),
      ad_copy: normalizeAdCopyFixed(fixed.ad_copy as Record<string, unknown> | undefined),
    },
    explore: {
      intent: normalizeIntentExplore(explore.intent as Record<string, unknown> | undefined),
      lp: normalizeLpExplore(explore.lp as Record<string, unknown> | undefined),
      banner: normalizeBannerExplore(explore.banner as Record<string, unknown> | undefined),
    },
  };
}

function normalizeIntentFixed(intent?: Record<string, unknown>): IntentFixed {
  return {
    lock_intent_ids: (intent?.lock_intent_ids as string[]) ?? [],
  };
}

function normalizeLpFixed(lp?: Record<string, unknown>): LpFixed {
  return {
    lock_structure: (lp?.lock_structure as boolean) ?? false,
    lock_theme: (lp?.lock_theme as boolean) ?? false,
    lock_blocks: (lp?.lock_blocks as LpBlockType[]) ?? [],
    lock_copy_paths: (lp?.lock_copy_paths as string[]) ?? [],
  };
}

function normalizeBannerFixed(banner?: Record<string, unknown>): BannerFixed {
  return {
    lock_template: (banner?.lock_template as boolean) ?? false,
    lock_image_layout: (banner?.lock_image_layout as boolean) ?? false,
    lock_text_layers: (banner?.lock_text_layers as boolean) ?? false,
    lock_sizes: (banner?.lock_sizes as LockedSize[]) ?? [],
  };
}

function normalizeAdCopyFixed(adCopy?: Record<string, unknown>): AdCopyFixed {
  return {
    lock_primary_text: (adCopy?.lock_primary_text as boolean) ?? false,
    lock_headline: (adCopy?.lock_headline as boolean) ?? false,
    lock_description: (adCopy?.lock_description as boolean) ?? false,
  };
}

function normalizeIntentExplore(intent?: Record<string, unknown>): IntentExplore {
  return {
    max_new_intents: (intent?.max_new_intents as number) ?? 1,
    allow_replace_intents: (intent?.allow_replace_intents as boolean) ?? true,
  };
}

function normalizeLpExplore(lp?: Record<string, unknown>): LpExplore {
  return {
    max_new_fv_copies: (lp?.max_new_fv_copies as number) ?? 3,
    max_new_cta_copies: (lp?.max_new_cta_copies as number) ?? 2,
    allow_block_reorder: (lp?.allow_block_reorder as boolean) ?? false,
  };
}

function normalizeBannerExplore(banner?: Record<string, unknown>): BannerExplore {
  return {
    max_new_text_variants: (banner?.max_new_text_variants as number) ?? 6,
    allow_new_templates: (banner?.allow_new_templates as boolean) ?? true,
  };
}

// ================================
// Next Run Service
// ================================

/**
 * Repository dependencies for NextRunService
 */
export interface NextRunServiceDependencies {
  runRepository: IRunRepository;
  intentRepository: IIntentRepository;
  lpVariantRepository: ILpVariantRepository;
  creativeVariantRepository: ICreativeVariantRepository;
  adCopyRepository: IAdCopyRepository;
}

/**
 * Next Run Generation Service
 */
export class NextRunService {
  private deps: NextRunServiceDependencies;

  constructor(deps: NextRunServiceDependencies) {
    this.deps = deps;
  }

  /**
   * Generate next run based on source run and fixed/explore settings
   *
   * Rules from requirements:
   * - Fixed elements are copied without any changes
   * - Explore elements generate diff log for tracking
   * - Locked intent IDs are carried over exactly
   */
  async generateNextRun(
    sourceRunId: string,
    request: GenerateNextRunRequest,
    userId?: string
  ): Promise<GenerateNextRunResult> {
    const now = new Date().toISOString();
    const diffLog: DiffLog = {
      sourceRunId,
      targetRunId: '', // Will be set after run creation
      fixedConfig: DEFAULT_FIXED_GRANULARITY_CONFIG,
      changes: [],
      generatedAt: now,
    };

    // 1. Fetch source run
    const sourceRun = await this.deps.runRepository.findById(sourceRunId);
    if (!sourceRun) {
      throw new Error(`Source run not found: ${sourceRunId}`);
    }

    // 2. Parse and merge fixed granularity config
    let fixedConfig = this.parseFixedGranularityConfig(sourceRun.fixedGranularityJson);
    if (request.fixedGranularityOverrides) {
      fixedConfig = this.mergeFixedGranularityConfig(fixedConfig, request.fixedGranularityOverrides);
    }
    diffLog.fixedConfig = fixedConfig;

    // 3. Create new run
    const newRunId = ulid();
    diffLog.targetRunId = newRunId;

    const newRunName = request.name ?? `${sourceRun.name} - Next`;
    const newRun = await this.deps.runRepository.create({
      id: newRunId,
      projectId: sourceRun.projectId,
      name: newRunName,
      status: 'Draft',
      operationMode: sourceRun.operationMode,
      runDesignJson: sourceRun.runDesignJson,
      stopDslJson: sourceRun.stopDslJson,
      fixedGranularityJson: JSON.stringify(fixedConfig),
      decisionRulesJson: sourceRun.decisionRulesJson,
      createdByUserId: userId ?? null,
    });

    // 4. Copy/generate intents based on fixed/explore settings
    const intentResult = await this.processIntents(
      sourceRun,
      newRun,
      fixedConfig,
      request,
      diffLog
    );

    // 5. Process LP variants, creative variants, and ad copies for each intent
    const variantResult = await this.processVariants(
      intentResult.sourceToTargetIntentMap,
      fixedConfig,
      request.autoApproveCarryOver ?? false,
      diffLog
    );

    return {
      runId: newRun.id,
      name: newRun.name,
      diffLog,
      summary: {
        intentsCarried: intentResult.intentsCarried,
        intentsAdded: intentResult.intentsAdded,
        lpVariantsCarried: variantResult.lpVariantsCarried,
        lpVariantsGenerated: variantResult.lpVariantsGenerated,
        creativeVariantsCarried: variantResult.creativeVariantsCarried,
        creativeVariantsGenerated: variantResult.creativeVariantsGenerated,
        adCopiesCarried: variantResult.adCopiesCarried,
        adCopiesGenerated: variantResult.adCopiesGenerated,
      },
    };
  }

  /**
   * Parse fixed granularity config from JSON string
   */
  private parseFixedGranularityConfig(json: string): FixedGranularityConfig {
    try {
      const parsed = JSON.parse(json);
      const validation = validateFixedGranularity(parsed);
      if (validation.valid && validation.normalized) {
        return validation.normalized;
      }
    } catch {
      // Fall through to default
    }
    return { ...DEFAULT_FIXED_GRANULARITY_CONFIG };
  }

  /**
   * Merge fixed granularity configs
   */
  private mergeFixedGranularityConfig(
    base: FixedGranularityConfig,
    overrides: Partial<FixedGranularityConfig>
  ): FixedGranularityConfig {
    const mergedFixed: FixedGranularityConfig['fixed'] = {
      intent: base.fixed.intent
        ? { ...base.fixed.intent, ...(overrides.fixed?.intent ?? {}) }
        : undefined,
      lp: base.fixed.lp
        ? { ...base.fixed.lp, ...(overrides.fixed?.lp ?? {}) }
        : undefined,
      banner: base.fixed.banner
        ? { ...base.fixed.banner, ...(overrides.fixed?.banner ?? {}) }
        : undefined,
      ad_copy: base.fixed.ad_copy
        ? { ...base.fixed.ad_copy, ...(overrides.fixed?.ad_copy ?? {}) }
        : undefined,
    };

    const mergedExplore: FixedGranularityConfig['explore'] = {
      intent: base.explore.intent
        ? { ...base.explore.intent, ...(overrides.explore?.intent ?? {}) }
        : undefined,
      lp: base.explore.lp
        ? { ...base.explore.lp, ...(overrides.explore?.lp ?? {}) }
        : undefined,
      banner: base.explore.banner
        ? { ...base.explore.banner, ...(overrides.explore?.banner ?? {}) }
        : undefined,
    };

    return {
      version: overrides.version ?? base.version,
      fixed: mergedFixed,
      explore: mergedExplore,
    };
  }

  /**
   * Process intents - copy locked ones, optionally add new ones
   */
  private async processIntents(
    sourceRun: Run,
    targetRun: Run,
    config: FixedGranularityConfig,
    request: GenerateNextRunRequest,
    diffLog: DiffLog
  ): Promise<{
    intentsCarried: number;
    intentsAdded: number;
    sourceToTargetIntentMap: Map<string, string>;
  }> {
    const sourceToTargetIntentMap = new Map<string, string>();
    let intentsCarried = 0;
    let intentsAdded = 0;

    // Fetch source intents
    const sourceIntentsResult = await this.deps.intentRepository.findByRunId(sourceRun.id);
    const sourceIntents = sourceIntentsResult.items;

    const lockedIntentIds = new Set(config.fixed.intent?.lock_intent_ids ?? []);

    // Copy all active intents (locked ones are copied as-is)
    for (const sourceIntent of sourceIntents) {
      if (sourceIntent.status === 'archived') {
        continue; // Skip archived intents
      }

      const newIntentId = ulid();
      const isLocked = lockedIntentIds.has(sourceIntent.id);

      await this.deps.intentRepository.create({
        id: newIntentId,
        runId: targetRun.id,
        title: sourceIntent.title,
        hypothesis: sourceIntent.hypothesis,
        evidenceJson: sourceIntent.evidenceJson,
        faqJson: sourceIntent.faqJson,
        priority: sourceIntent.priority,
        status: 'active',
      });

      sourceToTargetIntentMap.set(sourceIntent.id, newIntentId);
      intentsCarried++;

      // Log if not locked (indicates carry-over without explicit lock)
      if (!isLocked) {
        this.addDiffEntry(diffLog, {
          type: 'intent_added',
          target: `intent:${newIntentId}`,
          from: null,
          to: { id: newIntentId, title: sourceIntent.title },
          reason: 'Carried over from source run (not explicitly locked)',
        });
      }
    }

    // Add new intents if requested and allowed
    const maxNewIntents = config.explore.intent?.max_new_intents ?? 1;
    const newIntentsToAdd = request.newIntents ?? [];

    for (let i = 0; i < Math.min(newIntentsToAdd.length, maxNewIntents); i++) {
      const newIntent = newIntentsToAdd[i];
      const newIntentId = ulid();

      await this.deps.intentRepository.create({
        id: newIntentId,
        runId: targetRun.id,
        title: newIntent.title,
        hypothesis: newIntent.hypothesis ?? '',
        status: 'active',
      });

      intentsAdded++;

      this.addDiffEntry(diffLog, {
        type: 'intent_added',
        target: `intent:${newIntentId}`,
        from: null,
        to: { id: newIntentId, title: newIntent.title },
        reason: 'New intent added based on explore settings',
      });
    }

    return { intentsCarried, intentsAdded, sourceToTargetIntentMap };
  }

  /**
   * Process variants for all intents
   */
  private async processVariants(
    sourceToTargetIntentMap: Map<string, string>,
    config: FixedGranularityConfig,
    autoApprove: boolean,
    diffLog: DiffLog
  ): Promise<{
    lpVariantsCarried: number;
    lpVariantsGenerated: number;
    creativeVariantsCarried: number;
    creativeVariantsGenerated: number;
    adCopiesCarried: number;
    adCopiesGenerated: number;
  }> {
    let lpVariantsCarried = 0;
    let lpVariantsGenerated = 0;
    let creativeVariantsCarried = 0;
    let creativeVariantsGenerated = 0;
    let adCopiesCarried = 0;
    let adCopiesGenerated = 0;

    for (const [sourceIntentId, targetIntentId] of sourceToTargetIntentMap) {
      // Process LP Variants
      const lpResult = await this.processLpVariants(
        sourceIntentId,
        targetIntentId,
        config,
        autoApprove,
        diffLog
      );
      lpVariantsCarried += lpResult.carried;
      lpVariantsGenerated += lpResult.generated;

      // Process Creative Variants
      const creativeResult = await this.processCreativeVariants(
        sourceIntentId,
        targetIntentId,
        config,
        autoApprove,
        diffLog
      );
      creativeVariantsCarried += creativeResult.carried;
      creativeVariantsGenerated += creativeResult.generated;

      // Process Ad Copies
      const adCopyResult = await this.processAdCopies(
        sourceIntentId,
        targetIntentId,
        config,
        autoApprove,
        diffLog
      );
      adCopiesCarried += adCopyResult.carried;
      adCopiesGenerated += adCopyResult.generated;
    }

    return {
      lpVariantsCarried,
      lpVariantsGenerated,
      creativeVariantsCarried,
      creativeVariantsGenerated,
      adCopiesCarried,
      adCopiesGenerated,
    };
  }

  /**
   * Process LP variants for an intent
   */
  private async processLpVariants(
    sourceIntentId: string,
    targetIntentId: string,
    config: FixedGranularityConfig,
    autoApprove: boolean,
    diffLog: DiffLog
  ): Promise<{ carried: number; generated: number }> {
    let carried = 0;
    const generated = 0;

    const lpFixed = config.fixed.lp;
    const sourceVariantsResult = await this.deps.lpVariantRepository.findByIntentId(sourceIntentId);

    for (const sourceVariant of sourceVariantsResult.items) {
      if (sourceVariant.status === 'archived') {
        continue;
      }

      // Copy variant with potentially modified content based on lock settings
      const newVariantId = ulid();
      let blocksJson = sourceVariant.blocksJson;
      let themeJson = sourceVariant.themeJson;

      // If structure is locked, copy blocks as-is
      // If theme is locked, copy theme as-is
      // Otherwise, these could be modified by generation logic (placeholder for future AI integration)

      const createInput: CreateLpVariantInput = {
        id: newVariantId,
        intentId: targetIntentId,
        version: 1,
        status: 'draft',
        blocksJson,
        themeJson,
        qaResultJson: '{}', // Reset QA for new run
        approvalStatus: autoApprove && sourceVariant.approvalStatus === 'approved' ? 'approved' : 'draft',
      };

      await this.deps.lpVariantRepository.create(createInput);
      carried++;

      // Log the carry-over
      const lockInfo = [];
      if (lpFixed?.lock_structure) lockInfo.push('structure');
      if (lpFixed?.lock_theme) lockInfo.push('theme');
      if ((lpFixed?.lock_blocks ?? []).length > 0) lockInfo.push(`blocks:${lpFixed!.lock_blocks.join(',')}`);

      this.addDiffEntry(diffLog, {
        type: 'fv_copy_generated',
        target: `lp_variant:${newVariantId}`,
        from: { id: sourceVariant.id },
        to: { id: newVariantId },
        reason: lockInfo.length > 0
          ? `Carried over with locks: ${lockInfo.join(', ')}`
          : 'Carried over without explicit locks',
      });
    }

    return { carried, generated };
  }

  /**
   * Process creative variants for an intent
   */
  private async processCreativeVariants(
    sourceIntentId: string,
    targetIntentId: string,
    config: FixedGranularityConfig,
    autoApprove: boolean,
    diffLog: DiffLog
  ): Promise<{ carried: number; generated: number }> {
    let carried = 0;
    const generated = 0;

    const bannerFixed = config.fixed.banner;
    const lockedSizes = new Set(bannerFixed?.lock_sizes ?? []);
    const sourceVariantsResult = await this.deps.creativeVariantRepository.findByIntentId(sourceIntentId);

    for (const sourceVariant of sourceVariantsResult.items) {
      if (sourceVariant.status === 'archived') {
        continue;
      }

      const newVariantId = ulid();
      const isLockedSize = lockedSizes.has(sourceVariant.size as LockedSize);

      const createInput: CreateCreativeVariantInput = {
        id: newVariantId,
        intentId: targetIntentId,
        size: sourceVariant.size,
        version: 1,
        status: 'draft',
        textLayersJson: sourceVariant.textLayersJson,
        imageR2Key: sourceVariant.imageR2Key,
        qaResultJson: '{}',
        approvalStatus: autoApprove && sourceVariant.approvalStatus === 'approved' ? 'approved' : 'draft',
      };

      await this.deps.creativeVariantRepository.create(createInput);
      carried++;

      // Log the carry-over
      const lockInfo = [];
      if (bannerFixed?.lock_template) lockInfo.push('template');
      if (bannerFixed?.lock_image_layout) lockInfo.push('image_layout');
      if (bannerFixed?.lock_text_layers) lockInfo.push('text_layers');
      if (isLockedSize) lockInfo.push(`size:${sourceVariant.size}`);

      this.addDiffEntry(diffLog, {
        type: 'banner_text_generated',
        target: `creative_variant:${newVariantId}`,
        from: { id: sourceVariant.id, size: sourceVariant.size },
        to: { id: newVariantId, size: sourceVariant.size },
        reason: lockInfo.length > 0
          ? `Carried over with locks: ${lockInfo.join(', ')}`
          : 'Carried over without explicit locks',
      });
    }

    return { carried, generated };
  }

  /**
   * Process ad copies for an intent
   */
  private async processAdCopies(
    sourceIntentId: string,
    targetIntentId: string,
    config: FixedGranularityConfig,
    autoApprove: boolean,
    diffLog: DiffLog
  ): Promise<{ carried: number; generated: number }> {
    let carried = 0;
    const generated = 0;

    const adCopyFixed = config.fixed.ad_copy;
    const sourceAdCopiesResult = await this.deps.adCopyRepository.findByIntentId(sourceIntentId);

    for (const sourceAdCopy of sourceAdCopiesResult.items) {
      if (sourceAdCopy.status === 'archived') {
        continue;
      }

      const newAdCopyId = ulid();

      const createInput: CreateAdCopyInput = {
        id: newAdCopyId,
        intentId: targetIntentId,
        version: 1,
        status: 'draft',
        primaryText: sourceAdCopy.primaryText,
        headline: sourceAdCopy.headline,
        description: sourceAdCopy.description,
        qaResultJson: '{}',
        approvalStatus: autoApprove && sourceAdCopy.approvalStatus === 'approved' ? 'approved' : 'draft',
      };

      await this.deps.adCopyRepository.create(createInput);
      carried++;

      // Log the carry-over
      const lockInfo = [];
      if (adCopyFixed?.lock_primary_text) lockInfo.push('primary_text');
      if (adCopyFixed?.lock_headline) lockInfo.push('headline');
      if (adCopyFixed?.lock_description) lockInfo.push('description');

      this.addDiffEntry(diffLog, {
        type: 'cta_copy_generated',
        target: `ad_copy:${newAdCopyId}`,
        from: { id: sourceAdCopy.id },
        to: { id: newAdCopyId },
        reason: lockInfo.length > 0
          ? `Carried over with locks: ${lockInfo.join(', ')}`
          : 'Carried over without explicit locks',
      });
    }

    return { carried, generated };
  }

  /**
   * Add entry to diff log
   */
  private addDiffEntry(
    diffLog: DiffLog,
    entry: Omit<DiffEntry, 'timestamp'>
  ): void {
    diffLog.changes.push({
      ...entry,
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Create NextRunService with dependencies
 */
export function createNextRunService(
  deps: NextRunServiceDependencies
): NextRunService {
  return new NextRunService(deps);
}

// Re-export types for convenience
export type {
  FixedGranularityConfig,
  DiffLog,
  DiffEntry,
  GenerateNextRunRequest,
  GenerateNextRunResult,
  FixedGranularityValidationResult,
  FixedGranularityValidationError,
} from '../types/next-run.js';

// Re-export additional types
export type { FixedSettings, ExploreSettings, ChangeType } from '../types/next-run.js';
