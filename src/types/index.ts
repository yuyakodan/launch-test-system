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
