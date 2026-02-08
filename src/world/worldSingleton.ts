/**
 * World Singleton — Server-wide access to the initialized world.
 *
 * Holds the LandChunkManager and WorldGenMetadata after world initialization.
 * Call `initWorld(config)` once at server startup, then use `getWorld()` from
 * routes and engine handlers.
 */

import { initializeWorld, type WorldInitConfig } from '../terrain/worldInit';
import { createLandChunkManager, type LandChunkManager } from '../land/landChunkManager';
import type { WorldGenMetadata } from '../terrain/terrainGen';

// ── Types ───────────────────────────────────────────────────────────

export interface WorldState {
  /** The chunk manager for lazy-loading land chunks */
  chunkManager: LandChunkManager;
  /** Pre-computed world metadata (ocean mask, coast distances, etc.) */
  metadata: WorldGenMetadata;
}

// ── Module-level singleton ──────────────────────────────────────────

let worldState: WorldState | null = null;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Initialize the world. Call once at server startup.
 * Throws if already initialized.
 */
export function initWorld(
  worldConfig: WorldInitConfig,
  maxResidentChunks: number = 4096,
): WorldState {
  if (worldState !== null) {
    throw new Error('World is already initialized. Restart the server to re-initialize.');
  }

  const { chunkGenerator, metadata } = initializeWorld(worldConfig);

  const chunkManager = createLandChunkManager(
    {
      chunkCells: worldConfig.chunkCells,
      worldChunksX: Math.round(worldConfig.worldWidthM / (worldConfig.chunkCells * worldConfig.landCellSizeM)),
      worldChunksY: Math.round(worldConfig.worldHeightM / (worldConfig.chunkCells * worldConfig.landCellSizeM)),
      maxResidentChunks,
    },
    chunkGenerator,
  );

  worldState = { chunkManager, metadata };

  console.log(`[World] Initialized: ${chunkManager.worldChunksX}×${chunkManager.worldChunksY} chunks, max resident ${maxResidentChunks}`);

  return worldState;
}

/**
 * Get the current world state. Returns null if not initialized.
 */
export function getWorld(): WorldState | null {
  return worldState;
}

/**
 * Reset world state. Intended for testing only.
 * @internal
 */
export function _resetWorldSingleton(): void {
  if (worldState !== null) {
    worldState.chunkManager.clear();
    worldState = null;
  }
}
