/**
 * Hydrology Router — D8 fraction-based surface water routing (intra-chunk).
 *
 * Each sub-step:
 *   1. For every cell with waterDepthM > 0, compute surface level
 *      (terrainHeightM + waterDepthM).
 *   2. Find the lowest D8 neighbor by surface level.
 *   3. If the neighbor's surface is lower, transfer a fraction of the
 *      movable water (the difference in surface levels, capped by available water).
 *   4. Accumulate runoffFlux for each cell that receives flow.
 *
 * Water at chunk edges accumulates (no cross-chunk flow in this module).
 * Cross-chunk synchronization is handled separately.
 *
 * Ocean cells (terrainHeightM < 0 with waterDepthM > 0 from init) are
 * treated as sinks — water flows into them but they don't route further
 * (their surface level is ~0, so they naturally attract downhill flow).
 */

import type { LandChunkData } from './landChunk';
import type { GhostBorder } from './ghostBorder';
import type { LandChunkManager } from './landChunkManager';
import { buildGhostBorder } from './ghostBorder';

// ── Types ───────────────────────────────────────────────────────────

export interface HydrologyConfig {
  /** Fraction of movable water transferred per sub-step (0..1). Default 0.4 */
  flowFraction: number;
  /** Number of sub-steps per hydrology tick. Default 8 */
  subStepsPerTick: number;
  /** Minimum water depth to consider for routing (meters). Default 1e-6 */
  minWaterDepthM: number;
  /** Whether to accumulate runoffFlux. Default true */
  trackRunoffFlux: boolean;
}

export interface HydrologyStats {
  /** Total water volume moved (meters * cells) during this tick */
  totalFlowVolume: number;
  /** Number of cells that had water routed */
  activeCells: number;
  /** Number of sub-steps executed */
  subSteps: number;
}

// ── D8 neighbor offsets ─────────────────────────────────────────────

// D8: 8 directions (dx, dy) — cardinal + diagonal
// Order: N, NE, E, SE, S, SW, W, NW
const D8_DX = [0, 1, 1, 1, 0, -1, -1, -1];
const D8_DY = [-1, -1, 0, 1, 1, 1, 0, -1];

// Distance weights for diagonal vs cardinal (for flow fraction scaling)
// Cardinal = 1.0, Diagonal = 1/sqrt(2) ≈ 0.707
const D8_WEIGHT = [1.0, 0.7071, 1.0, 0.7071, 1.0, 0.7071, 1.0, 0.7071];

// ── Default config ──────────────────────────────────────────────────

export function createDefaultHydrologyConfig(): HydrologyConfig {
  return {
    flowFraction: 0.4,
    subStepsPerTick: 8,
    minWaterDepthM: 1e-6,
    trackRunoffFlux: true,
  };
}

// ── Core routing ────────────────────────────────────────────────────

/**
 * Run one hydrology tick on a single chunk's data arrays.
 *
 * @param data - The chunk's SoA data arrays (modified in place)
 * @param chunkCells - Number of cells per side
 * @param config - Hydrology configuration
 * @param ghost - Optional ghost border for cross-chunk D8 lookups at edges.
 *               If provided, edge cells can see neighbor chunk data.
 *               Water that flows to a ghost cell is removed from the chunk
 *               (it will appear in the neighbor when that chunk runs its hydrology).
 * @returns Statistics about the routing step
 */
