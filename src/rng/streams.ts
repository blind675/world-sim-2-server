/**
 * RNG Stream implementation
 * 
 * Provides a high-level API for random number generation with:
 * - Multiple named streams from a master seed
 * - Forking for independent sub-streams
 * - Serialization/deserialization
 */

import {
  createPrng,
  nextUint32,
  nextFloat,
  clonePrng,
  getPrngState,
  setPrngState,
  type PrngState,
} from './prng';
import { hashString, combineSeed } from './hash';

/**
 * Serializable state for an RNG stream
 */
export interface RngStreamState {
  /** Original seed used to create this stream */
  originalSeed: number;
  /** Current PRNG state */
  prngState: PrngState;
}

/**
 * RNG Stream - provides random number generation methods
 * 
 * Each stream is independent and can be serialized/restored.
 * 
 * @example
 * ```ts
 * const stream = new RngStream(12345, "terrain");
 * 
 * const x = stream.float();           // [0, 1)
 * const n = stream.int(1, 7);         // 1, 2, 3, 4, 5, or 6
 * const coin = stream.bool();         // true or false
 * const item = stream.pick([1,2,3]);  // random element
 * const shuffled = stream.shuffle([1,2,3]); // new shuffled array
 * 
 * // Fork for independent sub-stream
 * const subStream = stream.fork("chunk-0-0");
 * ```
 */
export class RngStream {
  private prng: PrngState;
  private readonly originalSeed: number;

  /**
   * Create a new RNG stream.
   * 
   * @param seed - 32-bit seed for this stream
   * @param label - Optional label for debugging
   */
  constructor(seed: number, public readonly label?: string) {
    this.originalSeed = seed >>> 0;
    this.prng = createPrng(this.originalSeed);
  }

  /**
   * Generate the next 32-bit unsigned integer.
   * 
   * This is the core primitive method.
   * 
   * @returns 32-bit unsigned integer (0 to 4294967295)
   */
  nextUint32(): number {
    return nextUint32(this.prng);
  }

  /**
   * Generate a random float in [0, 1).
   * 
   * @returns Float in range [0, 1)
   */
  float(): number {
    return nextFloat(this.prng);
  }

  /**
   * Generate a random integer in [min, max).
   * 
   * @param min - Minimum value (inclusive)
   * @param max - Maximum value (exclusive)
   * @returns Integer in range [min, max)
   * 
   * @throws {Error} If min >= max or if range is invalid
   * 
   * @example
   * ```ts
   * stream.int(0, 10);  // 0, 1, 2, ..., 9
   * stream.int(1, 7);   // 1, 2, 3, 4, 5, 6
   * ```
   */
  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`int(min, max) requires integer arguments, got min=${min}, max=${max}`);
    }
    
    if (min >= max) {
      throw new Error(`int(min, max) requires min < max, got min=${min}, max=${max}`);
    }
    
    const range = max - min;
    return min + Math.floor(this.float() * range);
  }

  /**
   * Generate a random boolean with given probability.
   * 
   * @param p - Probability of returning true (default 0.5)
   * @returns true or false
   * 
   * @throws {Error} If p is not in [0, 1]
   * 
   * @example
   * ```ts
   * stream.bool();      // 50% true, 50% false
   * stream.bool(0.75);  // 75% true, 25% false
   * stream.bool(0.1);   // 10% true, 90% false
   * ```
   */
  bool(p: number = 0.5): boolean {
    if (p < 0 || p > 1) {
      throw new Error(`bool(p) requires p in [0, 1], got p=${p}`);
    }
    
    return this.float() < p;
  }

  /**
   * Pick a random element from an array.
   * 
   * @param arr - Non-empty array to pick from
   * @returns Random element from the array
   * 
   * @throws {Error} If array is empty
   * 
   * @example
   * ```ts
   * stream.pick([1, 2, 3]);           // 1, 2, or 3
   * stream.pick(['a', 'b', 'c']);     // 'a', 'b', or 'c'
   * ```
   */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) {
      throw new Error('pick() requires non-empty array');
    }
    
    const index = this.int(0, arr.length);
    return arr[index];
  }

  /**
   * Shuffle an array (returns a new array, does not mutate input).
   * 
   * Uses Fisher-Yates shuffle algorithm.
   * 
   * @param arr - Array to shuffle
   * @returns New shuffled array
   * 
   * @example
   * ```ts
   * const original = [1, 2, 3, 4, 5];
   * const shuffled = stream.shuffle(original);
   * // original is unchanged, shuffled is a new array
   * ```
   */
  shuffle<T>(arr: readonly T[]): T[] {
    const result = [...arr];
    
    // Fisher-Yates shuffle
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }

  /**
   * Fork this stream to create an independent sub-stream.
   * 
   * The fork is derived from the original seed + label, NOT from the current
   * position. This ensures forks are stable even if the parent's call count changes.
   * 
   * @param label - Label for the forked stream (string or number)
   * @returns New independent RNG stream
   * 
   * @example
   * ```ts
   * const terrain = rng.stream("terrain");
   * const chunk00 = terrain.fork("chunk-0-0");
   * const chunk01 = terrain.fork("chunk-0-1");
   * // chunk00 and chunk01 are independent, stable streams
   * ```
   */
  fork(label: string | number): RngStream {
    const labelSeed = typeof label === 'string' 
      ? hashString(label) 
      : (label >>> 0);
    
    const forkedSeed = combineSeed(this.originalSeed, labelSeed);
    const forkedLabel = this.label 
      ? `${this.label}/${label}` 
      : String(label);
    
    return new RngStream(forkedSeed, forkedLabel);
  }

  /**
   * Get the current serializable state of this stream.
   * 
   * @returns Serializable state object
   */
  getState(): RngStreamState {
    return {
      originalSeed: this.originalSeed,
      prngState: getPrngState(this.prng),
    };
  }

  /**
   * Restore this stream from a serialized state.
   * 
   * @param state - Serialized state to restore
   */
  setState(state: RngStreamState): void {
    if (state.originalSeed !== this.originalSeed) {
      throw new Error(
        `Cannot restore state: originalSeed mismatch (expected ${this.originalSeed}, got ${state.originalSeed})`
      );
    }
    
    this.prng = setPrngState(state.prngState);
  }

  /**
   * Create a new RNG stream from serialized state.
   * 
   * @param state - Serialized state
   * @param label - Optional label
   * @returns New RNG stream with restored state
   */
  static fromState(state: RngStreamState, label?: string): RngStream {
    const stream = new RngStream(state.originalSeed, label);
    stream.prng = setPrngState(state.prngState);
    return stream;
  }
}
