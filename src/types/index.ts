/**
 * 型定義モジュール
 */

export type {
  BlockedPattern,
  ClaimRequiresEvidence,
  NormalizationOptions,
  NgRules,
  QaIssue,
  QaCheckResult,
  SchemaValidationResult,
} from './qa.js';

export type {
  EventPayload,
  EventBatchPayload,
  EventResponse,
  EventBatchResponse,
  EventIngestResponse,
  ParsedUtmParams,
  ProcessedEvent,
  EventValidationError,
  EventValidationResult,
  EventProcessorConfig,
} from './events.js';

export {
  EVENT_PROTOCOL_VERSION,
  SUPPORTED_EVENT_TYPES,
  DEFAULT_EVENT_PROCESSOR_CONFIG,
} from './events.js';

// Stop Rules DSL types
export type {
  RuleType,
  ActionType,
  SeverityLevel,
  IncidentType,
  IncidentSeverity,
  GatingConditions,
  BaseRule,
  SpendTotalCapRule,
  SpendDailyCapRule,
  CpaCapRule,
  CvZeroDurationRule,
  MeasurementAnomalyRule,
  MetaRejectedRule,
  SyncFailureStreakRule,
  StopRule,
  StopRulesDsl,
  GlobalSettings,
  NotificationChannel,
  EvaluationContext,
  BundleMetrics,
  RuleEvaluationResult,
  DslEvaluationResult,
  ActionToExecute,
  ActionExecutionResult,
  AffectedEntity,
  DslValidationResult,
  DslValidationError,
  DslValidationWarning,
} from './stop-rules.js';

export {
  DEFAULT_DSL_CONFIG,
  SUPPORTED_RULE_TYPES,
  SUPPORTED_ACTION_TYPES,
  SEVERITY_LEVELS,
} from './stop-rules.js';

// Statistics types
export type {
  ConfidenceLevel,
  SampleThresholds,
  VariantMetrics,
  WilsonCiResult,
  WilsonCiComparison,
  BayesianVariantResult,
  BayesianComparison,
  RankingEntry,
  DecisionResult,
  StatisticsResult,
  StatisticsConfig,
} from './statistics.js';

export {
  DEFAULT_SAMPLE_THRESHOLDS,
  INSUFFICIENT_THRESHOLDS,
  DEFAULT_STATISTICS_CONFIG,
} from './statistics.js';

// Report types
export type {
  VariantPerformance,
  IntentPerformance,
  BudgetInfo,
  PeriodInfo,
  StatisticalDecision,
  AdditionalBudgetProposal,
  NextRunProposal,
  RunReport,
  GenerateReportRequest,
  ReportJobPayload,
  ReportGenerationResult,
} from './report.js';

// Generation types
export type {
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
  ColorScheme,
  Typography,
  BannerSize,
  TextLayer,
  TextLayerPosition,
  TextLayerStyle,
  TextLayersJson,
  AdCopyContent,
  GeneratedAdCopy,
  GenerationJobType,
  GenerationJobStatus,
  GenerationJobPayload,
  GenerationOptions,
  GenerationJobResult,
  GenerateRequest,
  GenerateResponse,
  GenerationJobInfo,
  ListJobsResponse,
  GenerationContext,
  AiLpGenerationResult,
  AiBannerGenerationResult,
  AiAdCopyGenerationResult,
} from './generation.js';

export { BANNER_DIMENSIONS } from './generation.js';

// Next Run types
export type {
  LpBlockType as NextRunLpBlockType,
  LockedSize,
  IntentFixed,
  LpFixed,
  BannerFixed,
  AdCopyFixed,
  FixedSettings,
  IntentExplore,
  LpExplore,
  BannerExplore,
  ExploreSettings,
  FixedGranularityConfig,
  ChangeType,
  DiffEntry,
  DiffLog,
  GenerateNextRunRequest,
  GenerateNextRunResult,
  SetFixedGranularityRequest,
  FixedGranularityValidationError,
  FixedGranularityValidationResult,
} from './next-run.js';

export {
  DEFAULT_INTENT_FIXED,
  DEFAULT_LP_FIXED,
  DEFAULT_BANNER_FIXED,
  DEFAULT_AD_COPY_FIXED,
  DEFAULT_INTENT_EXPLORE,
  DEFAULT_LP_EXPLORE,
  DEFAULT_BANNER_EXPLORE,
  DEFAULT_FIXED_GRANULARITY_CONFIG,
  VALID_LP_BLOCK_TYPES,
  VALID_LOCKED_SIZES,
} from './next-run.js';

// Manual Mode types
export type {
  InsightsCsvRow,
  MappingCsvRow,
  CsvParseResult,
  CsvRowError,
  RegisterAdBundleRequest,
  GeneratedAdBundle,
  ImportMetricsRequest,
  ImportMetricsResult,
  BundleImportSummary,
  AggregatedMetrics,
  EventMetrics,
  CombinedMetrics,
  MetricsAggregationLevel,
  GetMetricsParams,
  RunMetricsResponse,
  VariantMetricsBreakdown,
  UtmConfig,
  TrackingUrls,
} from './manual-mode.js';

// Incident types
export type {
  RejectedReasonCategory,
  RejectedReason,
  IncidentMeta,
  CreateIncidentRequest,
  UpdateIncidentRequest,
  ResolveIncidentRequest,
  IncidentWithMeta,
  IncidentListResponse,
  IncidentActionResult,
  IncidentType as IncidentTypeEntity,
  IncidentSeverity as IncidentSeverityEntity,
  IncidentStatus as IncidentStatusEntity,
} from './incident.js';
