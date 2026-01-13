/**
 * ULID (Universally Unique Lexicographically Sortable Identifier) Generator
 *
 * Format: TTTTTTTTTTRRRRRRRRRRRRRRRRR (26 characters)
 * - T: Timestamp (10 chars, 48-bit, millisecond precision)
 * - R: Randomness (16 chars, 80-bit)
 *
 * Encoding: Crockford's Base32 (excludes I, L, O, U)
 */

// Crockford's Base32 alphabet (excludes I, L, O, U for readability)
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

/**
 * Generates a cryptographically random integer within range [0, max)
 */
function randomInt(max: number): number {
  const randomBuffer = new Uint32Array(1);
  crypto.getRandomValues(randomBuffer);
  return randomBuffer[0] % max;
}

/**
 * Encodes timestamp to ULID time component
 */
function encodeTime(timestamp: number): string {
  if (timestamp < 0 || timestamp > 281474976710655) {
    throw new Error('Timestamp must be between 0 and 281474976710655');
  }

  let str = '';
  let time = timestamp;

  for (let i = TIME_LEN - 1; i >= 0; i--) {
    const mod = time % ENCODING_LEN;
    str = ENCODING[mod] + str;
    time = Math.floor(time / ENCODING_LEN);
  }

  return str;
}

/**
 * Generates random component of ULID
 */
function encodeRandom(): string {
  let str = '';

  for (let i = 0; i < RANDOM_LEN; i++) {
    str += ENCODING[randomInt(ENCODING_LEN)];
  }

  return str;
}

/**
 * Generates a new ULID
 *
 * @param timestamp - Optional timestamp in milliseconds (defaults to Date.now())
 * @returns 26-character ULID string
 *
 * @example
 * ```typescript
 * const id = ulid();
 * // => "01ARZ3NDEKTSV4RRFFQ69G5FAV"
 *
 * const customTime = ulid(1469918176385);
 * // => "01ARYZ6S410Z4RRFFQ69G5FAV"
 * ```
 */
export function ulid(timestamp?: number): string {
  const time = timestamp ?? Date.now();
  return encodeTime(time) + encodeRandom();
}

/**
 * Extracts the timestamp from a ULID
 *
 * @param id - ULID string
 * @returns Timestamp in milliseconds
 *
 * @example
 * ```typescript
 * const timestamp = decodeTime("01ARZ3NDEKTSV4RRFFQ69G5FAV");
 * // => 1469918176385
 * ```
 */
export function decodeTime(id: string): number {
  if (id.length !== 26) {
    throw new Error('ULID must be 26 characters long');
  }

  const timeStr = id.substring(0, TIME_LEN).toUpperCase();
  let timestamp = 0;

  for (let i = 0; i < TIME_LEN; i++) {
    const char = timeStr[i];
    const index = ENCODING.indexOf(char);

    if (index === -1) {
      throw new Error(`Invalid ULID character: ${char}`);
    }

    timestamp = timestamp * ENCODING_LEN + index;
  }

  return timestamp;
}

/**
 * Validates a ULID string
 *
 * @param id - String to validate
 * @returns true if valid ULID
 */
export function isValidUlid(id: string): boolean {
  if (typeof id !== 'string' || id.length !== 26) {
    return false;
  }

  const upperCased = id.toUpperCase();

  for (let i = 0; i < 26; i++) {
    if (ENCODING.indexOf(upperCased[i]) === -1) {
      return false;
    }
  }

  return true;
}

/**
 * Compares two ULIDs for sorting
 *
 * @param a - First ULID
 * @param b - Second ULID
 * @returns Negative if a < b, positive if a > b, 0 if equal
 */
export function compareUlid(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Generates a monotonically increasing ULID factory
 * Ensures ULIDs generated in the same millisecond are still sortable
 */
export function monotonicFactory(): (timestamp?: number) => string {
  let lastTime = 0;
  let lastRandom = '';

  return (timestamp?: number): string => {
    const time = timestamp ?? Date.now();

    if (time === lastTime) {
      // Same millisecond: increment random component
      lastRandom = incrementBase32(lastRandom);
      return encodeTime(time) + lastRandom;
    }

    // New millisecond: generate fresh random
    lastTime = time;
    lastRandom = encodeRandom();
    return encodeTime(time) + lastRandom;
  };
}

/**
 * Increments a base32 string by 1
 */
function incrementBase32(str: string): string {
  const chars = str.split('');

  for (let i = chars.length - 1; i >= 0; i--) {
    const index = ENCODING.indexOf(chars[i]);
    if (index < ENCODING_LEN - 1) {
      chars[i] = ENCODING[index + 1];
      return chars.join('');
    }
    chars[i] = ENCODING[0];
  }

  // Overflow: all chars wrapped around
  throw new Error('ULID random component overflow');
}

// Default export for convenience
export default ulid;
