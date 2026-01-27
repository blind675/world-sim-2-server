/**
 * Deterministic string-to-uint32 hash function
 * 
 * Uses MurmurHash3's 32-bit finalizer for deterministic hashing.
 * This ensures the same string always produces the same 32-bit seed
 * across all platforms and JavaScript engines.
 */

/**
 * Hash a string to a 32-bit unsigned integer deterministically.
 * 
 * Implementation based on MurmurHash3's 32-bit finalizer.
 * 
 * @param str - Input string to hash
 * @returns 32-bit unsigned integer (0 to 4294967295)
 * 
 * @example
 * ```ts
 * const seed = hashString("my-world-seed");
 * console.log(seed); // Always produces the same value
 * ```
 */
export function hashString(str: string): number {
  let h = 0;
  
  // Process each character
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    h = Math.imul(h ^ char, 0x5bd1e995);
    h ^= h >>> 15;
  }
  
  // MurmurHash3 32-bit finalizer
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  
  // Ensure unsigned 32-bit
  return h >>> 0;
}

/**
 * Normalize a seed input (string or number) to a 32-bit unsigned integer.
 * 
 * - If string: hash to uint32
 * - If number: normalize to safe uint32 range
 * 
 * @param seed - Seed as string or number
 * @returns 32-bit unsigned integer seed
 * 
 * @example
 * ```ts
 * normalizeSeed("world-42");    // Hashed to uint32
 * normalizeSeed(12345);          // Normalized to uint32
 * normalizeSeed(-100);           // Converted to positive uint32
 * ```
 */
export function normalizeSeed(seed: string | number): number {
  if (typeof seed === 'string') {
    return hashString(seed);
  }
  
  // Normalize number to uint32 range
  // Handle negative numbers, floats, and out-of-range values
  return (Math.floor(Math.abs(seed)) >>> 0) || 1;
}

/**
 * Combine two 32-bit seeds into a new 32-bit seed deterministically.
 * 
 * Used for deriving stream seeds from master seed + stream name.
 * 
 * @param seed1 - First seed (uint32)
 * @param seed2 - Second seed (uint32)
 * @returns Combined seed (uint32)
 */
export function combineSeed(seed1: number, seed2: number): number {
  // Mix the two seeds using multiplication and XOR
  let combined = seed1 ^ seed2;
  combined = Math.imul(combined, 0x9e3779b9);
  combined ^= combined >>> 16;
  combined = Math.imul(combined, 0x85ebca6b);
  combined ^= combined >>> 13;
  
  return combined >>> 0;
}
