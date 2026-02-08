/**
 * Land Metrics — River/puddle counts, water coverage, and volume stats.
 *
 * Computes per-chunk metrics from LandChunkData arrays, and aggregates
 * across multiple chunks for world-level reporting.
 *
 * Definitions:
 *   - "wet cell": waterDepthM > threshold (default 1e-4 m = 0.1 mm)
 *   - "river cell": runoffFlux > riverFluxThreshold (high cumulative flow)
 *   - "puddle cell": wet cell that is NOT a river cell and NOT ocean
 *   - "ocean cell": terrainHeightM < 0 (below sea level terrain)
 *   - "land cell": terrainHeightM >= 0
 *   - "water coverage": fraction of land cells that are wet
 */

import type { LandChunkData } from './landChunk';
import type { LandChunkManager } from './landChunkManager';

// ── Types ───────────────────────────────────────────────────────────

export interface LandMetrics {
  /** Total number of cells scanned */
  totalCells: number;
  /** Number of land cells (terrainHeightM >= 0) */
  landCells: number;
  /** Number of ocean cells (terrainHeightM < 0) */
  oceanCells: number;
  /** Number of wet land cells (waterDepthM > threshold on land) */
  wetLandCells: number;
  /** Number of river cells (high runoffFlux on land) */
  riverCells: number;
  /** Number of puddle cells (wet land, not river, not ocean) */
  puddleCells: number;
  /** Fraction of land cells that are wet [0..1] */
  waterCoverage: number;
  /** Total water volume on land cells (sum of waterDepthM for land cells, in meters) */
  landWaterVolumeM: number;
  /** Total water volume on ocean cells (sum of waterDepthM for ocean cells, in meters) */
  oceanWaterVolumeM: number;
  /** Maximum runoffFlux value observed */
  maxRunoffFlux: number;
}

export interface MetricsConfig {
  /** Minimum waterDepthM to count as "wet" (meters). Default 1e-4 */
  wetThresholdM: number;
  /** Minimum runoffFlux to classify as "river" cell. Default 1.0 */
  riverFluxThreshold: number;
}

// ── Default config ──────────────────────────────────────────────────

export function createDefaultMetricsConfig(): MetricsConfig {
  return {
    wetThresholdM: 1e-4,
    riverFluxThreshold: 1.0,
  };
}

// ── Per-chunk metrics ───────────────────────────────────────────────

/**
 * Compute metrics for a single chunk's data arrays.
 */
export function computeChunkMetrics(
  data: LandChunkData,
  chunkCells: number,
  config: MetricsConfig = createDefaultMetricsConfig(),
): LandMetrics {
  const cellCount = chunkCells * chunkCells;
  const { terrainHeightM, waterDepthM, runoffFlux } = data;

  let landCells = 0;
  let oceanCells = 0;
  let wetLandCells = 0;
  let riverCells = 0;
  let puddleCells = 0;
  let landWaterVolumeM = 0;
  let oceanWaterVolumeM = 0;
  let maxRunoffFlux = 0;

  for (let i = 0; i < cellCount; i++) {
    const isLand = terrainHeightM[i] >= 0;
    const water = waterDepthM[i];
    const flux = runoffFlux[i];

    if (flux > maxRunoffFlux) maxRunoffFlux = flux;

    if (isLand) {
      landCells++;
      landWaterVolumeM += water;

      if (water > config.wetThresholdM) {
        wetLandCells++;

        if (flux >= config.riverFluxThreshold) {
          riverCells++;
        } else {
          puddleCells++;
        }
      }
    } else {
      oceanCells++;
      oceanWaterVolumeM += water;
    }
  }

  return {
    totalCells: cellCount,
    landCells,
    oceanCells,
    wetLandCells,
    riverCells,
    puddleCells,
    waterCoverage: landCells > 0 ? wetLandCells / landCells : 0,
    landWaterVolumeM,
    oceanWaterVolumeM,
    maxRunoffFlux,
  };
}

// ── Aggregation ─────────────────────────────────────────────────────

/**
 * Create an empty metrics object for aggregation.
 */
export function emptyMetrics(): LandMetrics {
  return {
    totalCells: 0,
    landCells: 0,
    oceanCells: 0,
    wetLandCells: 0,
    riverCells: 0,
    puddleCells: 0,
    waterCoverage: 0,
    landWaterVolumeM: 0,
    oceanWaterVolumeM: 0,
    maxRunoffFlux: 0,
  };
}

/**
 * Merge a chunk's metrics into an accumulator (mutates `acc`).
 */
export function mergeMetrics(acc: LandMetrics, chunk: LandMetrics): void {
  acc.totalCells += chunk.totalCells;
  acc.landCells += chunk.landCells;
  acc.oceanCells += chunk.oceanCells;
  acc.wetLandCells += chunk.wetLandCells;
  acc.riverCells += chunk.riverCells;
  acc.puddleCells += chunk.puddleCells;
  acc.landWaterVolumeM += chunk.landWaterVolumeM;
  acc.oceanWaterVolumeM += chunk.oceanWaterVolumeM;
  if (chunk.maxRunoffFlux > acc.maxRunoffFlux) {
    acc.maxRunoffFlux = chunk.maxRunoffFlux;
  }
  // Recompute waterCoverage from totals
  acc.waterCoverage = acc.landCells > 0 ? acc.wetLandCells / acc.landCells : 0;
}

/**
 * Compute aggregated metrics across all resident chunks in a LandChunkManager.
 */
export function computeResidentMetrics(
  manager: LandChunkManager,
  config: MetricsConfig = createDefaultMetricsConfig(),
): LandMetrics {
  const acc = emptyMetrics();
  manager.forEachResident((chunk) => {
    const chunkMetrics = computeChunkMetrics(chunk.data, chunk.chunkCells, config);
    mergeMetrics(acc, chunkMetrics);
  });
  return acc;
}
