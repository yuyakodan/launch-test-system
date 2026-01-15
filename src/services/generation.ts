/**
 * Generation Service
 * LP, Banner, and Ad Copy generation logic
 *
 * This service handles content generation for marketing assets:
 * - LP (Landing Page) generation with block structure
 * - Banner generation with text layers
 * - Ad copy generation (primary_text, headline, description)
 */

import { ulid } from '../lib/ulid.js';
import type {
  Run,
  Project,
  Intent,
  LpVariant,
  CreativeVariant,
  AdCopy,
  Job,
} from '../types/entities.js';
import type {
  LpBlockType,
  LpBlock,
  FvBlock,
  EmpathyBlock,
  SolutionBlock,
  ProofBlock,
  StepsBlock,
  FaqBlock,
  CtaBlock,
  DisclaimerBlock,
  LpBlocksJson,
  LpThemeJson,
  BannerSize,
  BANNER_DIMENSIONS,
  TextLayer,
  TextLayersJson,
  GenerationJobType,
  GenerationJobPayload,
  GenerationJobResult,
  GenerationOptions,
  GenerationContext,
  AiLpGenerationResult,
  AiBannerGenerationResult,
  AiAdCopyGenerationResult,
} from '../types/generation.js';
import type {
  IIntentRepository,
  ILpVariantRepository,
  ICreativeVariantRepository,
  IAdCopyRepository,
  IRunRepository,
  IProjectRepository,
} from '../repositories/interfaces/index.js';

// ================================
// Types
// ================================

/**
 * Dependencies for GenerationService
 */
export interface GenerationServiceDeps {
  intentRepo: IIntentRepository;
  lpVariantRepo: ILpVariantRepository;
  creativeVariantRepo: ICreativeVariantRepository;
  adCopyRepo: IAdCopyRepository;
  runRepo: IRunRepository;
  projectRepo: IProjectRepository;
  storage?: R2Bucket;
  queue?: Queue<unknown>;
}

/**
 * Result of a single LP variant generation
 */
export interface LpGenerationResult {
  id: string;
  intentId: string;
  version: number;
  blocksJson: string;
  themeJson: string;
}

/**
 * Result of a single banner generation
 */
export interface BannerGenerationResult {
  id: string;
  intentId: string;
  size: BannerSize;
  version: number;
  textLayersJson: string;
  imageR2Key: string;
}

/**
 * Result of a single ad copy generation
 */
export interface AdCopyGenerationResult {
  id: string;
  intentId: string;
  version: number;
  primaryText: string;
  headline: string;
  description: string;
}

/**
 * Complete generation result for an intent
 */
export interface IntentGenerationResult {
  intentId: string;
  lpVariants: LpGenerationResult[];
  banners: BannerGenerationResult[];
  adCopies: AdCopyGenerationResult[];
  errors: Array<{ type: string; message: string }>;
}

// ================================
// Default Constants
// ================================

const DEFAULT_LP_VARIANTS_PER_INTENT = 1;
const DEFAULT_BANNER_SIZES: BannerSize[] = ['1:1', '4:5', '9:16'];
const DEFAULT_AD_COPY_VARIANTS_PER_INTENT = 1;

const LP_BLOCK_ORDER: LpBlockType[] = [
  'fv',
  'empathy',
  'solution',
  'proof',
  'steps',
  'faq',
  'cta',
  'disclaimer',
];

// ================================
// Generation Service
// ================================

/**
 * GenerationService handles LP, Banner, and Ad Copy generation
 */
export class GenerationService {
  private deps: GenerationServiceDeps;

  constructor(deps: GenerationServiceDeps) {
    this.deps = deps;
  }

