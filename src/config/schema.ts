import { z } from 'zod';

export const PlanetConfigSchema = z.object({
  radiusKm: z.number().positive().describe('Planet radius in kilometers'),
  seed: z.number().int().describe('Random seed for world generation'),
}).strict();

export const TimeConfigSchema = z.object({
  dtGameStepSeconds: z.literal(60).describe('Fixed simulated time per engine step (must be 60)'),
  realStepIntervalSeconds: z.number().min(1).max(60).describe('Wall-clock interval between steps (1-60 seconds)'),
  accelerationRestartOnly: z.literal(true).describe('Acceleration changes require restart (must be true)'),
}).strict();

export const AtmosphereGridConfigSchema = z.object({
  size: z.literal(1024).describe('Grid size (must be 1024x1024)'),
  cellSizeKm: z.number().positive().describe('Cell size in kilometers (derived from planet size)'),
}).strict();

export const LandGridConfigSchema = z.object({
  cellSizeM: z.literal(250).describe('Land cell size in meters (must be 250)'),
  chunkCells: z.literal(256).describe('Chunk size in cells (must be 256x256)'),
  maxResidentChunks: z.number().int().min(1).default(4096).describe('Max chunks kept in memory before LRU eviction'),
}).strict();

export const GridsConfigSchema = z.object({
  atmosphere: AtmosphereGridConfigSchema,
  land: LandGridConfigSchema,
}).strict();

export const SnapshotsConfigSchema = z.object({
  enabled: z.boolean().describe('Enable periodic snapshots'),
  dir: z.string().min(1).describe('Snapshot directory path (non-empty)'),
  intervalSteps: z.number().int().min(1).describe('Steps between snapshots (>= 1)'),
}).strict();

export const RuntimeConfigSchema = z.object({
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).describe('Logging level'),
  snapshots: SnapshotsConfigSchema,
}).strict();

export const AppConfigSchema = z.object({
  planet: PlanetConfigSchema,
  time: TimeConfigSchema,
  grids: GridsConfigSchema,
  runtime: RuntimeConfigSchema,
}).strict();

export type AppConfigInput = z.input<typeof AppConfigSchema>;
export type AppConfig = z.output<typeof AppConfigSchema>;

export interface DerivedConfig {
  atmosphereCellsTotal: number;
  landChunkSizeCells: number;
  landChunkSizeM: number;
  landChunkSizeKm: number;
  acceleration: number;
  worldChunksX: number;
  worldChunksY: number;
  worldCellsX: number;
  worldCellsY: number;
}

export interface ValidatedConfig {
  planet: AppConfig['planet'];
  time: AppConfig['time'];
  grids: AppConfig['grids'];
  runtime: AppConfig['runtime'];
  derived: DerivedConfig;
}
