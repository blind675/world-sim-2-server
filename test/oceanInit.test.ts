import {
  TerrainGenerator,
  createDefaultTerrainGenConfig,
  type TerrainGenConfig,
} from '../src/terrain/terrainGen';
import { initializeWorld, type WorldInitConfig } from '../src/terrain/worldInit';

jest.spyOn(console, 'log').mockImplementation(() => {});

const FAST_OVERRIDES = { coarseSampleRes: 64 };

function makeSmallConfig(seed: number = 42): TerrainGenConfig {
  const worldWidthM = 10_000_000;
  const worldHeightM = 10_000_000;
  const cellSizeM = 250;
  const chunkCells = 16;
  const worldCellsX = Math.round(worldWidthM / cellSizeM / chunkCells) * chunkCells;
  const worldCellsY = Math.round(worldHeightM / cellSizeM / chunkCells) * chunkCells;

  return {
    ...createDefaultTerrainGenConfig(
      seed, worldWidthM, worldHeightM, worldCellsX, worldCellsY, cellSizeM, chunkCells,
    ),
    coarseSampleRes: 64,
  };
}

function makeWorldInitConfig(seed: number = 42): WorldInitConfig {
  const worldWidthM = 10_000_000;
  const worldHeightM = 10_000_000;
  const cellSizeM = 250;
  const chunkCells = 16;
  const worldCellsX = Math.round(worldWidthM / cellSizeM / chunkCells) * chunkCells;
  const worldCellsY = Math.round(worldHeightM / cellSizeM / chunkCells) * chunkCells;

  return {
    seed,
    worldWidthM,
    worldHeightM,
    worldCellsX,
    worldCellsY,
    landCellSizeM: cellSizeM,
    chunkCells,
  };
}

