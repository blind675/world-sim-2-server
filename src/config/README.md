# Configuration System

This directory contains the FlatWorld simulation configuration system with runtime validation.

## Architecture

The configuration system uses a **hybrid approach**:
- Human-editable TypeScript config file (`config.ts`)
- Runtime validation with Zod schemas (`schema.ts`)
- Singleton pattern with deep freezing for immutability
- Derived/computed values for convenience

## Files

- **`schema.ts`**: Zod schemas and TypeScript types
- **`config.ts`**: Human-editable configuration (the source of truth)
- **`index.ts`**: Config loader with validation and caching
- **`types.ts`**: Re-exported types for convenience
- **`README.md`**: This file

## Usage

```typescript
import { getConfig } from './config';

// Get validated, frozen config (cached after first call)
const config = getConfig();

// Access config values
console.log(config.planet.seed);
console.log(config.time.dtGameStepSeconds);
console.log(config.derived.acceleration);

// Config is deeply frozen - this will throw in strict mode
// config.planet.seed = 123; // Error!
```

## Configuration Structure

### Planet
```typescript
planet: {
  radiusKm: number;      // Planet radius in km
  seed: number;          // Random seed (integer)
}
```

### Time
```typescript
time: {
  dtGameStepSeconds: 60;              // Fixed (literal 60)
  realStepIntervalSeconds: number;    // 1-60 seconds
  accelerationRestartOnly: true;      // Fixed (literal true)
}
```

### Grids
```typescript
grids: {
  atmosphere: {
    size: 1024;           // Fixed (literal 1024)
    cellSizeKm: number;   // Derived from planet size
  },
  land: {
    cellSizeM: 250;       // Fixed (literal 250)
    chunkCells: 256;      // Fixed (literal 256)
  }
}
```

### Runtime
```typescript
runtime: {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  snapshots: {
    enabled: boolean;
    dir: string;          // Non-empty
    intervalSteps: number; // >= 1
  }
}
```

### Derived Values
```typescript
derived: {
  atmosphereCellsTotal: number;  // size * size
  landChunkSizeCells: number;    // chunkCells * chunkCells
  landChunkSizeM: number;        // chunkCells * cellSizeM
  landChunkSizeKm: number;       // landChunkSizeM / 1000
  acceleration: number;          // dtGameStepSeconds / realStepIntervalSeconds
}
```

## Validation

The system performs **strict validation** on startup:

1. **Type checking**: All fields must match expected types
2. **Literal enforcement**: Fixed values (60, 1024, 250, 256, true) are enforced
3. **Range validation**: Numeric constraints are checked
4. **Unknown keys**: Rejected to catch typos
5. **Non-empty strings**: Directory paths must be non-empty

### Error Handling

If validation fails, the server will:
1. Print a detailed, multi-line error message
2. Show exact field paths (e.g., `time.realStepIntervalSeconds`)
3. Show expected vs received values
4. Exit with an error

Example error output:
```
Configuration validation failed:

  ❌ time.realStepIntervalSeconds:
     Expected: number
     Received: string

  ❌ grids.atmosphere.size:
     Expected literal: 1024
     Received: 2048

Please fix the configuration and restart the server.
```

## Modifying Configuration

1. Edit `src/config/config.ts`
2. Restart the server (config changes require restart)
3. If validation fails, fix errors and restart again

## Design Principles

1. **Single source of truth**: `config.ts` is the only file you edit
2. **Fail fast**: Invalid config prevents server startup
3. **Type safety**: Full TypeScript support with inference
4. **Immutability**: Config is deeply frozen after validation
5. **Developer-friendly**: Clear error messages and comments
6. **No runtime changes**: Config is validated once and cached

## Testing

To test config validation, you can use the `resetConfigCache()` function:

```typescript
import { getConfig, resetConfigCache } from './config';

// For testing only
resetConfigCache();
const config = getConfig(); // Re-validates
```

## Future Enhancements

- Environment variable overrides (optional)
- Config file hot-reloading (development mode)
- Multiple config profiles (dev/staging/prod)
- Config export/import for reproducibility
