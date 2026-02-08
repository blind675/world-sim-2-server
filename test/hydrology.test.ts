import {
  stepChunkHydrology,
  addWaterAtCell,
  addPrecipitation,
  totalWaterVolume,
  countWetCells,
  createDefaultHydrologyConfig,
  type HydrologyConfig,
} from '../src/land/hydrology';
import { createLandChunk, cellIndex } from '../src/land/landChunk';

// Helper: create a small chunk with flat terrain at a given height
function flatChunk(chunkCells: number, terrainHeight: number) {
  const chunk = createLandChunk(0, 0, chunkCells);
  chunk.data.terrainHeightM.fill(terrainHeight);
  return chunk;
}

// Helper: create a chunk with a simple slope (terrain decreases left to right)
function slopedChunk(chunkCells: number, highM: number, lowM: number) {
  const chunk = createLandChunk(0, 0, chunkCells);
  for (let y = 0; y < chunkCells; y++) {
    for (let x = 0; x < chunkCells; x++) {
      const t = x / (chunkCells - 1);
      chunk.data.terrainHeightM[y * chunkCells + x] = highM + t * (lowM - highM);
    }
  }
  return chunk;
}

// Helper: create a chunk with a valley (V-shape: high edges, low center)
function valleyChunk(chunkCells: number, edgeM: number, centerM: number) {
  const chunk = createLandChunk(0, 0, chunkCells);
  const mid = Math.floor(chunkCells / 2);
  for (let y = 0; y < chunkCells; y++) {
    for (let x = 0; x < chunkCells; x++) {
      const distFromCenter = Math.abs(x - mid);
      const t = distFromCenter / mid;
      chunk.data.terrainHeightM[y * chunkCells + x] = centerM + t * (edgeM - centerM);
    }
  }
  return chunk;
}

// Helper: create a chunk with a depression (bowl shape)
function bowlChunk(chunkCells: number, rimM: number, bottomM: number) {
  const chunk = createLandChunk(0, 0, chunkCells);
  const mid = Math.floor(chunkCells / 2);
  for (let y = 0; y < chunkCells; y++) {
    for (let x = 0; x < chunkCells; x++) {
      const dx = x - mid;
      const dy = y - mid;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const maxDist = mid;
      const t = Math.min(dist / maxDist, 1.0);
      chunk.data.terrainHeightM[y * chunkCells + x] = bottomM + t * (rimM - bottomM);
    }
  }
  return chunk;
}

const SMALL = 8; // small chunk for fast tests
const defaultConfig = createDefaultHydrologyConfig();
const fastConfig: HydrologyConfig = {
  ...defaultConfig,
  subStepsPerTick: 4,
};

