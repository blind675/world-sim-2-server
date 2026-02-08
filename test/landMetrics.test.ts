import {
  computeChunkMetrics,
  emptyMetrics,
  mergeMetrics,
  computeResidentMetrics,
  createDefaultMetricsConfig,
  type MetricsConfig,
} from '../src/land/landMetrics';
import { createLandChunk, cellIndex } from '../src/land/landChunk';
import { createLandChunkManager } from '../src/land/landChunkManager';

const CC = 4; // small chunk for fast tests

function flatLandChunk(height: number) {
  const chunk = createLandChunk(0, 0, CC);
  chunk.data.terrainHeightM.fill(height);
  return chunk;
}

function mixedChunk() {
  // Half land (100m), half ocean (-100m)
  const chunk = createLandChunk(0, 0, CC);
  for (let y = 0; y < CC; y++) {
    for (let x = 0; x < CC; x++) {
      chunk.data.terrainHeightM[y * CC + x] = x < CC / 2 ? 100 : -100;
    }
  }
  return chunk;
}

describe('computeChunkMetrics', () => {
  it('should count all cells as land on a flat land chunk', () => {
    const chunk = flatLandChunk(100);
    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.totalCells).toBe(CC * CC);
    expect(m.landCells).toBe(CC * CC);
    expect(m.oceanCells).toBe(0);
    expect(m.wetLandCells).toBe(0);
    expect(m.riverCells).toBe(0);
    expect(m.puddleCells).toBe(0);
    expect(m.waterCoverage).toBe(0);
    expect(m.landWaterVolumeM).toBe(0);
    expect(m.oceanWaterVolumeM).toBe(0);
    expect(m.maxRunoffFlux).toBe(0);
  });

  it('should count ocean cells correctly', () => {
    const chunk = mixedChunk();
    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.landCells).toBe(CC * CC / 2);
    expect(m.oceanCells).toBe(CC * CC / 2);
  });

  it('should detect wet land cells', () => {
    const chunk = flatLandChunk(100);
    // Add water to 3 cells
    chunk.data.waterDepthM[0] = 0.5;
    chunk.data.waterDepthM[1] = 0.01;
    chunk.data.waterDepthM[2] = 0.001; // above default threshold 1e-4

    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.wetLandCells).toBe(3);
    expect(m.waterCoverage).toBeCloseTo(3 / (CC * CC), 5);
  });

  it('should not count ocean water as wet land', () => {
    const chunk = mixedChunk();
    // Add water to ocean cells
    for (let y = 0; y < CC; y++) {
      for (let x = CC / 2; x < CC; x++) {
        chunk.data.waterDepthM[y * CC + x] = 100; // ocean water
      }
    }

    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.wetLandCells).toBe(0);
    expect(m.waterCoverage).toBe(0);
    expect(m.oceanWaterVolumeM).toBeGreaterThan(0);
  });

  it('should classify river cells by runoffFlux threshold', () => {
    const chunk = flatLandChunk(100);
    // Cell 0: wet + high flux = river
    chunk.data.waterDepthM[0] = 1.0;
    chunk.data.runoffFlux[0] = 5.0;
    // Cell 1: wet + low flux = puddle
    chunk.data.waterDepthM[1] = 1.0;
    chunk.data.runoffFlux[1] = 0.1;
    // Cell 2: dry + high flux = not counted (not wet)
    chunk.data.runoffFlux[2] = 10.0;

    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.riverCells).toBe(1);
    expect(m.puddleCells).toBe(1);
    expect(m.wetLandCells).toBe(2);
  });

  it('should compute land and ocean water volumes', () => {
    const chunk = mixedChunk();
    // Land water
    chunk.data.waterDepthM[0] = 2.0;
    chunk.data.waterDepthM[1] = 3.0;
    // Ocean water (x >= CC/2)
    chunk.data.waterDepthM[CC / 2] = 100.0;

    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.landWaterVolumeM).toBeCloseTo(5.0, 5);
    expect(m.oceanWaterVolumeM).toBeCloseTo(100.0, 5);
  });

  it('should track maxRunoffFlux', () => {
    const chunk = flatLandChunk(100);
    chunk.data.runoffFlux[3] = 42.5;
    chunk.data.runoffFlux[7] = 10.0;

    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.maxRunoffFlux).toBe(42.5);
  });

  it('should respect custom thresholds', () => {
    const chunk = flatLandChunk(100);
    chunk.data.waterDepthM[0] = 0.5;
    chunk.data.runoffFlux[0] = 3.0;
    chunk.data.waterDepthM[1] = 0.5;
    chunk.data.runoffFlux[1] = 0.5;

    const config: MetricsConfig = {
      wetThresholdM: 0.1,
      riverFluxThreshold: 2.0,
    };

    const m = computeChunkMetrics(chunk.data, CC, config);

    expect(m.riverCells).toBe(1);
    expect(m.puddleCells).toBe(1);
  });

  it('should handle all-ocean chunk', () => {
    const chunk = createLandChunk(0, 0, CC);
    chunk.data.terrainHeightM.fill(-500);
    chunk.data.waterDepthM.fill(500);

    const m = computeChunkMetrics(chunk.data, CC);

    expect(m.landCells).toBe(0);
    expect(m.oceanCells).toBe(CC * CC);
    expect(m.wetLandCells).toBe(0);
    expect(m.waterCoverage).toBe(0);
    expect(m.oceanWaterVolumeM).toBeCloseTo(500 * CC * CC, 1);
  });

  it('should handle cells just at the wet threshold', () => {
    const chunk = flatLandChunk(100);
    const cfg = createDefaultMetricsConfig();
    chunk.data.waterDepthM[0] = cfg.wetThresholdM; // exactly at threshold
    chunk.data.waterDepthM[1] = cfg.wetThresholdM + 1e-8; // just above

    const m = computeChunkMetrics(chunk.data, CC, cfg);

    // Exactly at threshold is NOT wet (> not >=)
    expect(m.wetLandCells).toBe(1);
  });
});

