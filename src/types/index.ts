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
