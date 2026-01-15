/**
 * Generation Types
 * Type definitions for LP, Banner, and Ad Copy generation
 */

// ================================
// LP Block Types
// ================================

/**
 * LP Block types based on requirements
 * fv (FirstView), empathy, solution, proof, steps, faq, cta, disclaimer
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
 * FirstView (FV) Block
 */
export interface FvBlock {
  type: 'fv';
  headline: string;
  subHeadline?: string;
  eyeCatch?: string;
  ctaText?: string;
  ctaUrl?: string;
  backgroundImageR2Key?: string;
}

/**
 * Empathy Block
 */
export interface EmpathyBlock {
  type: 'empathy';
  headline?: string;
  painPoints: Array<{
    icon?: string;
    text: string;
  }>;
}

/**
 * Solution Block
 */
export interface SolutionBlock {
  type: 'solution';
  headline?: string;
  description: string;
  features: Array<{
    icon?: string;
    title: string;
    description: string;
  }>;
}

/**
 * Proof Block (Evidence/Social Proof)
 */
export interface ProofBlock {
  type: 'proof';
  headline?: string;
  items: Array<{
    proofType: 'number' | 'case_study' | 'testimonial' | 'third_party' | 'logo';
    value?: string;
    label?: string;
    description?: string;
    imageR2Key?: string;
    sourceUrl?: string;
  }>;
}

/**
 * Steps Block
 */
export interface StepsBlock {
  type: 'steps';
  headline?: string;
  steps: Array<{
    stepNumber: number;
    title: string;
    description: string;
    icon?: string;
  }>;
}

/**
 * FAQ Block
 */
export interface FaqBlock {
  type: 'faq';
  headline?: string;
  items: Array<{
    question: string;
    answer: string;
  }>;
}

/**
 * CTA Block
 */
export interface CtaBlock {
  type: 'cta';
  headline?: string;
  subHeadline?: string;
  buttonText: string;
  buttonUrl?: string;
  urgencyText?: string;
}

/**
 * Disclaimer Block
 */
export interface DisclaimerBlock {
  type: 'disclaimer';
  text: string;
  links?: Array<{
    label: string;
    url: string;
  }>;
}

/**
 * Union type for all LP blocks
 */
export type LpBlock =
  | FvBlock
  | EmpathyBlock
  | SolutionBlock
  | ProofBlock
  | StepsBlock
  | FaqBlock
  | CtaBlock
  | DisclaimerBlock;

/**
 * LP Blocks JSON structure
 * Stored in lp_variants.blocks_json
 */
export interface LpBlocksJson {
  version: string;
  blocks: LpBlock[];
  meta?: {
    generatedAt?: string;
    intentId?: string;
    promptVersion?: string;
  };
}

// ================================
// LP Theme Types
// ================================

/**
 * Color scheme for LP theme
 */
export interface ColorScheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  textMuted: string;
}

/**
 * Typography settings
 */
export interface Typography {
  fontFamily: string;
  headingFontFamily?: string;
  baseFontSize: string;
  lineHeight: number;
}

/**
 * LP Theme JSON structure
 * Stored in lp_variants.theme_json
 */
export interface LpThemeJson {
  version: string;
  templateId?: string;
  colors: ColorScheme;
  typography: Typography;
  spacing?: {
    sectionPadding: string;
    blockGap: string;
  };
  borderRadius?: string;
  customCss?: string;
}

// ================================
// Banner (Creative Variant) Types
// ================================

/**
 * Banner sizes as defined in requirements
 */
export type BannerSize = '1:1' | '4:5' | '9:16';

/**
 * Banner size dimensions in pixels
 */
export const BANNER_DIMENSIONS: Record<BannerSize, { width: number; height: number }> = {
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '9:16': { width: 1080, height: 1920 },
};

/**
 * Text layer position
 */
export interface TextLayerPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  alignment?: 'left' | 'center' | 'right';
  verticalAlignment?: 'top' | 'middle' | 'bottom';
}

/**
 * Text layer style
 */
export interface TextLayerStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight?: number;
  color: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textShadow?: string;
}

/**
 * Single text layer in banner
 */
export interface TextLayer {
  id: string;
  layerType: 'headline' | 'subheadline' | 'body' | 'cta' | 'benefit' | 'custom';
  text: string;
  position: TextLayerPosition;
  style: TextLayerStyle;
  visible?: boolean;
}

/**
 * Text layers JSON structure
 * Stored in creative_variants.text_layers_json
 */
export interface TextLayersJson {
  version: string;
  size: BannerSize;
  layers: TextLayer[];
  template?: {
    templateId: string;
    templateVersion: number;
  };
  meta?: {
    generatedAt?: string;
    intentId?: string;
    promptVersion?: string;
  };
}

// ================================
// Ad Copy Types
// ================================

/**
 * Ad copy content structure
 */
export interface AdCopyContent {
  primaryText: string;
  headline: string;
  description: string;
}