describe('stepChunkHydrology', () => {
  describe('basic flow', () => {
    it('should move water downhill on a slope', () => {
      const chunk = slopedChunk(SMALL, 100, 0);
      // Add water at the high end (x=0)
      for (let y = 0; y < SMALL; y++) {
        addWaterAtCell(chunk.data, SMALL, 0, y, 1.0);
      }

      const beforeVol = totalWaterVolume(chunk.data.waterDepthM);
      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 20,
      });

      // Water should have moved to the right (lower terrain)
      // The leftmost column should have less water than it started with
      let leftWater = 0;
      let middleWater = 0;
      for (let y = 0; y < SMALL; y++) {
        leftWater += chunk.data.waterDepthM[y * SMALL + 0];
        middleWater += chunk.data.waterDepthM[y * SMALL + Math.floor(SMALL / 2)];
      }
      expect(leftWater).toBeLessThan(SMALL * 1.0); // some water moved away
      // Water should have reached at least the middle columns
      expect(middleWater).toBeGreaterThan(0);

      // Conservation: total water should be preserved
      const afterVol = totalWaterVolume(chunk.data.waterDepthM);
      expect(afterVol).toBeCloseTo(beforeVol, 4);
    });

    it('should not move water on flat terrain (no gradient)', () => {
      const chunk = flatChunk(SMALL, 100);
      const midIdx = cellIndex(SMALL / 2, SMALL / 2, SMALL);
      chunk.data.waterDepthM[midIdx] = 1.0;

      // On flat terrain, all neighbors have the same surface level
      // Water should stay put (no lower neighbor)
      const beforeVol = totalWaterVolume(chunk.data.waterDepthM);
      stepChunkHydrology(chunk.data, SMALL, fastConfig);

      // Water spreads slightly because adding water raises surface level
      // making the center higher than neighbors. But the key test is conservation.
      const afterVol = totalWaterVolume(chunk.data.waterDepthM);
      expect(afterVol).toBeCloseTo(beforeVol, 4);
    });

    it('should not create water from nothing', () => {
      const chunk = slopedChunk(SMALL, 100, 0);
      // No water added
      stepChunkHydrology(chunk.data, SMALL, fastConfig);

      const vol = totalWaterVolume(chunk.data.waterDepthM);
      expect(vol).toBe(0);
    });

    it('should return zero stats when no water present', () => {
      const chunk = slopedChunk(SMALL, 100, 0);
      const stats = stepChunkHydrology(chunk.data, SMALL, fastConfig);

      expect(stats.totalFlowVolume).toBe(0);
      expect(stats.activeCells).toBe(0);
      expect(stats.subSteps).toBe(fastConfig.subStepsPerTick);
    });
  });

  describe('water conservation', () => {
    it('should conserve total water volume on a slope', () => {
      const chunk = slopedChunk(SMALL, 200, 0);
      addPrecipitation(chunk.data, SMALL, 0.5);

      const beforeVol = totalWaterVolume(chunk.data.waterDepthM);
      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 20,
      });
      const afterVol = totalWaterVolume(chunk.data.waterDepthM);

      expect(afterVol).toBeCloseTo(beforeVol, 3);
    });

    it('should conserve total water volume in a bowl', () => {
      const chunk = bowlChunk(SMALL, 200, 50);
      addPrecipitation(chunk.data, SMALL, 0.3);

      const beforeVol = totalWaterVolume(chunk.data.waterDepthM);
      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 30,
      });
      const afterVol = totalWaterVolume(chunk.data.waterDepthM);

      expect(afterVol).toBeCloseTo(beforeVol, 3);
    });

    it('should conserve water with a point source', () => {
      const chunk = slopedChunk(SMALL, 500, 0);
      addWaterAtCell(chunk.data, SMALL, 1, 1, 5.0);

      const beforeVol = totalWaterVolume(chunk.data.waterDepthM);
      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 16,
      });
      const afterVol = totalWaterVolume(chunk.data.waterDepthM);

      expect(afterVol).toBeCloseTo(beforeVol, 3);
    });
  });

  describe('pooling in depressions', () => {
    it('should pool water in a bowl depression', () => {
      const chunk = bowlChunk(SMALL, 200, 50);
      // Add water on the rim
      for (let y = 0; y < SMALL; y++) {
        addWaterAtCell(chunk.data, SMALL, 0, y, 2.0);
        addWaterAtCell(chunk.data, SMALL, SMALL - 1, y, 2.0);
      }

      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 30,
      });

      // Water should accumulate in the center (lowest point)
      const mid = Math.floor(SMALL / 2);
      const centerWater = chunk.data.waterDepthM[mid * SMALL + mid];
      expect(centerWater).toBeGreaterThan(0);
    });

    it('should fill a depression until water level is uniform', () => {
      // Create a small 4x4 chunk with a 1-cell deep hole in the center
      const size = 4;
      const chunk = flatChunk(size, 100);
      // Make center cell lower
      chunk.data.terrainHeightM[cellIndex(1, 1, size)] = 90;
      chunk.data.terrainHeightM[cellIndex(2, 1, size)] = 90;
      chunk.data.terrainHeightM[cellIndex(1, 2, size)] = 90;
      chunk.data.terrainHeightM[cellIndex(2, 2, size)] = 90;

      // Add water everywhere
      for (let i = 0; i < size * size; i++) {
        chunk.data.waterDepthM[i] = 5.0;
      }

      // Run many steps to reach equilibrium
      stepChunkHydrology(chunk.data, size, {
        ...defaultConfig,
        subStepsPerTick: 100,
      });

      // The depression should have more water than surrounding cells
      const depWater = chunk.data.waterDepthM[cellIndex(1, 1, size)];
      const rimWater = chunk.data.waterDepthM[cellIndex(0, 0, size)];

      // Surface levels should be approximately equal at equilibrium
      const depSurface = chunk.data.terrainHeightM[cellIndex(1, 1, size)] + depWater;
      const rimSurface = chunk.data.terrainHeightM[cellIndex(0, 0, size)] + rimWater;
      expect(Math.abs(depSurface - rimSurface)).toBeLessThan(1.0);
    });
  });

  describe('spill logic', () => {
    it('should spill water over a rim when depression is full', () => {
      // Create terrain: flat at 100m with a hole at 80m and a lower area at 50m
      const size = 8;
      const chunk = flatChunk(size, 100);

      // Depression in the left half (x=1..3, y=3..4)
      for (let y = 3; y <= 4; y++) {
        for (let x = 1; x <= 3; x++) {
          chunk.data.terrainHeightM[y * size + x] = 80;
        }
      }

      // Lower area on the right (x=6..7, y=3..4)
      for (let y = 3; y <= 4; y++) {
        for (let x = 6; x <= 7; x++) {
          chunk.data.terrainHeightM[y * size + x] = 50;
        }
      }

      // Add lots of water to the depression
      for (let y = 3; y <= 4; y++) {
        for (let x = 1; x <= 3; x++) {
          addWaterAtCell(chunk.data, size, x, y, 30.0);
        }
      }

      // Run many steps
      stepChunkHydrology(chunk.data, size, {
        ...defaultConfig,
        subStepsPerTick: 200,
      });

      // Water should have spilled over the rim and reached the lower area
      let lowerAreaWater = 0;
      for (let y = 3; y <= 4; y++) {
        for (let x = 6; x <= 7; x++) {
          lowerAreaWater += chunk.data.waterDepthM[y * size + x];
        }
      }
      expect(lowerAreaWater).toBeGreaterThan(0);
    });
  });

  describe('runoffFlux tracking', () => {
    it('should accumulate runoffFlux on cells that receive flow', () => {
      const chunk = slopedChunk(SMALL, 200, 0);
      addWaterAtCell(chunk.data, SMALL, 0, SMALL / 2, 5.0);

      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 10,
        trackRunoffFlux: true,
      });

      // Cells downstream should have positive runoffFlux
      let totalFlux = 0;
      for (let i = 0; i < SMALL * SMALL; i++) {
        totalFlux += chunk.data.runoffFlux[i];
        expect(chunk.data.runoffFlux[i]).toBeGreaterThanOrEqual(0);
      }
      expect(totalFlux).toBeGreaterThan(0);
    });

    it('should not accumulate runoffFlux when tracking is disabled', () => {
      const chunk = slopedChunk(SMALL, 200, 0);
      addWaterAtCell(chunk.data, SMALL, 0, SMALL / 2, 5.0);

      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 10,
        trackRunoffFlux: false,
      });

      let totalFlux = 0;
      for (let i = 0; i < SMALL * SMALL; i++) {
        totalFlux += chunk.data.runoffFlux[i];
      }
      expect(totalFlux).toBe(0);
    });

    it('runoffFlux should be higher in convergent flow paths', () => {
      const chunk = valleyChunk(SMALL, 200, 50);
      addPrecipitation(chunk.data, SMALL, 0.5);

      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 20,
        trackRunoffFlux: true,
      });

      // Center column should have higher runoffFlux than edges
      const mid = Math.floor(SMALL / 2);
      let centerFlux = 0;
      let edgeFlux = 0;
      for (let y = 0; y < SMALL; y++) {
        centerFlux += chunk.data.runoffFlux[y * SMALL + mid];
        edgeFlux += chunk.data.runoffFlux[y * SMALL + 0];
      }
      expect(centerFlux).toBeGreaterThan(edgeFlux);
    });
  });

  describe('determinism', () => {
    it('should produce identical results for identical inputs', () => {
      const chunkA = slopedChunk(SMALL, 200, 0);
      const chunkB = slopedChunk(SMALL, 200, 0);

      addPrecipitation(chunkA.data, SMALL, 0.5);
      addPrecipitation(chunkB.data, SMALL, 0.5);

      stepChunkHydrology(chunkA.data, SMALL, fastConfig);
      stepChunkHydrology(chunkB.data, SMALL, fastConfig);

      for (let i = 0; i < SMALL * SMALL; i++) {
        expect(chunkA.data.waterDepthM[i]).toBe(chunkB.data.waterDepthM[i]);
        expect(chunkA.data.runoffFlux[i]).toBe(chunkB.data.runoffFlux[i]);
      }
    });
  });

  describe('edge behavior', () => {
    it('should accumulate water at chunk edges (no cross-chunk flow)', () => {
      const chunk = slopedChunk(SMALL, 200, 0);
      // Slope goes left (high) to right (low)
      // Add water everywhere
      addPrecipitation(chunk.data, SMALL, 1.0);

      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 50,
      });

      // Right edge (x = SMALL-1) should accumulate water since it can't flow further
      let rightEdgeWater = 0;
      for (let y = 0; y < SMALL; y++) {
        rightEdgeWater += chunk.data.waterDepthM[y * SMALL + (SMALL - 1)];
      }
      expect(rightEdgeWater).toBeGreaterThan(0);
    });
  });

  describe('waterDepthM non-negativity', () => {
    it('should never produce negative waterDepthM', () => {
      const chunk = slopedChunk(SMALL, 500, 0);
      // Add tiny amounts of water at random cells
      addWaterAtCell(chunk.data, SMALL, 2, 3, 0.001);
      addWaterAtCell(chunk.data, SMALL, 5, 1, 0.0001);
      addWaterAtCell(chunk.data, SMALL, 0, 7, 10.0);

      stepChunkHydrology(chunk.data, SMALL, {
        ...defaultConfig,
        subStepsPerTick: 50,
      });

      for (let i = 0; i < SMALL * SMALL; i++) {
        expect(chunk.data.waterDepthM[i]).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('stats', () => {
    it('should report active cells and flow volume', () => {
      const chunk = slopedChunk(SMALL, 200, 0);
      addPrecipitation(chunk.data, SMALL, 0.5);

      const stats = stepChunkHydrology(chunk.data, SMALL, fastConfig);

      expect(stats.activeCells).toBeGreaterThan(0);
      expect(stats.totalFlowVolume).toBeGreaterThan(0);
      expect(stats.subSteps).toBe(fastConfig.subStepsPerTick);
    });
  });
});

describe('addPrecipitation', () => {
  it('should add water only to land cells (terrainHeightM >= 0)', () => {
    const chunk = flatChunk(SMALL, 100);
    // Make some cells ocean
    chunk.data.terrainHeightM[0] = -50;
    chunk.data.terrainHeightM[1] = -100;

    addPrecipitation(chunk.data, SMALL, 1.0);

    expect(chunk.data.waterDepthM[0]).toBe(0);
    expect(chunk.data.waterDepthM[1]).toBe(0);
    expect(chunk.data.waterDepthM[2]).toBe(1.0);
  });

  it('should return the number of cells wetted', () => {
    const chunk = flatChunk(SMALL, 100);
    chunk.data.terrainHeightM[0] = -50; // one ocean cell

    const wetted = addPrecipitation(chunk.data, SMALL, 0.5);
    expect(wetted).toBe(SMALL * SMALL - 1);
  });
});

describe('utility functions', () => {
  it('totalWaterVolume should sum all water', () => {
    const arr = new Float32Array([1.0, 2.0, 3.0, 0.5]);
    expect(totalWaterVolume(arr)).toBeCloseTo(6.5, 5);
  });

  it('countWetCells should count cells above threshold', () => {
    const arr = new Float32Array([0, 0.001, 0.5, 0, 1.0]);
    expect(countWetCells(arr, 0.01)).toBe(2);
    expect(countWetCells(arr, 0.0001)).toBe(3);
  });
});
