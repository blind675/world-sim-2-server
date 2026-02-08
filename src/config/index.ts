import { config } from './config';
import { AppConfigSchema, type ValidatedConfig, type DerivedConfig } from './schema';
import { ZodError } from 'zod';

let cachedConfig: ValidatedConfig | null = null;

function computeDerived(validatedConfig: ReturnType<typeof AppConfigSchema.parse>): DerivedConfig {
  const { grids, time, planet } = validatedConfig;

  const landChunkSizeM = grids.land.chunkCells * grids.land.cellSizeM;

  // Planet width/height in meters (torus: diameter = 2 * radius)
  const planetSizeM = planet.radiusKm * 2 * 1000;

  // Snap world cell count to multiples of chunkCells
  const worldChunksX = Math.round(planetSizeM / landChunkSizeM);
  const worldChunksY = worldChunksX; // square torus
  const worldCellsX = worldChunksX * grids.land.chunkCells;
  const worldCellsY = worldChunksY * grids.land.chunkCells;

  return {
    atmosphereCellsTotal: grids.atmosphere.size * grids.atmosphere.size,

    landChunkSizeCells: grids.land.chunkCells * grids.land.chunkCells,

    landChunkSizeM,

    landChunkSizeKm: landChunkSizeM / 1000,

    acceleration: time.dtGameStepSeconds / time.realStepIntervalSeconds,

    worldChunksX,
    worldChunksY,
    worldCellsX,
    worldCellsY,
  };
}

function formatZodError(error: ZodError): string {
  const lines = ['Configuration validation failed:', ''];

  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'root';
    const message = issue.message;

    if (issue.code === 'invalid_type') {
      lines.push(
        `  ❌ ${path}:`,
        `     Expected: ${issue.expected}`,
        `     Received: ${(issue as any).received}`,
        ''
      );
    } else if (issue.code === 'unrecognized_keys') {
      lines.push(
        `  ❌ ${path}:`,
        `     Unrecognized keys: ${issue.keys.join(', ')}`,
        `     (This may be a typo or unsupported field)`,
        ''
      );
    } else if (issue.code === 'too_small' || issue.code === 'too_big') {
      lines.push(
        `  ❌ ${path}:`,
        `     ${message}`,
        ''
      );
    } else {
      lines.push(
        `  ❌ ${path}:`,
        `     ${message}`,
        ''
      );
    }
  }

  lines.push('Please fix the configuration and restart the server.');

  return lines.join('\n');
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);

  Object.getOwnPropertyNames(obj).forEach((prop) => {
    const value = (obj as any)[prop];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  });

  return obj;
}

export function getConfig(): ValidatedConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const validated = AppConfigSchema.parse(config);

    const derived = computeDerived(validated);

    const fullConfig: ValidatedConfig = {
      ...validated,
      derived,
    };

    cachedConfig = deepFreeze(fullConfig);

    return cachedConfig;
  } catch (error) {
    if (error instanceof ZodError) {
      const formattedError = formatZodError(error);
      console.error(formattedError);
      throw new Error('Configuration validation failed. See error details above.');
    }
    throw error;
  }
}

export function resetConfigCache(): void {
  cachedConfig = null;
}
