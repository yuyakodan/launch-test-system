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
} from './events/index.js';

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
