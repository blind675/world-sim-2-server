/**
 * Ghost Border — Read-only 1-cell-wide halo around a chunk.
 *
 * Before running hydrology on a chunk, we copy the terrain and water
 * data from the 8 neighboring chunks' edge cells into a halo buffer.
 * The D8 routing can then read from the halo for edge cells without
 * needing direct access to neighbor chunks during the routing loop.
 *
 * Layout: The halo surrounds a chunkCells×chunkCells interior.
 * The full padded grid is (chunkCells+2)×(chunkCells+2).
 *
 *   Corner cells come from diagonal neighbor chunks.
 *   Edge strips come from cardinal neighbor chunks.
 *
 * Coordinates in the padded grid:
 *   (0,0) = NW corner neighbor's (chunkCells-1, chunkCells-1)
 *   (1..chunkCells, 0) = N neighbor's bottom row
 *   (chunkCells+1, 0) = NE corner neighbor's (0, chunkCells-1)
 *   etc.
 *
 * The ghost border is read-only — water only flows OUT of the chunk
 * into the halo conceptually, but we don't write back to neighbors.
 * Inflow from neighbors happens when THEIR hydrology runs.
 */

import type { LandChunk } from './landChunk';
import type { LandChunkManager } from './landChunkManager';

// ── Types ───────────────────────────────────────────────────────────

export interface GhostBorder {
  /** Terrain height in the padded grid: (chunkCells+2)² */
  terrainHeightM: Float32Array;
  /** Water depth in the padded grid: (chunkCells+2)² */
  waterDepthM: Float32Array;
  /** Padded grid side length (chunkCells + 2) */
  paddedSize: number;
  /** Original chunk cells per side */
  chunkCells: number;
}

// ── Builder ─────────────────────────────────────────────────────────

/**
 * Build a ghost border for a chunk by reading edge data from neighbors.
 *
 * @param cx - Chunk X coordinate
 * @param cy - Chunk Y coordinate
 * @param manager - LandChunkManager (provides neighbor access + toroidal wrapping)
 * @returns GhostBorder with padded terrain and water arrays
 */
export function buildGhostBorder(
  cx: number,
  cy: number,
  manager: LandChunkManager,
): GhostBorder {
  const cc = manager.chunkCells;
  const ps = cc + 2; // padded size
  const totalCells = ps * ps;

  const terrainHeightM = new Float32Array(totalCells);
  const waterDepthM = new Float32Array(totalCells);

  // Get the center chunk
  const center = manager.getChunk(cx, cy);

  // Copy center chunk data into padded grid interior (offset by 1,1)
  for (let ly = 0; ly < cc; ly++) {
    for (let lx = 0; lx < cc; lx++) {
      const srcIdx = ly * cc + lx;
      const dstIdx = (ly + 1) * ps + (lx + 1);
      terrainHeightM[dstIdx] = center.data.terrainHeightM[srcIdx];
      waterDepthM[dstIdx] = center.data.waterDepthM[srcIdx];
    }
  }

  // ── Fill halo from 8 neighbors ────────────────────────────────────
  // The LandChunkManager handles toroidal wrapping internally via getChunk.

  // N neighbor (cx, cy-1): copy its bottom row → padded row 0, cols 1..cc
  const nChunk = manager.getChunk(cx, cy - 1);
  for (let lx = 0; lx < cc; lx++) {
    const srcIdx = (cc - 1) * cc + lx; // bottom row of N neighbor
    const dstIdx = 0 * ps + (lx + 1);  // top halo row
    terrainHeightM[dstIdx] = nChunk.data.terrainHeightM[srcIdx];
    waterDepthM[dstIdx] = nChunk.data.waterDepthM[srcIdx];
  }

  // S neighbor (cx, cy+1): copy its top row → padded row cc+1, cols 1..cc
  const sChunk = manager.getChunk(cx, cy + 1);
  for (let lx = 0; lx < cc; lx++) {
    const srcIdx = 0 * cc + lx; // top row of S neighbor
    const dstIdx = (cc + 1) * ps + (lx + 1);
    terrainHeightM[dstIdx] = sChunk.data.terrainHeightM[srcIdx];
    waterDepthM[dstIdx] = sChunk.data.waterDepthM[srcIdx];
  }

  // W neighbor (cx-1, cy): copy its right column → padded col 0, rows 1..cc
  const wChunk = manager.getChunk(cx - 1, cy);
  for (let ly = 0; ly < cc; ly++) {
    const srcIdx = ly * cc + (cc - 1); // right column of W neighbor
    const dstIdx = (ly + 1) * ps + 0;
    terrainHeightM[dstIdx] = wChunk.data.terrainHeightM[srcIdx];
    waterDepthM[dstIdx] = wChunk.data.waterDepthM[srcIdx];
  }

  // E neighbor (cx+1, cy): copy its left column → padded col cc+1, rows 1..cc
  const eChunk = manager.getChunk(cx + 1, cy);
  for (let ly = 0; ly < cc; ly++) {
    const srcIdx = ly * cc + 0; // left column of E neighbor
    const dstIdx = (ly + 1) * ps + (cc + 1);
    terrainHeightM[dstIdx] = eChunk.data.terrainHeightM[srcIdx];
    waterDepthM[dstIdx] = eChunk.data.waterDepthM[srcIdx];
  }

  // NW corner (cx-1, cy-1): single cell (bottom-right of NW neighbor)
  const nwChunk = manager.getChunk(cx - 1, cy - 1);
  const nwSrc = (cc - 1) * cc + (cc - 1);
  terrainHeightM[0 * ps + 0] = nwChunk.data.terrainHeightM[nwSrc];
  waterDepthM[0 * ps + 0] = nwChunk.data.waterDepthM[nwSrc];

  // NE corner (cx+1, cy-1): single cell (bottom-left of NE neighbor)
  const neChunk = manager.getChunk(cx + 1, cy - 1);
  const neSrc = (cc - 1) * cc + 0;
  terrainHeightM[0 * ps + (cc + 1)] = neChunk.data.terrainHeightM[neSrc];
  waterDepthM[0 * ps + (cc + 1)] = neChunk.data.waterDepthM[neSrc];

  // SW corner (cx-1, cy+1): single cell (top-right of SW neighbor)
  const swChunk = manager.getChunk(cx - 1, cy + 1);
  const swSrc = 0 * cc + (cc - 1);
  terrainHeightM[(cc + 1) * ps + 0] = swChunk.data.terrainHeightM[swSrc];
  waterDepthM[(cc + 1) * ps + 0] = swChunk.data.waterDepthM[swSrc];

  // SE corner (cx+1, cy+1): single cell (top-left of SE neighbor)
  const seChunk = manager.getChunk(cx + 1, cy + 1);
  const seSrc = 0 * cc + 0;
  terrainHeightM[(cc + 1) * ps + (cc + 1)] = seChunk.data.terrainHeightM[seSrc];
  waterDepthM[(cc + 1) * ps + (cc + 1)] = seChunk.data.waterDepthM[seSrc];

  return {
    terrainHeightM,
    waterDepthM,
    paddedSize: ps,
    chunkCells: cc,
  };
}

/**
 * Convert padded grid coordinates to a flat index.
 */
export function paddedIndex(px: number, py: number, paddedSize: number): number {
  return py * paddedSize + px;
}
