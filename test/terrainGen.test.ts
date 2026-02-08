import {
  TerrainGenerator,
  createDefaultTerrainGenConfig,
  type TerrainGenConfig,
} from '../src/terrain/terrainGen';

// Use a small world for faster tests
function makeSmallConfig(seed: number = 42): TerrainGenConfig {
  const worldWidthM = 10_000_000;  // 10,000 km
  const worldHeightM = 10_000_000;
  const cellSizeM = 250;
  const chunkCells = 16; // small chunks for fast tests
  const worldCellsX = Math.round(worldWidthM / cellSizeM / chunkCells) * chunkCells;
  const worldCellsY = Math.round(worldHeightM / cellSizeM / chunkCells) * chunkCells;

  return {
    ...createDefaultTerrainGenConfig(
      seed, worldWidthM, worldHeightM, worldCellsX, worldCellsY, cellSizeM, chunkCells,
    ),
    coarseSampleRes: 64, // much smaller for test speed
  };
}

describe('TerrainGenerator', () => {
  describe('rawHeight', () => {
    it('should be deterministic (same seed → same output)', () => {
      const cfgA = makeSmallConfig(42);
      const cfgB = makeSmallConfig(42);
      const genA = new TerrainGenerator(cfgA);
      const genB = new TerrainGenerator(cfgB);

      for (let i = 0; i < 50; i++) {
        const x = i * 200_000;
        const y = i * 150_000;
        expect(genA.rawHeight(x, y)).toBe(genB.rawHeight(x, y));
      }
    });

    it('should produce different output for different seeds', () => {
      const genA = new TerrainGenerator(makeSmallConfig(42));
      const genB = new TerrainGenerator(makeSmallConfig(99));

      let same = 0;
      for (let i = 0; i < 50; i++) {
        const x = i * 200_000;
        const y = i * 150_000;
        if (genA.rawHeight(x, y) === genB.rawHeight(x, y)) same++;
      }
      expect(same).toBeLessThan(3);
    });

    it('should produce a range of heights (not flat)', () => {
      const gen = new TerrainGenerator(makeSmallConfig(42));
      let min = Infinity, max = -Infinity;

      for (let i = 0; i < 200; i++) {
        const x = i * 50_000;
        const y = i * 37_000;
        const h = gen.rawHeight(x, y);
        if (h < min) min = h;
        if (h > max) max = h;
      }

      // Should have significant range
      expect(max - min).toBeGreaterThan(500);
    });
  });

  describe('computeWorldMetadata', () => {
    it('should compute seaLevelBiasM', () => {
      const gen = new TerrainGenerator(makeSmallConfig(42));
      const meta = gen.computeWorldMetadata();

      expect(typeof meta.seaLevelBiasM).toBe('number');
      expect(isFinite(meta.seaLevelBiasM)).toBe(true);
    });

    it('should produce ocean fraction near target (0.65 ± tolerance)', () => {
      const cfg = makeSmallConfig(42);
      const gen = new TerrainGenerator(cfg);
      const meta = gen.computeWorldMetadata();

      // Count ocean cells in the land mask
      let oceanCount = 0;
      for (let i = 0; i < meta.coastLandMask.length; i++) {
        if (meta.coastLandMask[i] === 0) oceanCount++;
      }
      const oceanFraction = oceanCount / meta.coastLandMask.length;

      // Should be within tolerance of target
      expect(oceanFraction).toBeGreaterThan(cfg.targetOceanFraction - cfg.oceanFractionTolerance - 0.05);
      expect(oceanFraction).toBeLessThan(cfg.targetOceanFraction + cfg.oceanFractionTolerance + 0.05);
    });

    it('should compute coast distance map with finite values near coast', () => {
      const gen = new TerrainGenerator(makeSmallConfig(42));
      const meta = gen.computeWorldMetadata();

      // At least some cells should have finite distance (coastal ocean)
      let finiteCount = 0;
      for (let i = 0; i < meta.coastDistanceMap.length; i++) {
        if (isFinite(meta.coastDistanceMap[i])) finiteCount++;
      }
      expect(finiteCount).toBeGreaterThan(0);
    });

    it('should be deterministic', () => {
      const metaA = new TerrainGenerator(makeSmallConfig(42)).computeWorldMetadata();
      const metaB = new TerrainGenerator(makeSmallConfig(42)).computeWorldMetadata();

      expect(metaA.seaLevelBiasM).toBe(metaB.seaLevelBiasM);
      expect(metaA.coastDistanceRes).toBe(metaB.coastDistanceRes);

      for (let i = 0; i < metaA.coastDistanceMap.length; i++) {
        expect(metaA.coastDistanceMap[i]).toBe(metaB.coastDistanceMap[i]);
      }
    });
  });

  describe('generateChunkTerrain', () => {
    it('should fill terrainHeightM array', () => {
      const cfg = makeSmallConfig(42);
      const gen = new TerrainGenerator(cfg);
      const meta = gen.computeWorldMetadata();

      const chunkSize = cfg.chunkCells * cfg.chunkCells;
      const terrainHeightM = new Float32Array(chunkSize);

      gen.generateChunkTerrain(0, 0, terrainHeightM, meta);

      // Should have non-zero values
      let nonZero = 0;
      for (let i = 0; i < chunkSize; i++) {
        if (terrainHeightM[i] !== 0) nonZero++;
      }
      expect(nonZero).toBeGreaterThan(chunkSize * 0.5);
    });

    it('should respect terrain bounds', () => {
      const cfg = makeSmallConfig(42);
      const gen = new TerrainGenerator(cfg);
      const meta = gen.computeWorldMetadata();

      const chunkSize = cfg.chunkCells * cfg.chunkCells;
      const terrainHeightM = new Float32Array(chunkSize);

      // Generate several chunks
      for (let cy = 0; cy < 3; cy++) {
        for (let cx = 0; cx < 3; cx++) {
          gen.generateChunkTerrain(cx, cy, terrainHeightM, meta);

          for (let i = 0; i < chunkSize; i++) {
            expect(terrainHeightM[i]).toBeGreaterThanOrEqual(cfg.minTerrainM);
            expect(terrainHeightM[i]).toBeLessThanOrEqual(cfg.maxTerrainM);
          }
        }
      }
    });

    it('should be deterministic for same chunk', () => {
      const cfg = makeSmallConfig(42);
      const gen = new TerrainGenerator(cfg);
      const meta = gen.computeWorldMetadata();

      const chunkSize = cfg.chunkCells * cfg.chunkCells;
      const a = new Float32Array(chunkSize);
      const b = new Float32Array(chunkSize);

      gen.generateChunkTerrain(5, 3, a, meta);
      gen.generateChunkTerrain(5, 3, b, meta);

      for (let i = 0; i < chunkSize; i++) {
        expect(a[i]).toBe(b[i]);
      }
    });

    it('should produce different terrain for different chunks', () => {
      const cfg = makeSmallConfig(42);
      const gen = new TerrainGenerator(cfg);
      const meta = gen.computeWorldMetadata();

      const chunkSize = cfg.chunkCells * cfg.chunkCells;
      const a = new Float32Array(chunkSize);
      const b = new Float32Array(chunkSize);

      gen.generateChunkTerrain(0, 0, a, meta);
      gen.generateChunkTerrain(10, 10, b, meta);

      let same = 0;
      for (let i = 0; i < chunkSize; i++) {
        if (a[i] === b[i]) same++;
      }
      expect(same).toBeLessThan(chunkSize * 0.5);
    });

    it('should have both land and ocean cells across multiple chunks', () => {
      const cfg = makeSmallConfig(42);
      const gen = new TerrainGenerator(cfg);
      const meta = gen.computeWorldMetadata();

      const chunkSize = cfg.chunkCells * cfg.chunkCells;
      const terrainHeightM = new Float32Array(chunkSize);

      let totalLand = 0;
      let totalOcean = 0;
      const chunksToSample = 20;

      const worldChunksX = Math.round(cfg.worldCellsX / cfg.chunkCells);
      const worldChunksY = Math.round(cfg.worldCellsY / cfg.chunkCells);

      for (let i = 0; i < chunksToSample; i++) {
        const cx = Math.floor(i * worldChunksX / chunksToSample);
        const cy = Math.floor(i * worldChunksY / chunksToSample);
        gen.generateChunkTerrain(cx, cy, terrainHeightM, meta);

        for (let j = 0; j < chunkSize; j++) {
          if (terrainHeightM[j] >= 0) totalLand++;
          else totalOcean++;
        }
      }

      // Should have both land and ocean
      expect(totalLand).toBeGreaterThan(0);
      expect(totalOcean).toBeGreaterThan(0);
    });
  });
});