  /**
   * Submit a generation job to the queue
   */
  async submitGenerationJob(
    runId: string,
    tenantId: string,
    jobType: GenerationJobType,
    intentIds?: string[],
    options?: GenerationOptions
  ): Promise<Job | null> {
    // Verify run exists
    const run = await this.deps.runRepo.findById(runId);
    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // Verify run is in valid state for generation
    const validStatuses = ['Draft', 'Designing', 'Generating'];
    if (!validStatuses.includes(run.status)) {
      throw new Error(`Cannot generate for run in ${run.status} status`);
    }

    // Create job payload
    const payload: GenerationJobPayload = {
      runId,
      tenantId,
      jobType,
      intentIds,
      options,
    };

    // If queue is available, send to queue
    if (this.deps.queue) {
      await this.deps.queue.send({
        type: 'generate',
        payload,
        timestamp: new Date().toISOString(),
      });
    }

    // Return a synthetic job record (actual job creation would be in DB)
    return {
      id: ulid(),
      tenantId,
      jobType: 'generate',
      status: 'queued',
      payloadJson: JSON.stringify(payload),
      resultJson: '{}',
      attempts: 0,
      maxAttempts: 10,
      lastError: '',
      scheduledAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Execute generation for a run
   * This is called by the queue consumer
   */
  async executeGeneration(payload: GenerationJobPayload): Promise<GenerationJobResult> {
    const startTime = Date.now();
    const results: GenerationJobResult = {
      runId: payload.runId,
      generatedAt: new Date().toISOString(),
      lpVariants: [],
      creativeVariants: [],
      adCopies: [],
      errors: [],
      stats: {
        totalGenerated: 0,
        lpCount: 0,
        bannerCount: 0,
        adCopyCount: 0,
        durationMs: 0,
      },
    };

    try {
      // Get run and project context
      const run = await this.deps.runRepo.findById(payload.runId);
      if (!run) {
        throw new Error(`Run not found: ${payload.runId}`);
      }

      const project = await this.deps.projectRepo.findById(run.projectId);
      if (!project) {
        throw new Error(`Project not found: ${run.projectId}`);
      }

      // Get intents to generate for
      let intents: Intent[];
      if (payload.intentIds && payload.intentIds.length > 0) {
        // Generate for specific intents
        intents = [];
        for (const intentId of payload.intentIds) {
          const intent = await this.deps.intentRepo.findById(intentId);
          if (intent && intent.runId === payload.runId) {
            intents.push(intent);
          }
        }
      } else {
        // Generate for all active intents
        const intentResult = await this.deps.intentRepo.findActiveByRunId(payload.runId);
        intents = intentResult.items;
      }

      if (intents.length === 0) {
        results.errors?.push({
          type: 'no_intents',
          message: 'No intents found for generation',
        });
        return results;
      }

      // Generate for each intent
      for (const intent of intents) {
        const intentResult = await this.generateForIntent(
          run,
          project,
          intent,
          payload.jobType,
          payload.options
        );

        // Collect results
        for (const lpVariant of intentResult.lpVariants) {
          results.lpVariants.push({
            id: lpVariant.id,
            intentId: lpVariant.intentId,
            version: lpVariant.version,
          });
          results.stats.lpCount++;
        }

        for (const banner of intentResult.banners) {
          results.creativeVariants.push({
            id: banner.id,
            intentId: banner.intentId,
            size: banner.size,
            version: banner.version,
          });
          results.stats.bannerCount++;
        }

        for (const adCopy of intentResult.adCopies) {
          results.adCopies.push({
            id: adCopy.id,
            intentId: adCopy.intentId,
            version: adCopy.version,
          });
          results.stats.adCopyCount++;
        }

        // Collect errors
        for (const error of intentResult.errors) {
          results.errors?.push({
            ...error,
            intentId: intent.id,
          });
        }
      }

      results.stats.totalGenerated =
        results.stats.lpCount + results.stats.bannerCount + results.stats.adCopyCount;
      results.stats.durationMs = Date.now() - startTime;

      // Update run status to Generating if still in Designing
      if (run.status === 'Designing') {
        await this.deps.runRepo.updateStatus(payload.runId, 'Generating');
      }

      return results;
    } catch (error) {
      results.errors?.push({
        type: 'generation_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      results.stats.durationMs = Date.now() - startTime;
      return results;
    }
  }

  /**
   * Generate all content for a single intent
   */
  async generateForIntent(
    run: Run,
    project: Project,
    intent: Intent,
    jobType: GenerationJobType,
    options?: GenerationOptions
  ): Promise<IntentGenerationResult> {
    const result: IntentGenerationResult = {
      intentId: intent.id,
      lpVariants: [],
      banners: [],
      adCopies: [],
      errors: [],
    };

    // Build generation context
    const context = this.buildGenerationContext(run, project, intent);

    // Generate LP variants
    if (jobType === 'all' || jobType === 'lp') {
      try {
        const lpCount = options?.lpVariantsPerIntent ?? DEFAULT_LP_VARIANTS_PER_INTENT;
        const lpResults = await this.generateLpVariants(intent, context, lpCount);
        result.lpVariants.push(...lpResults);
      } catch (error) {
        result.errors.push({
          type: 'lp_generation_error',
          message: error instanceof Error ? error.message : 'LP generation failed',
        });
      }
    }

    // Generate banners
    if (jobType === 'all' || jobType === 'banner') {
      try {
        const sizes = options?.bannerSizes ?? DEFAULT_BANNER_SIZES;
        const bannerResults = await this.generateBanners(intent, context, sizes);
        result.banners.push(...bannerResults);
      } catch (error) {
        result.errors.push({
          type: 'banner_generation_error',
          message: error instanceof Error ? error.message : 'Banner generation failed',
        });
      }
    }

    // Generate ad copies
    if (jobType === 'all' || jobType === 'ad_copy') {
      try {
        const copyCount = options?.adCopyVariantsPerIntent ?? DEFAULT_AD_COPY_VARIANTS_PER_INTENT;
        const adCopyResults = await this.generateAdCopies(intent, context, copyCount);
        result.adCopies.push(...adCopyResults);
      } catch (error) {
        result.errors.push({
          type: 'ad_copy_generation_error',
          message: error instanceof Error ? error.message : 'Ad copy generation failed',
        });
      }
    }

    return result;
  }

  /**
   * Build generation context from run, project, and intent
   */
  private buildGenerationContext(run: Run, project: Project, intent: Intent): GenerationContext {
    return {
      project: {
        id: project.id,
        name: project.name,
        offerJson: this.safeParseJson(project.offerJson),
        brandJson: this.safeParseJson(project.brandJson),
        ngRulesJson: this.safeParseJson(project.ngRulesJson),
        defaultDisclaimer: project.defaultDisclaimer,
      },
      run: {
        id: run.id,
        name: run.name,
        operationMode: run.operationMode,
        runDesignJson: this.safeParseJson(run.runDesignJson),
        fixedGranularityJson: this.safeParseJson(run.fixedGranularityJson),
      },
      intent: {
        id: intent.id,
        title: intent.title,
        hypothesis: intent.hypothesis,
        evidenceJson: this.safeParseJson(intent.evidenceJson),
        faqJson: this.safeParseJson(intent.faqJson),
      },
    };
  }

  /**
   * Generate LP variants for an intent
   */
  async generateLpVariants(
    intent: Intent,
    context: GenerationContext,
    count: number
  ): Promise<LpGenerationResult[]> {
    const results: LpGenerationResult[] = [];

    for (let i = 0; i < count; i++) {
      // Get next version number
      const version = await this.deps.lpVariantRepo.getNextVersionForIntent(intent.id);

      // Generate LP content (placeholder for AI generation)
      const lpContent = this.generateLpContent(context);

      // Create LP variant in database
      const lpVariant = await this.deps.lpVariantRepo.create({
        intentId: intent.id,
        version,
        status: 'draft',
        blocksJson: JSON.stringify(lpContent.blocks),
        themeJson: JSON.stringify(lpContent.theme),
      });

      results.push({
        id: lpVariant.id,
        intentId: lpVariant.intentId,
        version: lpVariant.version,
        blocksJson: lpVariant.blocksJson,
        themeJson: lpVariant.themeJson,
      });
    }

    return results;
  }

  /**
   * Generate LP content (blocks and theme)
   * This is a placeholder that generates structured content
   * In production, this would call Claude API for intelligent generation
   */
  private generateLpContent(context: GenerationContext): { blocks: LpBlocksJson; theme: LpThemeJson } {
    const blocks: LpBlock[] = [];

    // Generate FV (FirstView) block
    const fvBlock: FvBlock = {
      type: 'fv',
      headline: context.intent.title,
      subHeadline: context.intent.hypothesis || `${context.project.name}で解決`,
      ctaText: '今すぐ始める',
    };
    blocks.push(fvBlock);

    // Generate Empathy block
    const empathyBlock: EmpathyBlock = {
      type: 'empathy',
      headline: 'こんなお悩みありませんか？',
      painPoints: [
        { text: '課題1に困っている' },
        { text: '課題2がうまくいかない' },
        { text: '課題3で悩んでいる' },
      ],
    };
    blocks.push(empathyBlock);

    // Generate Solution block
    const solutionBlock: SolutionBlock = {
      type: 'solution',
      headline: '解決策',
      description: context.intent.hypothesis || 'お客様の課題を解決します',
      features: [
        { title: '特徴1', description: '説明1' },
        { title: '特徴2', description: '説明2' },
        { title: '特徴3', description: '説明3' },
      ],
    };
    blocks.push(solutionBlock);

    // Generate Proof block
    const proofBlock: ProofBlock = {
      type: 'proof',
      headline: '実績・エビデンス',
      items: [
        { proofType: 'number', value: '98%', label: '顧客満足度' },
        { proofType: 'number', value: '10,000+', label: '導入実績' },
      ],
    };
    blocks.push(proofBlock);

    // Generate Steps block
    const stepsBlock: StepsBlock = {
      type: 'steps',
      headline: 'ご利用の流れ',
      steps: [
        { stepNumber: 1, title: 'お申し込み', description: 'フォームからお申し込み' },
        { stepNumber: 2, title: 'ご説明', description: '担当者からご連絡' },
        { stepNumber: 3, title: 'ご利用開始', description: 'すぐにご利用いただけます' },
      ],
    };
    blocks.push(stepsBlock);

    // Generate FAQ block from intent
    const faqData = context.intent.faqJson as Record<string, unknown>;
    const faqItems = Array.isArray(faqData?.items)
      ? (faqData.items as Array<{ question: string; answer: string }>)
      : [
          { question: 'よくある質問1', answer: '回答1' },
          { question: 'よくある質問2', answer: '回答2' },
        ];
    const faqBlock: FaqBlock = {
      type: 'faq',
      headline: 'よくあるご質問',
      items: faqItems,
    };
    blocks.push(faqBlock);

    // Generate CTA block
    const ctaBlock: CtaBlock = {
      type: 'cta',
      headline: '今すぐお試しください',
      buttonText: '無料で始める',
      urgencyText: '期間限定',
    };
    blocks.push(ctaBlock);

    // Generate Disclaimer block
    const disclaimerBlock: DisclaimerBlock = {
      type: 'disclaimer',
      text: context.project.defaultDisclaimer || '※本サービスに関する注意事項',
    };
    blocks.push(disclaimerBlock);

    const blocksJson: LpBlocksJson = {
      version: '1.0',
      blocks,
      meta: {
        generatedAt: new Date().toISOString(),
        intentId: context.intent.id,
      },
    };

    // Generate theme
    const theme: LpThemeJson = {
      version: '1.0',
      colors: {
        primary: '#2563eb',
        secondary: '#1e40af',
        accent: '#f59e0b',
        background: '#ffffff',
        text: '#1f2937',
        textMuted: '#6b7280',
      },
      typography: {
        fontFamily: 'Noto Sans JP, sans-serif',
        baseFontSize: '16px',
        lineHeight: 1.6,
      },
      spacing: {
        sectionPadding: '64px',
        blockGap: '32px',
      },
      borderRadius: '8px',
    };

    return { blocks: blocksJson, theme };
  }

  /**
   * Generate banners for an intent
   */
  async generateBanners(
    intent: Intent,
    context: GenerationContext,
    sizes: BannerSize[]
  ): Promise<BannerGenerationResult[]> {
    const results: BannerGenerationResult[] = [];

    for (const size of sizes) {
      // Get next version number for this size
      const version = await this.deps.creativeVariantRepo.getNextVersionForIntentAndSize(
        intent.id,
        size
      );

      // Generate banner content (placeholder for AI generation)
      const bannerContent = this.generateBannerContent(context, size);

      // Generate placeholder image R2 key
      // In production, this would actually create/store an image
      const imageR2Key = `banners/${intent.id}/${size.replace(':', 'x')}_v${version}_${ulid()}.png`;

      // Upload placeholder to R2 if storage is available
      if (this.deps.storage) {
        // Create a placeholder image metadata
        const metadata = JSON.stringify({
          intentId: intent.id,
          size,
          version,
          generatedAt: new Date().toISOString(),
        });
        await this.deps.storage.put(imageR2Key, metadata, {
          customMetadata: {
            contentType: 'image/png',
            status: 'placeholder',
          },
        });
      }

      // Create creative variant in database
      const creativeVariant = await this.deps.creativeVariantRepo.create({
        intentId: intent.id,
        size,
        version,
        status: 'draft',
        textLayersJson: JSON.stringify(bannerContent),
        imageR2Key,
      });

      results.push({
        id: creativeVariant.id,
        intentId: creativeVariant.intentId,
        size: creativeVariant.size,
        version: creativeVariant.version,
        textLayersJson: creativeVariant.textLayersJson,
        imageR2Key: creativeVariant.imageR2Key,
      });
    }

    return results;
  }

  /**
   * Generate banner content (text layers)
   * This is a placeholder that generates structured content
   * In production, this would call Claude API for intelligent generation
   */
  private generateBannerContent(context: GenerationContext, size: BannerSize): TextLayersJson {
    const dimensions = this.getBannerDimensions(size);
    const layers: TextLayer[] = [];

    // Headline layer
    layers.push({
      id: ulid(),
      layerType: 'headline',
      text: context.intent.title,
      position: {
        x: dimensions.width * 0.1,
        y: dimensions.height * 0.3,
        width: dimensions.width * 0.8,
        height: dimensions.height * 0.2,
        alignment: 'center',
      },
      style: {
        fontFamily: 'Noto Sans JP',
        fontSize: Math.floor(dimensions.width * 0.05),
        fontWeight: 700,
        color: '#ffffff',
        textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
      },
    });

    // Benefit layer
    layers.push({
      id: ulid(),
      layerType: 'benefit',
      text: context.intent.hypothesis || 'お客様の課題を解決',
      position: {
        x: dimensions.width * 0.1,
        y: dimensions.height * 0.5,
        width: dimensions.width * 0.8,
        height: dimensions.height * 0.1,
        alignment: 'center',
      },
      style: {
        fontFamily: 'Noto Sans JP',
        fontSize: Math.floor(dimensions.width * 0.03),
        fontWeight: 400,
        color: '#ffffff',
      },
    });

    // CTA layer
    layers.push({
      id: ulid(),
      layerType: 'cta',
      text: '詳しくはこちら',
      position: {
        x: dimensions.width * 0.25,
        y: dimensions.height * 0.7,
        width: dimensions.width * 0.5,
        height: dimensions.height * 0.1,
        alignment: 'center',
      },
      style: {
        fontFamily: 'Noto Sans JP',
        fontSize: Math.floor(dimensions.width * 0.035),
        fontWeight: 600,
        color: '#ffffff',
        backgroundColor: '#f59e0b',
        padding: 16,
        borderRadius: 8,
      },
    });

    return {
      version: '1.0',
      size,
      layers,
      meta: {
        generatedAt: new Date().toISOString(),
        intentId: context.intent.id,
      },
    };
  }

  /**
   * Get banner dimensions for a size
   */
  private getBannerDimensions(size: BannerSize): { width: number; height: number } {
    const dimensions: Record<BannerSize, { width: number; height: number }> = {
      '1:1': { width: 1080, height: 1080 },
      '4:5': { width: 1080, height: 1350 },
      '9:16': { width: 1080, height: 1920 },
    };
    return dimensions[size];
  }

  /**
   * Generate ad copies for an intent
   */
  async generateAdCopies(
    intent: Intent,
    context: GenerationContext,
    count: number
  ): Promise<AdCopyGenerationResult[]> {
    const results: AdCopyGenerationResult[] = [];

    for (let i = 0; i < count; i++) {
      // Get next version number
      const version = await this.deps.adCopyRepo.getNextVersionForIntent(intent.id);

      // Generate ad copy content (placeholder for AI generation)
      const adCopyContent = this.generateAdCopyContent(context);

      // Create ad copy in database
      const adCopy = await this.deps.adCopyRepo.create({
        intentId: intent.id,
        version,
        status: 'draft',
        primaryText: adCopyContent.primaryText,
        headline: adCopyContent.headline,
        description: adCopyContent.description,
      });

      results.push({
        id: adCopy.id,
        intentId: adCopy.intentId,
        version: adCopy.version,
        primaryText: adCopy.primaryText,
        headline: adCopy.headline,
        description: adCopy.description,
      });
    }

    return results;
  }

  /**
   * Generate ad copy content
   * This is a placeholder that generates structured content
   * In production, this would call Claude API for intelligent generation
   */
  private generateAdCopyContent(context: GenerationContext): {
    primaryText: string;
    headline: string;
    description: string;
  } {
    // Extract offer info if available
    const offerJson = context.project.offerJson as Record<string, unknown>;
    const offerName = (offerJson?.name as string) || context.project.name;

    return {
      primaryText: `${context.intent.title}\n\n${context.intent.hypothesis || 'お客様の課題を解決するサービスです。'}\n\n今すぐお試しください。`,
      headline: offerName,
      description: context.intent.hypothesis || 'まずは無料でお試しください。',
    };
  }

  /**
   * Safely parse JSON string
   */
  private safeParseJson(jsonString: string): Record<string, unknown> {
    try {
      return JSON.parse(jsonString) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

// ================================
// Factory Function
// ================================

/**
 * Create a GenerationService instance
 */
export function createGenerationService(deps: GenerationServiceDeps): GenerationService {
  return new GenerationService(deps);
}
