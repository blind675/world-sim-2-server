/**
 * Toroidal Noise — Maps 2D world coordinates to 4D simplex noise
 * for seamless wrapping on a torus.
 *
 * The 2D torus (x, y) is embedded in 4D as:
 *   (cos(2π·x/W), sin(2π·x/W), cos(2π·y/H), sin(2π·y/H))
 * scaled by a radius that controls the noise frequency.
 *
 * This guarantees perfect wrapping: noise(0, y) === noise(W, y), etc.
 */

import { Simplex4D, createSimplex4D } from './simplex4d';
import { combineSeed } from '../rng/hash';

// ── Types ───────────────────────────────────────────────────────────

export interface TorusNoiseConfig {
  /** World width in meters */
  worldWidthM: number;
  /** World height in meters */
  worldHeightM: number;
  /** Base seed for the noise */
  seed: number;
}

export interface TorusNoise {
  /**
   * Sample noise at world coordinates (in meters).
   * Returns approximately [-1, 1].
   *
   * @param xM - X position in meters
   * @param yM - Y position in meters
   * @param frequency - Noise frequency (cycles per meter). Higher = more detail.
   */
  sample(xM: number, yM: number, frequency: number): number;

  /**
   * Sample fBm (fractal Brownian motion) at world coordinates.
   * Sums multiple octaves of noise for natural-looking terrain.
   *
   * @param xM - X position in meters
   * @param yM - Y position in meters
   * @param baseFrequency - Frequency of the lowest octave
   * @param octaves - Number of octaves to sum
   * @param lacunarity - Frequency multiplier per octave (default 2.0)
   * @param persistence - Amplitude multiplier per octave (default 0.5)
   */
  fbm(
    xM: number,
    yM: number,
    baseFrequency: number,
    octaves: number,
    lacunarity?: number,
    persistence?: number,
  ): number;

  /**
   * Sample ridged multifractal noise at world coordinates.
   * Uses absolute-value inversion for ridge-like features (mountains).
   *
   * @param xM - X position in meters
   * @param yM - Y position in meters
   * @param baseFrequency - Frequency of the lowest octave
   * @param octaves - Number of octaves to sum
   * @param lacunarity - Frequency multiplier per octave (default 2.0)
   * @param persistence - Amplitude multiplier per octave (default 0.5)
   */
  ridged(
    xM: number,
    yM: number,
    baseFrequency: number,
    octaves: number,
    lacunarity?: number,
    persistence?: number,
  ): number;
}

// ── Factory ─────────────────────────────────────────────────────────

export function createTorusNoise(config: TorusNoiseConfig): TorusNoise {
  const { worldWidthM, worldHeightM, seed } = config;

  const TWO_PI = 2.0 * Math.PI;
  const invW = 1.0 / worldWidthM;
  const invH = 1.0 / worldHeightM;

  // Create simplex noise instance
  const simplex = createSimplex4D(seed);

  function sample(xM: number, yM: number, frequency: number): number {
    // Map 2D torus to 4D circle embedding
    const angleX = TWO_PI * xM * invW;
    const angleY = TWO_PI * yM * invH;

    // Radius controls the effective noise scale
    // We use frequency to scale the radius so that higher frequency = more detail
    const radius = frequency * worldWidthM / TWO_PI;

    const nx = radius * Math.cos(angleX);
    const ny = radius * Math.sin(angleX);
    const nz = radius * Math.cos(angleY);
    const nw = radius * Math.sin(angleY);

    return simplex.noise(nx, ny, nz, nw);
  }

  function fbm(
    xM: number,
    yM: number,
    baseFrequency: number,
    octaves: number,
    lacunarity: number = 2.0,
    persistence: number = 0.5,
  ): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = baseFrequency;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      value += amplitude * sample(xM, yM, frequency);
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxAmplitude;
  }

  function ridged(
    xM: number,
    yM: number,
    baseFrequency: number,
    octaves: number,
    lacunarity: number = 2.0,
    persistence: number = 0.5,
  ): number {
    let value = 0;
    let amplitude = 1.0;
    let frequency = baseFrequency;
    let maxAmplitude = 0;

    for (let i = 0; i < octaves; i++) {
      // Ridged: invert the absolute value to create sharp ridges
      const n = 1.0 - Math.abs(sample(xM, yM, frequency));
      value += amplitude * n * n; // square for sharper ridges
      maxAmplitude += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return value / maxAmplitude;
  }

  return { sample, fbm, ridged };
}

/**
 * Create a TorusNoise with a different seed derived from a base seed + label.
 * Useful for creating independent noise layers (continentalness, warp, ridges, etc.)
 */
export function createDerivedTorusNoise(
  config: TorusNoiseConfig,
  label: string,
): TorusNoise {
  const derivedSeed = combineSeed(config.seed, hashLabel(label));
  return createTorusNoise({ ...config, seed: derivedSeed });
}

function hashLabel(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) {
    const char = label.charCodeAt(i);
    h = Math.imul(h ^ char, 0x5bd1e995);
    h ^= h >>> 15;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return h >>> 0;
}