export function stepChunkHydrology(
  data: LandChunkData,
  chunkCells: number,
  config: HydrologyConfig = createDefaultHydrologyConfig(),
  ghost?: GhostBorder,
): HydrologyStats {
  const { terrainHeightM, waterDepthM, runoffFlux } = data;
  const cellCount = chunkCells * chunkCells;

  // If ghost border provided, use padded grid for neighbor lookups
  const ps = ghost ? ghost.paddedSize : 0;
  const ghostTerrain = ghost ? ghost.terrainHeightM : null;
  const ghostWater = ghost ? ghost.waterDepthM : null;

  let totalFlowVolume = 0;
  const activeCellSet = new Set<number>();

  // We need a temporary buffer for water changes to avoid order-dependent artifacts.
  // deltaWater[i] accumulates the net change for cell i during one sub-step.
  const deltaWater = new Float32Array(cellCount);

  for (let step = 0; step < config.subStepsPerTick; step++) {
    // Clear delta buffer
    deltaWater.fill(0);

    for (let y = 0; y < chunkCells; y++) {
      for (let x = 0; x < chunkCells; x++) {
        const idx = y * chunkCells + x;
        const water = waterDepthM[idx];

        // Skip cells with negligible water
        if (water < config.minWaterDepthM) continue;

        const surfaceLevel = terrainHeightM[idx] + water;

        // Find the lowest D8 neighbor
        let lowestIdx = -1;       // index in chunk's own arrays (-1 = none or ghost)
        let lowestIsGhost = false; // true if lowest neighbor is in the ghost border
        let lowestSurface = surfaceLevel;
        let lowestWeight = 1.0;

        for (let d = 0; d < 8; d++) {
          const nx = x + D8_DX[d];
          const ny = y + D8_DY[d];

          let nSurface: number;

          if (nx >= 0 && nx < chunkCells && ny >= 0 && ny < chunkCells) {
            // Interior neighbor
            const nIdx = ny * chunkCells + nx;
            nSurface = terrainHeightM[nIdx] + waterDepthM[nIdx];

            if (nSurface < lowestSurface) {
              lowestSurface = nSurface;
              lowestIdx = nIdx;
              lowestIsGhost = false;
              lowestWeight = D8_WEIGHT[d];
            }
          } else if (ghostTerrain && ghostWater) {
            // Edge neighbor — read from ghost border padded grid
            // Padded coords: interior starts at (1,1)
            const px = nx + 1;
            const py = ny + 1;
            const pIdx = py * ps + px;
            nSurface = ghostTerrain[pIdx] + ghostWater[pIdx];

            if (nSurface < lowestSurface) {
              lowestSurface = nSurface;
              lowestIdx = -2; // sentinel: ghost cell
              lowestIsGhost = true;
              lowestWeight = D8_WEIGHT[d];
            }
          }
          // else: no ghost border, skip out-of-bounds (water accumulates at edge)
        }

        // No downhill neighbor — water stays (depression or flat)
        if (lowestIdx === -1 && !lowestIsGhost) continue;

        // Compute flow amount
        const surfaceDiff = surfaceLevel - lowestSurface;
        const maxTransfer = Math.min(water, surfaceDiff * 0.5);
        const flow = maxTransfer * config.flowFraction * lowestWeight;

        if (flow < config.minWaterDepthM) continue;

        // Record delta
        deltaWater[idx] -= flow;

        if (!lowestIsGhost) {
          // Flow to interior neighbor
          deltaWater[lowestIdx] += flow;
          if (config.trackRunoffFlux) {
            runoffFlux[lowestIdx] += flow;
          }
        }
        // else: flow to ghost cell — water leaves this chunk.
        // It will appear in the neighbor chunk when that chunk's hydrology runs
        // and reads its own ghost border showing this chunk's lowered water level.

        totalFlowVolume += flow;
        activeCellSet.add(idx);
      }
    }

    // Apply deltas
    for (let i = 0; i < cellCount; i++) {
      if (deltaWater[i] !== 0) {
        waterDepthM[i] += deltaWater[i];
        // Clamp to non-negative (floating point safety)
        if (waterDepthM[i] < 0) waterDepthM[i] = 0;
      }
    }
  }

  return {
    totalFlowVolume,
    activeCells: activeCellSet.size,
    subSteps: config.subStepsPerTick,
  };
}

/**
 * Run hydrology on a chunk with ghost borders from neighboring chunks.
 *
 * Convenience function that builds the ghost border from the LandChunkManager
 * and then runs the hydrology routing.
 *
 * @param cx - Chunk X coordinate
 * @param cy - Chunk Y coordinate
 * @param manager - LandChunkManager for neighbor access
 * @param config - Hydrology configuration
 * @returns Statistics about the routing step
 */
export function stepChunkHydrologyWithBorders(
  cx: number,
  cy: number,
  manager: LandChunkManager,
  config: HydrologyConfig = createDefaultHydrologyConfig(),
): HydrologyStats {
  const chunk = manager.getChunk(cx, cy);
  const ghost = buildGhostBorder(cx, cy, manager);
  return stepChunkHydrology(chunk.data, manager.chunkCells, config, ghost);
}

/**
 * Add water to a chunk (e.g., from precipitation).
 * Distributes `amountM` meters of water uniformly across all land cells
 * (cells where terrainHeightM >= 0).
 */
export function addPrecipitation(
  data: LandChunkData,
  chunkCells: number,
  amountM: number,
): number {
  const { terrainHeightM, waterDepthM } = data;
  const cellCount = chunkCells * chunkCells;
  let cellsWetted = 0;

  for (let i = 0; i < cellCount; i++) {
    if (terrainHeightM[i] >= 0) {
      waterDepthM[i] += amountM;
      cellsWetted++;
    }
  }

  return cellsWetted;
}

/**
 * Add water to a specific cell (e.g., from a point source or test).
 */
export function addWaterAtCell(
  data: LandChunkData,
  chunkCells: number,
  localX: number,
  localY: number,
  amountM: number,
): void {
  const idx = localY * chunkCells + localX;
  data.waterDepthM[idx] += amountM;
}

/**
 * Compute total water volume in a chunk (sum of waterDepthM).
 * Useful for conservation checks in tests.
 */
export function totalWaterVolume(waterDepthM: Float32Array): number {
  let total = 0;
  for (let i = 0; i < waterDepthM.length; i++) {
    total += waterDepthM[i];
  }
  return total;
}

/**
 * Count cells with water above a threshold.
 */
export function countWetCells(
  waterDepthM: Float32Array,
  threshold: number = 1e-6,
): number {
  let count = 0;
  for (let i = 0; i < waterDepthM.length; i++) {
    if (waterDepthM[i] > threshold) count++;
  }
  return count;
}
