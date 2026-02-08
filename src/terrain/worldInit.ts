/**
 * World Initialization — Orchestrates terrain generation.
 *
 * Called once at world creation to:
 *   1. Create a TerrainGenerator from config
 *   2. Compute world metadata (ocean fraction bias, bathymetry distance map)
 *   3. Return a chunk generator function for the LandChunkManager
 */

import {
  TerrainGenerator,
  createDefaultTerrainGenConfig,
  type TerrainGenConfig,
  type WorldGenMetadata,
} from './terrainGen';
import type { LandChunk } from '../land/landChunk';
import type { ChunkGenerator } from '../land/landChunkManager';

// ── Types ───────────────────────────────────────────────────────────

export interface WorldInitConfig {
  seed: number;
  worldWidthM: number;
  worldHeightM: number;
  worldCellsX: number;
  worldCellsY: number;
  landCellSizeM: number;
  chunkCells: number;
}

export interface WorldInitResult {
  /** Chunk generator function to pass to LandChunkManager */
  chunkGenerator: ChunkGenerator;
  /** Pre-computed world metadata */
  metadata: WorldGenMetadata;
  /** The terrain generator instance (for direct sampling if needed) */
  terrainGenerator: TerrainGenerator;
  /** Terrain generation config used */
  terrainConfig: TerrainGenConfig;
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Initialize the world: compute global metadata and return a chunk generator.
 *
 * This is a potentially expensive operation (coarse sampling pass for ocean
 * fraction + BFS for bathymetry). Call once at world creation.
 */
export function initializeWorld(
  config: WorldInitConfig,
  terrainConfigOverrides?: Partial<TerrainGenConfig>,
): WorldInitResult {
  const terrainConfig: TerrainGenConfig = {
    ...createDefaultTerrainGenConfig(
      config.seed,
      config.worldWidthM,
      config.worldHeightM,
      config.worldCellsX,
      config.worldCellsY,
      config.landCellSizeM,
      config.chunkCells,
    ),
    ...terrainConfigOverrides,
  };

  const terrainGenerator = new TerrainGenerator(terrainConfig);

  console.log('[WorldInit] Computing world metadata (ocean fraction bias + bathymetry)...');
  const startMs = performance.now();

  const metadata = terrainGenerator.computeWorldMetadata();

  const elapsedMs = performance.now() - startMs;
  console.log(`[WorldInit] World metadata computed in ${elapsedMs.toFixed(0)}ms`);
  console.log(`[WorldInit] seaLevelBiasM = ${metadata.seaLevelBiasM.toFixed(1)}`);

  // Compute actual ocean fraction for logging
  let oceanCount = 0;
  for (let i = 0; i < metadata.coastLandMask.length; i++) {
    if (metadata.coastLandMask[i] === 0) oceanCount++;
  }
  const actualOceanFraction = oceanCount / metadata.coastLandMask.length;
  console.log(`[WorldInit] Ocean fraction: ${(actualOceanFraction * 100).toFixed(1)}%`);

  // Create chunk generator closure (terrain + ocean water init)
  const chunkGenerator: ChunkGenerator = (chunk: LandChunk) => {
    terrainGenerator.generateChunkTerrain(
      chunk.cx,
      chunk.cy,
      chunk.data.terrainHeightM,
      metadata,
    );
    terrainGenerator.initializeOceanWater(
      chunk.cx,
      chunk.cy,
      chunk.data.terrainHeightM,
      chunk.data.waterDepthM,
      metadata,
    );
  };

  return {
    chunkGenerator,
    metadata,
    terrainGenerator,
    terrainConfig,
  };
}
