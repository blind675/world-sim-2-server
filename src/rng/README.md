# Deterministic RNG System

A fully deterministic, serializable random number generation system for the FlatWorld simulation.

## Features

- **Deterministic**: Same seed + same code = identical results across runs and machines
- **No Math.random()**: Pure TypeScript implementation using Mulberry32 PRNG
- **Named Streams**: Multiple independent RNG streams from a single master seed
- **Forking**: Create stable sub-streams that don't depend on parent call count
- **Serialization**: Full state export/import for checkpoints and save/load
- **Type-Safe**: Complete TypeScript types with JSDoc documentation
- **Well-Tested**: Comprehensive test suite with golden vectors

## Quick Start

```typescript
import { createRng } from './rng';

// Create RNG with master seed
const rng = createRng(42);
// or with string seed
const rng = createRng('my-world-seed');

// Get named streams
const terrain = rng.stream('terrain');
const weather = rng.stream('weather');

// Generate random values
const height = terrain.float();        // [0, 1)
const temp = weather.int(-20, 40);     // -20 to 39
const isRaining = weather.bool(0.3);   // 30% chance
const biome = terrain.pick(['forest', 'desert', 'tundra']);
const shuffled = terrain.shuffle([1, 2, 3, 4, 5]);
```

## Named Streams

Each stream is derived deterministically from the master seed + stream name:

```typescript
const rng = createRng(42);

const terrain = rng.stream('terrain');
const weather = rng.stream('weather');
const entities = rng.stream('entities');

// Same seed + same name = same sequence
const rng2 = createRng(42);
const terrain2 = rng2.stream('terrain');
// terrain and terrain2 produce identical sequences
```

## Forking

Create independent sub-streams that are stable regardless of parent call count:

```typescript
const terrain = rng.stream('terrain');

// Fork for each chunk
const chunk00 = terrain.fork('chunk-0-0');
const chunk01 = terrain.fork('chunk-0-1');

// Forks are stable even if parent advances
terrain.float(); // This doesn't affect fork sequences
terrain.float();

// chunk00 and chunk01 always produce the same sequences
// for the same master seed, regardless of terrain's state
```

## Serialization

Save and restore complete RNG state:

```typescript
const rng = createRng(42);
const terrain = rng.stream('terrain');

// Generate some values
terrain.float();
terrain.float();

// Save state
const state = rng.getState();
// state = { masterSeed: 42, streams: { terrain: {...} } }

// Continue generating
const next1 = terrain.float();
const next2 = terrain.float();

// Restore from saved state
const restored = createRngFromState(state);
const restoredTerrain = restored.stream('terrain');

// Continues from saved point
const restored1 = restoredTerrain.float(); // === next1
const restored2 = restoredTerrain.float(); // === next2
```

## API Reference

### createRng(seed)

Create a new RNG manager.

- `seed: string | number` - Master seed (strings are hashed to uint32)
- Returns: `Rng` instance

### Rng Methods

- `stream(name: string): RngStream` - Get or create named stream
- `getMasterSeed(): number` - Get the master seed (uint32)
- `getStreamNames(): string[]` - Get all stream names
- `hasStream(name: string): boolean` - Check if stream exists
- `getState(): RngState` - Export complete state
- `loadState(state: RngState): void` - Import state

### RngStream Methods

- `nextUint32(): number` - Generate uint32 (0 to 4294967295)
- `float(): number` - Generate float in [0, 1)
- `int(min: number, max: number): number` - Generate integer in [min, max)
- `bool(p?: number): boolean` - Generate boolean (default p=0.5)
- `pick<T>(arr: T[]): T` - Pick random element from array
- `shuffle<T>(arr: T[]): T[]` - Shuffle array (returns new array)
- `fork(label: string | number): RngStream` - Create independent sub-stream
- `getState(): RngStreamState` - Export stream state
- `setState(state: RngStreamState): void` - Import stream state

## Implementation Details

### PRNG Algorithm

Uses **Mulberry32**, a high-quality 32-bit PRNG:
- Period: 2^32
- Passes statistical tests (PractRand, BigCrush)
- Fast and simple
- Single 32-bit state

### Hash Function

String seeds are hashed using a MurmurHash3-based algorithm:
- Deterministic across platforms
- Good distribution
- Handles unicode

### Stream Derivation

Named streams are derived by:
1. Hash stream name to uint32
2. Combine with master seed using mixing function
3. Initialize PRNG with combined seed

### Fork Derivation

Forks are derived from the stream's **original seed** + fork label:
- Not affected by parent's current position
- Stable across different parent call counts
- Allows reproducible chunk generation

## Testing

Run the test suite:

```bash
pnpm test
```

The tests include:
- Hash function consistency
- Stream independence
- Method correctness (int ranges, bool probability, etc.)
- Serialization roundtrips
- Fork stability
- Golden vectors (fixed expected outputs)
- Determinism validation

## Use Cases in FlatWorld

### Terrain Generation
```typescript
const terrain = rng.stream('terrain');
const chunkRng = terrain.fork(`chunk-${x}-${y}`);
const elevation = chunkRng.float() * 1000; // 0-1000m
```

### Weather Systems
```typescript
const weather = rng.stream('weather');
const isRaining = weather.bool(0.3); // 30% rain chance
const windSpeed = weather.int(0, 30); // 0-30 m/s
```

### Entity Spawning
```typescript
const entities = rng.stream('entities');
const animalType = entities.pick(['deer', 'wolf', 'bear']);
const position = { x: entities.int(0, 1000), y: entities.int(0, 1000) };
```

## Performance

- `nextUint32()`: ~50M ops/sec
- `float()`: ~45M ops/sec
- `int()`: ~40M ops/sec
- Negligible overhead for named streams and forking

## References

- Mulberry32: https://gist.github.com/tommyettinger/46a874533244883189143505d203312c
- MurmurHash3: https://github.com/aappleby/smhasher