/**
 * Generated ad copy result
 */
export interface GeneratedAdCopy extends AdCopyContent {
  intentId: string;
  version: number;
  meta?: {
    generatedAt: string;
    promptVersion?: string;
    variations?: string[];
  };
}

// ================================
// Generation Job Types
// ================================

/**
 * Generation job types
 */
export type GenerationJobType = 'lp' | 'banner' | 'ad_copy' | 'all';

/**
 * Generation job status
 */
export type GenerationJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

/**
 * Generation job payload
 */
export interface GenerationJobPayload {
  runId: string;
  tenantId: string;
  jobType: GenerationJobType;
  intentIds?: string[];
  options?: GenerationOptions;
}

/**
 * Generation options
 */
export interface GenerationOptions {
  /** Number of LP variants to generate per intent */
  lpVariantsPerIntent?: number;
  /** Banner sizes to generate */
  bannerSizes?: BannerSize[];
  /** Number of ad copy variants per intent */
  adCopyVariantsPerIntent?: number;
  /** Whether to use fixed granularity settings */
  useFixedGranularity?: boolean;
  /** Custom prompt overrides */
  promptOverrides?: {
    lpPrompt?: string;
    bannerPrompt?: string;
    adCopyPrompt?: string;
  };
}

/**
 * Generation job result
 */
export interface GenerationJobResult {
  runId: string;
  generatedAt: string;
  lpVariants: Array<{
    id: string;
    intentId: string;
    version: number;
  }>;
  creativeVariants: Array<{
    id: string;
    intentId: string;
    size: BannerSize;
    version: number;
  }>;
  adCopies: Array<{
    id: string;
    intentId: string;
    version: number;
  }>;
  errors?: Array<{
    type: string;
    message: string;
    intentId?: string;
  }>;
  stats: {
    totalGenerated: number;
    lpCount: number;
    bannerCount: number;
    adCopyCount: number;
    durationMs: number;
  };
}

// ================================
// Generation Request/Response Types
// ================================

/**
 * POST /runs/:runId/generate request body
 */
export interface GenerateRequest {
  /** Type of content to generate */
  jobType: GenerationJobType;
  /** Specific intents to generate for (optional, all active if not specified) */
  intentIds?: string[];
  /** Generation options */
  options?: GenerationOptions;
}

/**
 * POST /runs/:runId/generate response
 */
export interface GenerateResponse {
  status: 'ok' | 'error';
  data?: {
    jobId: string;
    runId: string;
    jobType: GenerationJobType;
    status: GenerationJobStatus;
    createdAt: string;
  };
  error?: string;
  message?: string;
}

/**
 * GET /runs/:runId/jobs response item
 */
export interface GenerationJobInfo {
  id: string;
  runId: string;
  jobType: string;
  status: GenerationJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  result?: GenerationJobResult;
}

/**
 * GET /runs/:runId/jobs response
 */
export interface ListJobsResponse {
  status: 'ok' | 'error';
  data?: {
    items: GenerationJobInfo[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
  error?: string;
  message?: string;
}

// ================================
// AI Generation Context Types
// ================================

/**
 * Context for AI generation prompts
 */
export interface GenerationContext {
  // Project context
  project: {
    id: string;
    name: string;
    offerJson: Record<string, unknown>;
    brandJson: Record<string, unknown>;
    ngRulesJson: Record<string, unknown>;
    defaultDisclaimer: string;
  };
  // Run context
  run: {
    id: string;
    name: string;
    operationMode: string;
    runDesignJson: Record<string, unknown>;
    fixedGranularityJson: Record<string, unknown>;
  };
  // Intent context
  intent: {
    id: string;
    title: string;
    hypothesis: string;
    evidenceJson: Record<string, unknown>;
    faqJson: Record<string, unknown>;
  };
  // Previous variants (for iteration)
  previousVariants?: {
    lpVariants?: Array<{
      id: string;
      blocksJson: Record<string, unknown>;
      qaResultJson?: Record<string, unknown>;
    }>;
    creativeVariants?: Array<{
      id: string;
      textLayersJson: Record<string, unknown>;
    }>;
    adCopies?: Array<{
      id: string;
      primaryText: string;
      headline: string;
      description: string;
    }>;
  };
}

/**
 * AI generation result for LP
 */
export interface AiLpGenerationResult {
  blocks: LpBlock[];
  theme: LpThemeJson;
  confidence: number;
  reasoning?: string;
}

/**
 * AI generation result for Banner
 */
export interface AiBannerGenerationResult {
  textLayers: TextLayer[];
  imagePrompt?: string;
  confidence: number;
  reasoning?: string;
}

/**
 * AI generation result for Ad Copy
 */
export interface AiAdCopyGenerationResult {
  primaryText: string;
  headline: string;
  description: string;
  confidence: number;
  reasoning?: string;
  alternatives?: AdCopyContent[];
}
