/**
 * Deterministic RNG System for FlatWorld Simulation
 * 
 * Provides seeded random number generation with:
 * - Multiple named streams from a master seed
 * - Forking for independent sub-streams
 * - Full serialization/deserialization support
 * - Deterministic: same seed + same code = same results
 * 
 * @example
 * ```ts
 * // Create RNG with master seed
 * const rng = createRng(42);
 * 
 * // Get named streams
 * const terrain = rng.stream("terrain");
 * const weather = rng.stream("weather");
 * 
 * // Use streams
 * const height = terrain.float();
 * const temp = weather.int(-20, 40);
 * 
 * // Fork for sub-regions
 * const chunk = terrain.fork("chunk-0-0");
 * 
 * // Serialize/restore
 * const state = rng.getState();
 * const restored = createRngFromState(state);
 * ```
 */

import { normalizeSeed, hashString, combineSeed } from './hash';
import { RngStream, type RngStreamState } from './streams';

/**
 * Serializable state for the entire RNG system
 */
export interface RngState {
  /** Master seed (normalized to uint32) */
  masterSeed: number;
  /** States of all named streams */
  streams: Record<string, RngStreamState>;
}

/**
 * Main RNG manager - creates and manages named streams
 */
export class Rng {
  private readonly masterSeed: number;
  private readonly streams: Map<string, RngStream>;

  /**
   * Create a new RNG manager with a master seed.
   * 
   * @param seed - Master seed (string or number)
   */
  constructor(seed: string | number) {
    this.masterSeed = normalizeSeed(seed);
    this.streams = new Map();
  }

  /**
   * Get or create a named stream.
   * 
   * If the stream already exists, returns the existing instance.
   * Otherwise, creates a new stream derived from the master seed.
   * 
   * @param name - Stream name
   * @returns RNG stream
   * 
   * @example
   * ```ts
   * const terrain = rng.stream("terrain");
   * const weather = rng.stream("weather");
   * ```
   */
  stream(name: string): RngStream {
    let stream = this.streams.get(name);

    if (!stream) {
      const streamSeed = combineSeed(this.masterSeed, hashString(name));
      stream = new RngStream(streamSeed, name);
      this.streams.set(name, stream);
    }

    return stream;
  }

  /**
   * Get the master seed.
   * 
   * @returns Master seed (uint32)
   */
  getMasterSeed(): number {
    return this.masterSeed;
  }

  /**
   * Get all stream names that have been created.
   * 
   * @returns Array of stream names
   */
  getStreamNames(): string[] {
    return Array.from(this.streams.keys());
  }

  /**
   * Check if a stream exists.
   * 
   * @param name - Stream name
   * @returns true if stream exists
   */
  hasStream(name: string): boolean {
    return this.streams.has(name);
  }

  /**
   * Get the current state of all streams (for serialization).
   * 
   * @returns Serializable state object
   */
  getState(): RngState {
    const streamStates: Record<string, RngStreamState> = {};

    for (const [name, stream] of this.streams.entries()) {
      streamStates[name] = stream.getState();
    }

    return {
      masterSeed: this.masterSeed,
      streams: streamStates,
    };
  }

  /**
   * Restore all streams from a serialized state.
   * 
   * @param state - Serialized state
   * @throws {Error} If master seed doesn't match
   */
  loadState(state: RngState): void {
    if (state.masterSeed !== this.masterSeed) {
      throw new Error(
        `Cannot load state: masterSeed mismatch (expected ${this.masterSeed}, got ${state.masterSeed})`
      );
    }

    this.streams.clear();

    for (const [name, streamState] of Object.entries(state.streams)) {
      const stream = RngStream.fromState(streamState, name);
      this.streams.set(name, stream);
    }
  }
}

/**
 * Create a new RNG manager with a master seed.
 * 
 * @param seed - Master seed (string or number)
 * @returns RNG manager
 * 
 * @example
 * ```ts
 * const rng = createRng(42);
 * const rng2 = createRng("my-world-seed");
 * ```
 */
export function createRng(seed: string | number): Rng {
  return new Rng(seed);
}

/**
 * Create an RNG manager from serialized state.
 * 
 * @param state - Serialized state
 * @returns RNG manager with restored state
 * 
 * @example
 * ```ts
 * const state = rng.getState();
 * const restored = createRngFromState(state);
 * ```
 */
export function createRngFromState(state: RngState): Rng {
  const rng = new Rng(state.masterSeed);
  rng.loadState(state);
  return rng;
}

// Re-export types and utilities
export { RngStream, type RngStreamState };
export { normalizeSeed, hashString } from './hash';