describe('emptyMetrics', () => {
  it('should return all zeros', () => {
    const m = emptyMetrics();
    expect(m.totalCells).toBe(0);
    expect(m.landCells).toBe(0);
    expect(m.oceanCells).toBe(0);
    expect(m.wetLandCells).toBe(0);
    expect(m.riverCells).toBe(0);
    expect(m.puddleCells).toBe(0);
    expect(m.waterCoverage).toBe(0);
    expect(m.landWaterVolumeM).toBe(0);
    expect(m.oceanWaterVolumeM).toBe(0);
    expect(m.maxRunoffFlux).toBe(0);
  });
});

describe('mergeMetrics', () => {
  it('should accumulate counts from two chunks', () => {
    const a = computeChunkMetrics(flatLandChunk(100).data, CC);
    const b = computeChunkMetrics(mixedChunk().data, CC);

    const acc = emptyMetrics();
    mergeMetrics(acc, a);
    mergeMetrics(acc, b);

    expect(acc.totalCells).toBe(2 * CC * CC);
    expect(acc.landCells).toBe(CC * CC + CC * CC / 2);
    expect(acc.oceanCells).toBe(CC * CC / 2);
  });

  it('should take max of runoffFlux', () => {
    const chunkA = flatLandChunk(100);
    chunkA.data.runoffFlux[0] = 10;
    const chunkB = flatLandChunk(100);
    chunkB.data.runoffFlux[0] = 50;

    const mA = computeChunkMetrics(chunkA.data, CC);
    const mB = computeChunkMetrics(chunkB.data, CC);

    const acc = emptyMetrics();
    mergeMetrics(acc, mA);
    mergeMetrics(acc, mB);

    expect(acc.maxRunoffFlux).toBe(50);
  });

  it('should recompute waterCoverage from totals', () => {
    const chunkA = flatLandChunk(100);
    chunkA.data.waterDepthM[0] = 1.0; // 1 wet out of 16 land
    const chunkB = flatLandChunk(100);
    chunkB.data.waterDepthM[0] = 1.0;
    chunkB.data.waterDepthM[1] = 1.0; // 2 wet out of 16 land

    const mA = computeChunkMetrics(chunkA.data, CC);
    const mB = computeChunkMetrics(chunkB.data, CC);

    const acc = emptyMetrics();
    mergeMetrics(acc, mA);
    mergeMetrics(acc, mB);

    // 3 wet out of 32 land
    expect(acc.waterCoverage).toBeCloseTo(3 / 32, 5);
  });
});

describe('computeResidentMetrics', () => {
  it('should aggregate metrics across all resident chunks', () => {
    const mgr = createLandChunkManager(
      { chunkCells: CC, worldChunksX: 3, worldChunksY: 3, maxResidentChunks: 100 },
      (chunk) => {
        chunk.data.terrainHeightM.fill(100);
      },
    );

    // Load 3 chunks
    const c0 = mgr.getChunk(0, 0);
    const c1 = mgr.getChunk(1, 0);
    const c2 = mgr.getChunk(2, 0);

    // Add some water
    c0.data.waterDepthM[0] = 1.0;
    c1.data.waterDepthM[0] = 2.0;
    c1.data.waterDepthM[1] = 3.0;

    const m = computeResidentMetrics(mgr);

    expect(m.totalCells).toBe(3 * CC * CC);
    expect(m.landCells).toBe(3 * CC * CC);
    expect(m.wetLandCells).toBe(3);
    expect(m.landWaterVolumeM).toBeCloseTo(6.0, 5);
  });

  it('should return empty metrics when no chunks are resident', () => {
    const mgr = createLandChunkManager(
      { chunkCells: CC, worldChunksX: 3, worldChunksY: 3, maxResidentChunks: 100 },
    );

    const m = computeResidentMetrics(mgr);

    expect(m.totalCells).toBe(0);
    expect(m.landCells).toBe(0);
    expect(m.waterCoverage).toBe(0);
  });
});
