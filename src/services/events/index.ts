/**
 * Event Services Module
 */

export { EventProcessor, createEventProcessor } from './event-processor.js';
export {
  parseUtmParams,
  parseUtmContent,
  buildUtmString,
  buildUtmContent,
  isValidUlid,
  extractDomain,
  normalizeUrl,
} from './utm-parser.js';
export {
  createEventRoutes,
  createEventRoutesFromEnv,
} from './routes.js';
export type { EventRoutesConfig, EventRoutesEnv } from './routes.js';
