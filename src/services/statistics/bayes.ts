/**
 * Bayesian Beta-Binomial Analysis
 *
 * Implements Bayesian inference for A/B testing using the Beta-Binomial model.
 * This approach provides:
 * - Probability that each variant is the best
 * - Credible intervals for conversion rates
 * - Intuitive interpretation of results
 *
 * The Beta distribution is conjugate prior for the Binomial likelihood,
 * making posterior computation straightforward.
 */

import type {
  VariantMetrics,
  BayesianVariantResult,
  BayesianComparison,
} from '../../types/statistics.js';

/**
 * Simple pseudo-random number generator (Mulberry32)
 * Used for reproducible Monte Carlo simulations
 */
function createPrng(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Calculate the log of the Beta function B(a, b) = Gamma(a) * Gamma(b) / Gamma(a+b)
 * Uses Stirling's approximation for the log-gamma function
 */
function logGamma(z: number): number {
  // Lanczos approximation coefficients
  const g = 7;
  const coefficients = [
    0.9999999999998099, 676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012, 9.984369578019572e-6,
    1.5056327351493116e-7,
  ];

  if (z < 0.5) {
    // Reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = coefficients[0];
  for (let i = 1; i < g + 2; i++) {
    x += coefficients[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Calculate log of Beta function
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Sample from a Beta distribution using the ratio of Gamma random variables
 * This implementation uses the Marsaglia and Tsang method for Gamma sampling
 */
function sampleBeta(alpha: number, beta: number, random: () => number): number {
  // Handle edge cases
  if (alpha <= 0 || beta <= 0) {
    return 0;
  }

  // For alpha or beta < 1, use transformation
  if (alpha < 1 || beta < 1) {
    // Use Joehnk's method for small parameters
    const u1 = Math.pow(random(), 1 / alpha);
    const u2 = Math.pow(random(), 1 / beta);
    const sum = u1 + u2;

    if (sum <= 1) {
      return u1 / sum;
    }
    // Rejection: recurse
    return sampleBeta(alpha, beta, random);
  }

  // Use ratio of Gamma variates for larger parameters
  const gammaA = sampleGamma(alpha, random);
  const gammaB = sampleGamma(beta, random);

  return gammaA / (gammaA + gammaB);
}

/**
 * Sample from Gamma distribution using Marsaglia and Tsang's method
 */
function sampleGamma(shape: number, random: () => number): number {
  if (shape < 1) {
    // Transformation for shape < 1
    const u = random();
    return sampleGamma(shape + 1, random) * Math.pow(u, 1 / shape);
  }

  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);

  // Marsaglia and Tsang rejection sampling loop
  // Maximum iterations for safety (extremely unlikely to reach)
  const maxIterations = 10000;
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    let x: number;
    let v: number;

    do {
      // Sample from standard normal using Box-Muller
      const u1 = random();
      const u2 = random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);

    v = v * v * v;
    const u = random();

    // Acceptance test
    if (u < 1 - 0.0331 * x * x * x * x) {
      return d * v;
    }

    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
      return d * v;
    }
  }

  // Fallback (should never reach here)
  return d;
}

/**
 * Calculate the quantile of a Beta distribution using Newton-Raphson iteration
 */
function betaQuantile(p: number, alpha: number, beta: number): number {
  // Handle edge cases
  if (p <= 0) return 0;
  if (p >= 1) return 1;

  // Initial guess using approximation
  let x =
    alpha === beta
      ? 0.5
      : alpha / (alpha + beta) + ((p - 0.5) * 0.5) / Math.sqrt(alpha + beta);

  x = Math.max(0.001, Math.min(0.999, x));

  // Newton-Raphson iteration with regularized incomplete beta function
  for (let i = 0; i < 100; i++) {
    const fx = incompleteBeta(x, alpha, beta) - p;

    if (Math.abs(fx) < 1e-10) {
      break;
    }

    // Derivative is the beta PDF
    const fpx = betaPdf(x, alpha, beta);
    if (fpx === 0) break;

    const newX = x - fx / fpx;
    x = Math.max(0.001, Math.min(0.999, newX));
  }

  return x;
}

/**
 * Calculate the regularized incomplete beta function I_x(a, b)
 * Using continued fraction representation
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  // Use symmetry relation if x > (a+1)/(a+b+2)
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - incompleteBeta(1 - x, b, a);
  }

  // Continued fraction using Lentz's method
  const lnBeta = logBeta(a, b);
  const front = Math.exp(Math.log(x) * a + Math.log(1 - x) * b - lnBeta) / a;

  const epsilon = 1e-14;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);

  if (Math.abs(d) < epsilon) d = epsilon;
  d = 1 / d;
  let result = d;

  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;

    // Even step
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    result *= c * d;

    // Odd step
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < epsilon) d = epsilon;
    c = 1 + aa / c;
    if (Math.abs(c) < epsilon) c = epsilon;
    d = 1 / d;
    const delta = c * d;
    result *= delta;

    if (Math.abs(delta - 1) < epsilon) {
      break;
    }
  }

  return front * result;
}

/**
 * Calculate Beta PDF
 */
function betaPdf(x: number, alpha: number, beta: number): number {
  if (x <= 0 || x >= 1) return 0;

  const logPdf =
    (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logBeta(alpha, beta);

  return Math.exp(logPdf);
}

/**
 * Calculate posterior parameters for a variant
 *
 * @param variant - Variant metrics
 * @param priorAlpha - Prior alpha parameter (default: 1 for uniform prior)
 * @param priorBeta - Prior beta parameter (default: 1 for uniform prior)
 * @returns Bayesian variant result
 */
export function calculateBayesianPosterior(
  variant: VariantMetrics,
  priorAlpha: number = 1,
  priorBeta: number = 1
): BayesianVariantResult {
  const alpha = priorAlpha + variant.conversions;
  const beta = priorBeta + (variant.clicks - variant.conversions);

  // Posterior mean
  const posteriorMean = alpha / (alpha + beta);

  // 95% credible interval using quantile function
  const credibleIntervalLower = betaQuantile(0.025, alpha, beta);
  const credibleIntervalUpper = betaQuantile(0.975, alpha, beta);

  return {
    variantId: variant.variantId,
    alpha,
    beta,
    posteriorMean,
    credibleIntervalLower,
    credibleIntervalUpper,
  };
}

/**
 * Calculate win probabilities using Monte Carlo simulation
 *
 * @param variants - Array of variant metrics
 * @param priorAlpha - Prior alpha parameter
 * @param priorBeta - Prior beta parameter
 * @param numSimulations - Number of Monte Carlo simulations
 * @param seed - Random seed for reproducibility
 * @returns Map of variant ID to win probability
 */
export function calculateWinProbabilities(
  variants: VariantMetrics[],
  priorAlpha: number = 1,
  priorBeta: number = 1,
  numSimulations: number = 10000,
  seed: number = 42
): Map<string, number> {
  if (variants.length === 0) {
    return new Map();
  }

  if (variants.length === 1) {
    return new Map([[variants[0].variantId, 1]]);
  }

  const random = createPrng(seed);
  const winCounts = new Map<string, number>();

  // Initialize win counts
  for (const variant of variants) {
    winCounts.set(variant.variantId, 0);
  }

  // Run simulations
  for (let sim = 0; sim < numSimulations; sim++) {
    let maxSample = -1;
    let winner = '';

    for (const variant of variants) {
      const alpha = priorAlpha + variant.conversions;
      const beta = priorBeta + (variant.clicks - variant.conversions);
      const sample = sampleBeta(alpha, beta, random);

      if (sample > maxSample) {
        maxSample = sample;
        winner = variant.variantId;
      }
    }

    winCounts.set(winner, (winCounts.get(winner) || 0) + 1);
  }

  // Convert counts to probabilities
  const winProbabilities = new Map<string, number>();
  for (const [variantId, count] of winCounts) {
    winProbabilities.set(variantId, count / numSimulations);
  }

  return winProbabilities;
}

/**
 * Perform complete Bayesian comparison of variants
 *
 * @param variants - Array of variant metrics
 * @param config - Statistics configuration
 * @returns Bayesian comparison result
 */
export function compareBayesian(
  variants: VariantMetrics[],
  priorAlpha: number = 1,
  priorBeta: number = 1,
  numSimulations: number = 10000,
  seed: number = 42
): BayesianComparison {
  // Calculate posteriors for all variants
  const variantResults = variants.map((v) => calculateBayesianPosterior(v, priorAlpha, priorBeta));

  // Calculate win probabilities
  const winProbabilities = calculateWinProbabilities(
    variants,
    priorAlpha,
    priorBeta,
    numSimulations,
    seed
  );

  // Find likely winner
  let likelyWinner: string | null = null;
  let likelyWinnerProbability = 0;

  for (const [variantId, probability] of winProbabilities) {
    if (probability > likelyWinnerProbability) {
      likelyWinnerProbability = probability;
      likelyWinner = variantId;
    }
  }

  return {
    variants: variantResults,
    winProbabilities,
    likelyWinner,
    likelyWinnerProbability,
  };
}

/**
 * Calculate the probability that variant A beats variant B
 *
 * @param variantA - First variant metrics
 * @param variantB - Second variant metrics
 * @param priorAlpha - Prior alpha parameter
 * @param priorBeta - Prior beta parameter
 * @param numSimulations - Number of Monte Carlo simulations
 * @param seed - Random seed
 * @returns Probability that A's true CVR > B's true CVR
 */
export function probabilityABeatsB(
  variantA: VariantMetrics,
  variantB: VariantMetrics,
  priorAlpha: number = 1,
  priorBeta: number = 1,
  numSimulations: number = 10000,
  seed: number = 42
): number {
  const random = createPrng(seed);

  const alphaA = priorAlpha + variantA.conversions;
  const betaA = priorBeta + (variantA.clicks - variantA.conversions);
  const alphaB = priorAlpha + variantB.conversions;
  const betaB = priorBeta + (variantB.clicks - variantB.conversions);

  let aWins = 0;

  for (let i = 0; i < numSimulations; i++) {
    const sampleA = sampleBeta(alphaA, betaA, random);
    const sampleB = sampleBeta(alphaB, betaB, random);

    if (sampleA > sampleB) {
      aWins++;
    }
  }

  return aWins / numSimulations;
}

/**
 * Calculate expected loss if we choose the wrong variant
 *
 * @param variants - Array of variant metrics
 * @param priorAlpha - Prior alpha parameter
 * @param priorBeta - Prior beta parameter
 * @param numSimulations - Number of Monte Carlo simulations
 * @param seed - Random seed
 * @returns Map of variant ID to expected loss if choosing that variant
 */
export function calculateExpectedLoss(
  variants: VariantMetrics[],
  priorAlpha: number = 1,
  priorBeta: number = 1,
  numSimulations: number = 10000,
  seed: number = 42
): Map<string, number> {
  if (variants.length === 0) {
    return new Map();
  }

  const random = createPrng(seed);
  const totalLoss = new Map<string, number>();

  // Initialize loss
  for (const variant of variants) {
    totalLoss.set(variant.variantId, 0);
  }

  // Run simulations
  for (let sim = 0; sim < numSimulations; sim++) {
    const samples = new Map<string, number>();
    let maxSample = -1;

    // Sample from each variant's posterior
    for (const variant of variants) {
      const alpha = priorAlpha + variant.conversions;
      const beta = priorBeta + (variant.clicks - variant.conversions);
      const sample = sampleBeta(alpha, beta, random);
      samples.set(variant.variantId, sample);

      if (sample > maxSample) {
        maxSample = sample;
      }
    }

    // Calculate loss for each variant (difference from best)
    for (const [variantId, sample] of samples) {
      const loss = maxSample - sample;
      totalLoss.set(variantId, (totalLoss.get(variantId) || 0) + loss);
    }
  }

  // Convert to average loss
  const expectedLoss = new Map<string, number>();
  for (const [variantId, total] of totalLoss) {
    expectedLoss.set(variantId, total / numSimulations);
  }

  return expectedLoss;
}