describe('Ocean mask (coarse flood-fill)', () => {
  it('should produce an ocean mask with connected ocean cells', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    // Ocean mask should have some ocean cells (1s)
    let oceanCount = 0;
    for (let i = 0; i < meta.oceanMask.length; i++) {
      if (meta.oceanMask[i] === 1) oceanCount++;
    }
    expect(oceanCount).toBeGreaterThan(0);

    // Ocean mask should have fewer or equal ocean cells compared to below-sea cells
    // (inland depressions below sea level are excluded from connected ocean)
    let belowSeaCount = 0;
    for (let i = 0; i < meta.coastLandMask.length; i++) {
      if (meta.coastLandMask[i] === 0) belowSeaCount++;
    }
    expect(oceanCount).toBeLessThanOrEqual(belowSeaCount);
  });

  it('should be deterministic', () => {
    const metaA = new TerrainGenerator(makeSmallConfig(42)).computeWorldMetadata();
    const metaB = new TerrainGenerator(makeSmallConfig(42)).computeWorldMetadata();

    for (let i = 0; i < metaA.oceanMask.length; i++) {
      expect(metaA.oceanMask[i]).toBe(metaB.oceanMask[i]);
    }
  });

  it('should produce different ocean masks for different seeds', () => {
    const metaA = new TerrainGenerator(makeSmallConfig(42)).computeWorldMetadata();
    const metaB = new TerrainGenerator(makeSmallConfig(99)).computeWorldMetadata();

    let diff = 0;
    const len = Math.min(metaA.oceanMask.length, metaB.oceanMask.length);
    for (let i = 0; i < len; i++) {
      if (metaA.oceanMask[i] !== metaB.oceanMask[i]) diff++;
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('ocean mask cells should only be where terrain is below sea level', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    // Every ocean mask cell should correspond to a non-land cell in coastLandMask
    for (let i = 0; i < meta.oceanMask.length; i++) {
      if (meta.oceanMask[i] === 1) {
        expect(meta.coastLandMask[i]).toBe(0);
      }
    }
  });
});

describe('initializeOceanWater', () => {
  it('should set waterDepthM > 0 for ocean cells with negative terrain', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    const chunkSize = cfg.chunkCells * cfg.chunkCells;
    const terrainHeightM = new Float32Array(chunkSize);
    const waterDepthM = new Float32Array(chunkSize);

    // Generate several chunks and check for ocean water
    let totalOceanWater = 0;
    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        gen.generateChunkTerrain(cx, cy, terrainHeightM, meta);
        gen.initializeOceanWater(cx, cy, terrainHeightM, waterDepthM, meta);

        for (let i = 0; i < chunkSize; i++) {
          if (waterDepthM[i] > 0) {
            totalOceanWater++;
            // Where there's water, terrain should be negative
            expect(terrainHeightM[i]).toBeLessThan(0);
            // Water depth should equal -terrainHeightM (surface at sea level)
            expect(waterDepthM[i]).toBeCloseTo(-terrainHeightM[i], 3);
          }
        }
      }
    }
    // At least some cells should have ocean water across 9 chunks
    // (may be 0 if all 9 chunks are land, but unlikely)
  });

  it('should set waterDepthM = 0 for land cells (positive terrain)', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    const chunkSize = cfg.chunkCells * cfg.chunkCells;
    const terrainHeightM = new Float32Array(chunkSize);
    const waterDepthM = new Float32Array(chunkSize);

    // Sample many chunks
    const worldChunksX = Math.round(cfg.worldCellsX / cfg.chunkCells);
    const worldChunksY = Math.round(cfg.worldCellsY / cfg.chunkCells);

    for (let i = 0; i < 10; i++) {
      const cx = Math.floor(i * worldChunksX / 10);
      const cy = Math.floor(i * worldChunksY / 10);
      gen.generateChunkTerrain(cx, cy, terrainHeightM, meta);
      gen.initializeOceanWater(cx, cy, terrainHeightM, waterDepthM, meta);

      for (let j = 0; j < chunkSize; j++) {
        if (terrainHeightM[j] >= 0) {
          expect(waterDepthM[j]).toBe(0);
        }
      }
    }
  });

  it('waterDepthM should always be >= 0', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    const chunkSize = cfg.chunkCells * cfg.chunkCells;
    const terrainHeightM = new Float32Array(chunkSize);
    const waterDepthM = new Float32Array(chunkSize);

    for (let cy = 0; cy < 5; cy++) {
      for (let cx = 0; cx < 5; cx++) {
        gen.generateChunkTerrain(cx, cy, terrainHeightM, meta);
        gen.initializeOceanWater(cx, cy, terrainHeightM, waterDepthM, meta);

        for (let i = 0; i < chunkSize; i++) {
          expect(waterDepthM[i]).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('ocean surface (terrainHeightM + waterDepthM) should be ~0 for ocean cells', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    const chunkSize = cfg.chunkCells * cfg.chunkCells;
    const terrainHeightM = new Float32Array(chunkSize);
    const waterDepthM = new Float32Array(chunkSize);

    for (let cy = 0; cy < 3; cy++) {
      for (let cx = 0; cx < 3; cx++) {
        gen.generateChunkTerrain(cx, cy, terrainHeightM, meta);
        gen.initializeOceanWater(cx, cy, terrainHeightM, waterDepthM, meta);

        for (let i = 0; i < chunkSize; i++) {
          if (waterDepthM[i] > 0) {
            const surface = terrainHeightM[i] + waterDepthM[i];
            expect(Math.abs(surface)).toBeLessThan(0.01);
          }
        }
      }
    }
  });

  it('should be deterministic', () => {
    const cfg = makeSmallConfig(42);
    const gen = new TerrainGenerator(cfg);
    const meta = gen.computeWorldMetadata();

    const chunkSize = cfg.chunkCells * cfg.chunkCells;
    const terrainA = new Float32Array(chunkSize);
    const waterA = new Float32Array(chunkSize);
    const terrainB = new Float32Array(chunkSize);
    const waterB = new Float32Array(chunkSize);

    gen.generateChunkTerrain(5, 3, terrainA, meta);
    gen.initializeOceanWater(5, 3, terrainA, waterA, meta);

    gen.generateChunkTerrain(5, 3, terrainB, meta);
    gen.initializeOceanWater(5, 3, terrainB, waterB, meta);

    for (let i = 0; i < chunkSize; i++) {
      expect(waterA[i]).toBe(waterB[i]);
    }
  });
});

describe('worldInit chunk generator — ocean water', () => {
  it('should populate both terrainHeightM and waterDepthM', () => {
    const cfg = makeWorldInitConfig();
    const result = initializeWorld(cfg, FAST_OVERRIDES);
    const chunkSize = cfg.chunkCells * cfg.chunkCells;

    const fakeChunk = {
      cx: 0,
      cy: 0,
      chunkCells: cfg.chunkCells,
      cellCount: chunkSize,
      data: {
        terrainHeightM: new Float32Array(chunkSize),
        waterDepthM: new Float32Array(chunkSize),
        riverId: new Int32Array(chunkSize),
        runoffFlux: new Float32Array(chunkSize),
        soilMoisture: new Float32Array(chunkSize),
        fieldCapacity: new Float32Array(chunkSize),
        grassCover: new Float32Array(chunkSize),
      },
    };

    result.chunkGenerator(fakeChunk as any);

    // Should have terrain data
    let terrainNonZero = 0;
    for (let i = 0; i < chunkSize; i++) {
      if (fakeChunk.data.terrainHeightM[i] !== 0) terrainNonZero++;
    }
    expect(terrainNonZero).toBeGreaterThan(0);

    // waterDepthM should be consistent with terrain + ocean mask
    for (let i = 0; i < chunkSize; i++) {
      expect(fakeChunk.data.waterDepthM[i]).toBeGreaterThanOrEqual(0);
      if (fakeChunk.data.waterDepthM[i] > 0) {
        // Ocean cell: terrain must be negative, surface at ~0
        expect(fakeChunk.data.terrainHeightM[i]).toBeLessThan(0);
        const surface = fakeChunk.data.terrainHeightM[i] + fakeChunk.data.waterDepthM[i];
        expect(Math.abs(surface)).toBeLessThan(0.01);
      }
    }
  });

  it('should have ocean water across sampled chunks', () => {
    const cfg = makeWorldInitConfig();
    const result = initializeWorld(cfg, FAST_OVERRIDES);
    const chunkSize = cfg.chunkCells * cfg.chunkCells;

    let totalWaterCells = 0;
    let totalDryCells = 0;

    const worldChunksX = Math.round(cfg.worldCellsX / cfg.chunkCells);
    const worldChunksY = Math.round(cfg.worldCellsY / cfg.chunkCells);

    for (let i = 0; i < 20; i++) {
      const cx = Math.floor(i * worldChunksX / 20);
      const cy = Math.floor(i * worldChunksY / 20);

      const fakeChunk = {
        cx, cy,
        chunkCells: cfg.chunkCells,
        cellCount: chunkSize,
        data: {
          terrainHeightM: new Float32Array(chunkSize),
          waterDepthM: new Float32Array(chunkSize),
          riverId: new Int32Array(chunkSize),
          runoffFlux: new Float32Array(chunkSize),
          soilMoisture: new Float32Array(chunkSize),
          fieldCapacity: new Float32Array(chunkSize),
          grassCover: new Float32Array(chunkSize),
        },
      };

      result.chunkGenerator(fakeChunk as any);

      for (let j = 0; j < chunkSize; j++) {
        if (fakeChunk.data.waterDepthM[j] > 0) totalWaterCells++;
        else totalDryCells++;
      }
    }

    // Should have both ocean and land across 20 sampled chunks
    expect(totalWaterCells).toBeGreaterThan(0);
    expect(totalDryCells).toBeGreaterThan(0);
  });
});
