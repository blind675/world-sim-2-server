/**
 * Comprehensive tests for the deterministic RNG system
 */

import { createRng, createRngFromState, hashString, normalizeSeed } from '../src/rng';

describe('RNG Hash Functions', () => {
  describe('hashString', () => {
    it('should produce consistent hashes for the same string', () => {
      const hash1 = hashString('test-seed');
      const hash2 = hashString('test-seed');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different strings', () => {
      const hash1 = hashString('seed-1');
      const hash2 = hashString('seed-2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce uint32 values', () => {
      const hash = hashString('test');
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThanOrEqual(0xffffffff);
      expect(Number.isInteger(hash)).toBe(true);
    });

    it('should handle empty string', () => {
      const hash = hashString('');
      expect(Number.isInteger(hash)).toBe(true);
    });

    it('should handle unicode characters', () => {
      const hash = hashString('🌍🌎🌏');
      expect(Number.isInteger(hash)).toBe(true);
    });
  });

  describe('normalizeSeed', () => {
    it('should hash strings to uint32', () => {
      const seed = normalizeSeed('my-seed');
      expect(Number.isInteger(seed)).toBe(true);
      expect(seed).toBeGreaterThanOrEqual(0);
    });

    it('should normalize positive numbers', () => {
      const seed = normalizeSeed(12345);
      expect(seed).toBe(12345);
    });

    it('should handle negative numbers', () => {
      const seed = normalizeSeed(-100);
      expect(seed).toBeGreaterThanOrEqual(0);
    });

    it('should handle floats by flooring', () => {
      const seed = normalizeSeed(123.456);
      expect(seed).toBe(123);
    });

    it('should handle zero by returning 1', () => {
      const seed = normalizeSeed(0);
      expect(seed).toBe(1);
    });
  });
});

describe('RNG Core Functionality', () => {
  describe('createRng', () => {
    it('should create RNG with numeric seed', () => {
      const rng = createRng(42);
      expect(rng).toBeDefined();
      expect(rng.getMasterSeed()).toBe(42);
    });

    it('should create RNG with string seed', () => {
      const rng = createRng('world-42');
      expect(rng).toBeDefined();
      expect(Number.isInteger(rng.getMasterSeed())).toBe(true);
    });

    it('should produce consistent master seed for same string', () => {
      const rng1 = createRng('test-seed');
      const rng2 = createRng('test-seed');
      expect(rng1.getMasterSeed()).toBe(rng2.getMasterSeed());
    });
  });

  describe('Named Streams', () => {
    it('should create independent named streams', () => {
      const rng = createRng(42);
      const terrain = rng.stream('terrain');
      const weather = rng.stream('weather');

      expect(terrain).toBeDefined();
      expect(weather).toBeDefined();
      expect(terrain).not.toBe(weather);
    });

    it('should return same stream instance for same name', () => {
      const rng = createRng(42);
      const stream1 = rng.stream('terrain');
      const stream2 = rng.stream('terrain');

      expect(stream1).toBe(stream2);
    });

    it('should produce different sequences for different stream names', () => {
      const rng = createRng(42);
      const terrain = rng.stream('terrain');
      const weather = rng.stream('weather');

      const terrainValues = [terrain.float(), terrain.float(), terrain.float()];
      const weatherValues = [weather.float(), weather.float(), weather.float()];

      expect(terrainValues).not.toEqual(weatherValues);
    });

    it('should produce same sequence for same seed and stream name', () => {
      const rng1 = createRng(42);
      const rng2 = createRng(42);

      const stream1 = rng1.stream('terrain');
      const stream2 = rng2.stream('terrain');

      const values1 = [stream1.float(), stream1.float(), stream1.float()];
      const values2 = [stream2.float(), stream2.float(), stream2.float()];

      expect(values1).toEqual(values2);
    });
  });
});

describe('RngStream Methods', () => {
  let rng: ReturnType<typeof createRng>;
  let stream: ReturnType<typeof rng.stream>;

  beforeEach(() => {
    rng = createRng(42);
    stream = rng.stream('test');
  });

  describe('nextUint32', () => {
    it('should generate uint32 values', () => {
      for (let i = 0; i < 100; i++) {
        const value = stream.nextUint32();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(0xffffffff);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should generate different values in sequence', () => {
      const values = new Set();
      for (let i = 0; i < 100; i++) {
        values.add(stream.nextUint32());
      }
      expect(values.size).toBeGreaterThan(90); // Allow some collisions
    });
  });

  describe('float', () => {
    it('should generate values in [0, 1)', () => {
      for (let i = 0; i < 1000; i++) {
        const value = stream.float();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }
    });

    it('should generate diverse values', () => {
      const values = [];
      for (let i = 0; i < 100; i++) {
        values.push(stream.float());
      }

      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      expect(mean).toBeGreaterThan(0.4);
      expect(mean).toBeLessThan(0.6);
    });
  });

  describe('int', () => {
    it('should generate integers in [min, max)', () => {
      for (let i = 0; i < 100; i++) {
        const value = stream.int(0, 10);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(10);
        expect(Number.isInteger(value)).toBe(true);
      }
    });

    it('should respect custom ranges', () => {
      for (let i = 0; i < 100; i++) {
        const value = stream.int(5, 15);
        expect(value).toBeGreaterThanOrEqual(5);
        expect(value).toBeLessThan(15);
      }
    });

    it('should throw on invalid range (min >= max)', () => {
      expect(() => stream.int(10, 10)).toThrow();
      expect(() => stream.int(10, 5)).toThrow();
    });

    it('should throw on non-integer arguments', () => {
      expect(() => stream.int(1.5, 10)).toThrow();
      expect(() => stream.int(0, 10.5)).toThrow();
    });

    it('should cover full range over many samples', () => {
      const counts = new Map<number, number>();
      for (let i = 0; i < 1000; i++) {
        const value = stream.int(0, 5);
        counts.set(value, (counts.get(value) || 0) + 1);
      }

      // Should generate all values 0-4
      expect(counts.size).toBe(5);
      for (let i = 0; i < 5; i++) {
        expect(counts.has(i)).toBe(true);
      }
    });
  });

  describe('bool', () => {
    it('should generate boolean values', () => {
      for (let i = 0; i < 100; i++) {
        const value = stream.bool();
        expect(typeof value).toBe('boolean');
      }
    });

    it('should respect probability parameter', () => {
      const stream1 = rng.stream('bool-test-1');
      const stream2 = rng.stream('bool-test-2');

      // p=0 should always be false
      for (let i = 0; i < 10; i++) {
        expect(stream1.bool(0)).toBe(false);
      }

      // p=1 should always be true
      for (let i = 0; i < 10; i++) {
        expect(stream2.bool(1)).toBe(true);
      }
    });

    it('should approximate expected probability', () => {
      const stream = rng.stream('bool-prob');
      const p = 0.7;
      let trueCount = 0;
      const samples = 1000;

      for (let i = 0; i < samples; i++) {
        if (stream.bool(p)) trueCount++;
      }

      const actualP = trueCount / samples;
      expect(actualP).toBeGreaterThan(0.65);
      expect(actualP).toBeLessThan(0.75);
    });

    it('should throw on invalid probability', () => {
      expect(() => stream.bool(-0.1)).toThrow();
      expect(() => stream.bool(1.1)).toThrow();
    });
  });

  describe('pick', () => {
    it('should pick element from array', () => {
      const arr = [1, 2, 3, 4, 5];
      for (let i = 0; i < 100; i++) {
        const picked = stream.pick(arr);
        expect(arr).toContain(picked);
      }
    });

    it('should work with different types', () => {
      const strings = ['a', 'b', 'c'];
      const picked = stream.pick(strings);
      expect(strings).toContain(picked);
    });

    it('should throw on empty array', () => {
      expect(() => stream.pick([])).toThrow();
    });

    it('should pick all elements over many samples', () => {
      const arr = [1, 2, 3, 4, 5];
      const picked = new Set();

      for (let i = 0; i < 100; i++) {
        picked.add(stream.pick(arr));
      }

      expect(picked.size).toBe(5);
    });
  });

  describe('shuffle', () => {
    it('should return new array', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = stream.shuffle(original);

      expect(shuffled).not.toBe(original);
      expect(original).toEqual([1, 2, 3, 4, 5]); // Original unchanged
    });

    it('should contain same elements', () => {
      const original = [1, 2, 3, 4, 5];
      const shuffled = stream.shuffle(original);

      expect(shuffled.sort()).toEqual(original.sort());
    });

    it('should produce different orders', () => {
      const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = stream.shuffle(original);

      // Very unlikely to be in same order
      expect(shuffled).not.toEqual(original);
    });

    it('should be deterministic', () => {
      const rng1 = createRng(999);
      const rng2 = createRng(999);

      const stream1 = rng1.stream('shuffle-test');
      const stream2 = rng2.stream('shuffle-test');

      const arr = [1, 2, 3, 4, 5];
      const shuffled1 = stream1.shuffle(arr);
      const shuffled2 = stream2.shuffle(arr);

      expect(shuffled1).toEqual(shuffled2);
    });
  });
});

describe('Stream Forking', () => {
  it('should create independent forked streams', () => {
    const rng = createRng(42);
    const parent = rng.stream('terrain');
    const fork1 = parent.fork('chunk-0-0');
    const fork2 = parent.fork('chunk-0-1');

    const values1 = [fork1.float(), fork1.float()];
    const values2 = [fork2.float(), fork2.float()];

    expect(values1).not.toEqual(values2);
  });

  it('should be stable regardless of parent call count', () => {
    const rng1 = createRng(42);
    const parent1 = rng1.stream('terrain');
    const fork1 = parent1.fork('chunk-0-0');

    const rng2 = createRng(42);
    const parent2 = rng2.stream('terrain');
    parent2.float(); // Extra call
    parent2.float(); // Extra call
    const fork2 = parent2.fork('chunk-0-0');

    const values1 = [fork1.float(), fork1.float()];
    const values2 = [fork2.float(), fork2.float()];

    expect(values1).toEqual(values2);
  });

  it('should support numeric labels', () => {
    const rng = createRng(42);
    const parent = rng.stream('terrain');
    const fork = parent.fork(123);

    expect(fork).toBeDefined();
    expect(fork.float()).toBeGreaterThanOrEqual(0);
  });

  it('should create nested fork labels', () => {
    const rng = createRng(42);
    const parent = rng.stream('terrain');
    const fork = parent.fork('chunk');

    expect(fork.label).toBe('terrain/chunk');
  });
});

describe('Serialization', () => {
  it('should serialize and restore stream state', () => {
    const rng = createRng(42);
    const stream = rng.stream('test');

    const before = [stream.float(), stream.float()];
    const state = stream.getState();
    const after = [stream.float(), stream.float()];

    stream.setState(state);
    const restored = [stream.float(), stream.float()];

    expect(restored).toEqual(after);
  });

  it('should serialize and restore entire RNG state', () => {
    const rng = createRng(42);
    const terrain = rng.stream('terrain');
    const weather = rng.stream('weather');

    terrain.float();
    terrain.float();
    weather.float();

    const state = rng.getState();

    const terrainAfter = [terrain.float(), terrain.float()];
    const weatherAfter = [weather.float(), weather.float()];

    const restored = createRngFromState(state);
    const restoredTerrain = restored.stream('terrain');
    const restoredWeather = restored.stream('weather');

    expect([restoredTerrain.float(), restoredTerrain.float()]).toEqual(terrainAfter);
    expect([restoredWeather.float(), restoredWeather.float()]).toEqual(weatherAfter);
  });

  it('should preserve master seed in state', () => {
    const rng = createRng(42);
    const state = rng.getState();

    expect(state.masterSeed).toBe(42);
  });

  it('should include all stream states', () => {
    const rng = createRng(42);
    rng.stream('terrain');
    rng.stream('weather');
    rng.stream('entities');

    const state = rng.getState();

    expect(Object.keys(state.streams)).toEqual(['terrain', 'weather', 'entities']);
  });

  it('should throw on master seed mismatch during load', () => {
    const rng1 = createRng(42);
    const rng2 = createRng(99);

    const state = rng1.getState();

    expect(() => rng2.loadState(state)).toThrow(/masterSeed mismatch/);
  });
});

describe('Golden Vector Tests', () => {
  it('should produce expected sequence for seed 42, stream "test"', () => {
    const rng = createRng(42);
    const stream = rng.stream('test');

    const expected = [
      0.9284470260608941,
      0.7213420090265572,
      0.5106402649544179,
      0.2901053468231112,
      0.42549328808672726,
    ];

    for (const expectedValue of expected) {
      const actual = stream.float();
      expect(actual).toBeCloseTo(expectedValue, 10);
    }
  });

  it('should produce expected integers for seed 100, stream "dice"', () => {
    const rng = createRng(100);
    const stream = rng.stream('dice');

    const expected = [1, 4, 0, 3, 1, 1, 2, 2, 0, 2];

    for (const expectedValue of expected) {
      const actual = stream.int(0, 5);
      expect(actual).toBe(expectedValue);
    }
  });

  it('should produce expected shuffle for seed 12345, stream "cards"', () => {
    const rng = createRng(12345);
    const stream = rng.stream('cards');

    const cards = [1, 2, 3, 4, 5];
    const shuffled = stream.shuffle(cards);

    // This is the expected order for this specific seed
    const expected = [1, 5, 4, 3, 2];

    expect(shuffled).toEqual(expected);
  });
});

describe('Determinism Validation', () => {
  it('should produce identical sequences across multiple runs', () => {
    const sequences = [];

    for (let run = 0; run < 3; run++) {
      const rng = createRng('determinism-test');
      const stream = rng.stream('test');

      const sequence = [];
      for (let i = 0; i < 20; i++) {
        sequence.push(stream.float());
      }

      sequences.push(sequence);
    }

    expect(sequences[0]).toEqual(sequences[1]);
    expect(sequences[1]).toEqual(sequences[2]);
  });

  it('should maintain determinism after serialization roundtrip', () => {
    const rng1 = createRng(42);
    const stream1 = rng1.stream('test');

    // Generate some values to advance the stream
    for (let i = 0; i < 10; i++) {
      stream1.float();
    }

    // Save state
    const state = rng1.getState();

    // Continue generating from original
    const after = [];
    for (let i = 0; i < 10; i++) {
      after.push(stream1.float());
    }

    // Restore and generate same sequence
    const rng2 = createRngFromState(state);
    const stream2 = rng2.stream('test');

    const restored = [];
    for (let i = 0; i < 10; i++) {
      restored.push(stream2.float());
    }

    expect(restored).toEqual(after);
  });
});
