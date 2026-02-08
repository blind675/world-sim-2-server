import { initializeWorld, type WorldInitConfig } from '../src/terrain/worldInit';

jest.spyOn(console, 'log').mockImplementation(() => { });

const FAST_OVERRIDES = { coarseSampleRes: 64 };

function makeTestConfig(seed: number = 42): WorldInitConfig {
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

describe('initializeWorld', () => {
  it('should return a chunkGenerator function', () => {
    const result = initializeWorld(makeTestConfig(), FAST_OVERRIDES);
    expect(typeof result.chunkGenerator).toBe('function');
  });

  it('should return world metadata with seaLevelBiasM', () => {
    const result = initializeWorld(makeTestConfig(), FAST_OVERRIDES);
    expect(typeof result.metadata.seaLevelBiasM).toBe('number');
    expect(isFinite(result.metadata.seaLevelBiasM)).toBe(true);
  });

  it('should return a terrain generator', () => {
    const result = initializeWorld(makeTestConfig(), FAST_OVERRIDES);
    expect(result.terrainGenerator).toBeDefined();
    expect(typeof result.terrainGenerator.rawHeight).toBe('function');
  });

  it('should be deterministic (same seed → same metadata)', () => {
    const a = initializeWorld(makeTestConfig(42), FAST_OVERRIDES);
    const b = initializeWorld(makeTestConfig(42), FAST_OVERRIDES);

    expect(a.metadata.seaLevelBiasM).toBe(b.metadata.seaLevelBiasM);
  });

  it('should produce different metadata for different seeds', () => {
    const a = initializeWorld(makeTestConfig(42), FAST_OVERRIDES);
    const b = initializeWorld(makeTestConfig(99), FAST_OVERRIDES);

    // Very unlikely to be the same
    expect(a.metadata.seaLevelBiasM).not.toBe(b.metadata.seaLevelBiasM);
  });

  it('chunkGenerator should populate terrainHeightM on a LandChunk-like object', () => {
    const cfg = makeTestConfig();
    const result = initializeWorld(cfg, FAST_OVERRIDES);
    const chunkSize = cfg.chunkCells * cfg.chunkCells;

    const fakeChunk = {
      cx: 0,
      cy: 0,
      chunkCells: cfg.chunkCells,
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

    // Should have populated terrain
    let nonZero = 0;
    for (let i = 0; i < chunkSize; i++) {
      if (fakeChunk.data.terrainHeightM[i] !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(chunkSize * 0.5);
  });
});
