/**
 * Core PRNG implementation using Mulberry32
 * 
 * Mulberry32 is a simple, fast, high-quality 32-bit PRNG.
 * It has a period of 2^32 and passes statistical tests (PractRand, BigCrush).
 * 
 * Reference: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
 */

/**
 * Mulberry32 PRNG state
 */
export interface PrngState {
  /** Current 32-bit state */
  state: number;
}

/**
 * Create a new Mulberry32 PRNG with the given seed.
 * 
 * @param seed - 32-bit unsigned integer seed
 * @returns PRNG state object
 */
export function createPrng(seed: number): PrngState {
  return {
    state: seed >>> 0, // Ensure uint32
  };
}

/**
 * Generate the next 32-bit unsigned integer from the PRNG.
 * 
 * This is the core primitive that all other random methods build upon.
 * Mutates the state in place.
 * 
 * @param prng - PRNG state (will be mutated)
 * @returns 32-bit unsigned integer (0 to 4294967295)
 */
export function nextUint32(prng: PrngState): number {
  // Mulberry32 algorithm
  let z = (prng.state += 0x6d2b79f5);
  z = Math.imul(z ^ (z >>> 15), z | 1);
  z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
  const result = (z ^ (z >>> 14)) >>> 0;
  
  return result;
}

/**
 * Generate a random float in [0, 1).
 * 
 * @param prng - PRNG state (will be mutated)
 * @returns Float in range [0, 1)
 */
export function nextFloat(prng: PrngState): number {
  return nextUint32(prng) / 0x100000000; // Divide by 2^32
}

/**
 * Clone a PRNG state (for forking).
 * 
 * @param prng - PRNG state to clone
 * @returns New PRNG state with same internal state
 */
export function clonePrng(prng: PrngState): PrngState {
  return {
    state: prng.state,
  };
}

/**
 * Get serializable state from PRNG.
 * 
 * @param prng - PRNG state
 * @returns Serializable state object
 */
export function getPrngState(prng: PrngState): PrngState {
  return {
    state: prng.state,
  };
}

/**
 * Restore PRNG from serialized state.
 * 
 * @param state - Serialized state
 * @returns PRNG state
 */
export function setPrngState(state: PrngState): PrngState {
  return {
    state: state.state >>> 0, // Ensure uint32
  };
}
