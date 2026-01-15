/**
 * Services exports
 * Centralized exports for all service modules
 */

// Audit service
export {
  AuditService,
  computeHash,
  computeAuditLogHash,
  hashIP,
  createAuditLogHelper,
  type AuditLogEntry,
} from './audit.js';

// Run state machine service
export {
  RunStateMachine,
  createValidationContext,
} from './run-state-machine.js';

// Run checklist service
export {
  RunChecklistService,
  type ChecklistOperationResult,
  type ChecklistSummary,
} from './run-checklist.js';

// Event tracking services
export {
  EventProcessor,
  createEventProcessor,
  parseUtmParams,
  parseUtmContent,
  buildUtmString,
  buildUtmContent,
  isValidUlid,
  extractDomain,
  normalizeUrl,
  createEventRoutes,
  createEventRoutesFromEnv,
} from './events/index.js';
export type { EventRoutesConfig, EventRoutesEnv } from './events/index.js';

// Stop rules DSL services
export {
  DslParser,
  DslParseError,
  createDslParser,
  RuleEvaluator,
  createRuleEvaluator,
  ActionExecutor,
  createActionExecutor,
  createMockDependencies,
  type ActionExecutorDependencies,
  type ActionExecutorContext,
  type NotificationPayload,
  type IncidentPayload,
  type AuditLogPayload,
} from './stop-rules/index.js';

// Stop condition service
export {
  StopConditionService,
  createStopConditionService,
  type EvaluateStopRulesRequest,
  type EvaluateStopRulesResponse,
  type RunEvaluationResult,
  type GetStopRulesResponse,
} from './stop-condition.js';

// Statistics services
export {
  // Wilson CI
  calculateWilsonCi,
  calculateVariantWilsonCi,
  compareVariantsWilsonCi,
  compareAllVariantsWilsonCi,
  isSignificantWinner,
  // Bayesian analysis
  calculateBayesianPosterior,
  calculateWinProbabilities,
  compareBayesian,
  probabilityABeatsB,
  calculateExpectedLoss,
  // Confidence evaluator
  calculateAggregateMetrics,
  isInsufficient,
  isDirectional,
  isConfident,
  determineConfidenceLevel,
  calculateAdditionalSamplesNeeded,
  generateRationale,
  determineRecommendation,
  buildRankingEntries,
  evaluateConfidence,
  createVariantMetrics,
  // Ranking
  sortVariants,
  generateRanking,
  determineWinner,
  isClearWinner,
  analyzeVariants,
  quickAnalysis,
  type SortCriteria,
} from './statistics/index.js';

// Generation service
export {
  GenerationService,
  createGenerationService,
  type GenerationServiceDeps,
  type LpGenerationResult,
  type BannerGenerationResult,
  type AdCopyGenerationResult,
  type IntentGenerationResult,
} from './generation.js';

// Report service
export { ReportService, createReportService } from './report.js';

// Decision service (Statistical Decision Engine)
export {
  DecisionService,
  analyzeVariants as analyzeDecisionVariants,
  parseDecisionConfig,
  DEFAULT_SAMPLE_THRESHOLDS,
  DEFAULT_CONFIDENCE_THRESHOLDS,
  type SampleThresholdsConfig,
  type ConfidenceThresholdsConfig,
  type DecisionConfig,
  type WinnerInfo,
  type VariantRankingEntry,
  type StatsDetails,
  type DecisionAnalysisResult,
} from './decision.js';

// Next run generation service
export {
  NextRunService,
  createNextRunService,
  validateFixedGranularity,
  normalizeFixedGranularityConfig,
} from './next-run.js';

export type {
  NextRunServiceDependencies,
  FixedGranularityConfig,
  FixedSettings,
  ExploreSettings,
  DiffLog,
  DiffEntry,
  ChangeType,
  GenerateNextRunRequest,
  GenerateNextRunResult,
  FixedGranularityValidationResult,
  FixedGranularityValidationError,
} from './next-run.js';

// Re-export constants from types (these are values, not types)
export {
  DEFAULT_FIXED_GRANULARITY_CONFIG,
  VALID_LP_BLOCK_TYPES,
  VALID_LOCKED_SIZES,
} from '../types/next-run.js';

// Jobs service
export {
  JobsService,
  createJobsService,
  type CreateJobOptions,
  type JobExecutionResult,
} from './jobs.js';

// Notification service
export {
  NotificationService,
  createNotificationService,
  type CreateNotificationOptions,
  type NotificationPayload as NotificationServicePayload,
  type EmailNotificationPayload,
  type SlackNotificationPayload,
  type WebhookNotificationPayload,
} from './notification.js';

// CSV Import service
export {
  CsvImportService,
  createCsvImportService,
  type CsvParseOptions,
} from './csv-import.js';

// Manual Mode service
export {
  ManualModeService,
  createManualModeService,
  type ManualModeServiceDependencies,
  type EventCounts,
} from './manual-mode.js';

// Incident service
export {
  IncidentService,
  createIncidentService,
  type IncidentServiceDependencies,
  type IncidentServiceContext,
} from './incident.js';
