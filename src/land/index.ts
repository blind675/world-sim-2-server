export {
  type LandChunkData,
  type LandChunk,
  createLandChunk,
  cellIndex,
  chunkMemoryBytes,
} from './landChunk';

export {
  type ChunkGenerator,
  type LandChunkManagerConfig,
  type LandChunkManagerStats,
  type LandChunkManager,
  createLandChunkManager,
} from './landChunkManager';

export {
  type HydrologyConfig,
  type HydrologyStats,
  createDefaultHydrologyConfig,
  stepChunkHydrology,
  stepChunkHydrologyWithBorders,
  addPrecipitation,
  addWaterAtCell,
  totalWaterVolume,
  countWetCells,
} from './hydrology';

export {
  type GhostBorder,
  buildGhostBorder,
  paddedIndex,
} from './ghostBorder';

export {
  type LandMetrics,
  type MetricsConfig,
  createDefaultMetricsConfig,
  computeChunkMetrics,
  emptyMetrics,
  mergeMetrics,
  computeResidentMetrics,
} from './landMetrics';
