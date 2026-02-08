import {
  createLandChunk,
  cellIndex,
  chunkMemoryBytes,
  type LandChunk,
} from '../src/land';

describe('createLandChunk', () => {
  const CHUNK_CELLS = 256;
  const CELL_COUNT = CHUNK_CELLS * CHUNK_CELLS;

  it('should create a chunk with correct coordinates and dimensions', () => {
    const chunk = createLandChunk(3, 7, CHUNK_CELLS);
    expect(chunk.cx).toBe(3);
    expect(chunk.cy).toBe(7);
    expect(chunk.chunkCells).toBe(CHUNK_CELLS);
    expect(chunk.cellCount).toBe(CELL_COUNT);
  });

  it('should allocate all SoA arrays with correct length', () => {
    const chunk = createLandChunk(0, 0, CHUNK_CELLS);
    expect(chunk.data.terrainHeightM).toBeInstanceOf(Float32Array);
    expect(chunk.data.terrainHeightM.length).toBe(CELL_COUNT);
    expect(chunk.data.waterDepthM).toBeInstanceOf(Float32Array);
    expect(chunk.data.waterDepthM.length).toBe(CELL_COUNT);
    expect(chunk.data.riverId).toBeInstanceOf(Int32Array);
    expect(chunk.data.riverId.length).toBe(CELL_COUNT);
    expect(chunk.data.runoffFlux).toBeInstanceOf(Float32Array);
    expect(chunk.data.runoffFlux.length).toBe(CELL_COUNT);
    expect(chunk.data.soilMoisture).toBeInstanceOf(Float32Array);
    expect(chunk.data.soilMoisture.length).toBe(CELL_COUNT);
    expect(chunk.data.fieldCapacity).toBeInstanceOf(Float32Array);
    expect(chunk.data.fieldCapacity.length).toBe(CELL_COUNT);
    expect(chunk.data.grassCover).toBeInstanceOf(Float32Array);
    expect(chunk.data.grassCover.length).toBe(CELL_COUNT);
  });

  it('should zero-initialize Float32Arrays', () => {
    const chunk = createLandChunk(0, 0, CHUNK_CELLS);
    for (let i = 0; i < CELL_COUNT; i += 1000) {
      expect(chunk.data.terrainHeightM[i]).toBe(0);
      expect(chunk.data.waterDepthM[i]).toBe(0);
      expect(chunk.data.soilMoisture[i]).toBe(0);
      expect(chunk.data.fieldCapacity[i]).toBe(0);
      expect(chunk.data.grassCover[i]).toBe(0);
      expect(chunk.data.runoffFlux[i]).toBe(0);
    }
  });

  it('should initialize riverId to -1 (no river)', () => {
    const chunk = createLandChunk(0, 0, CHUNK_CELLS);
    for (let i = 0; i < CELL_COUNT; i += 1000) {
      expect(chunk.data.riverId[i]).toBe(-1);
    }
  });

  it('should work with smaller chunk sizes for testing', () => {
    const small = createLandChunk(0, 0, 4);
    expect(small.cellCount).toBe(16);
    expect(small.data.terrainHeightM.length).toBe(16);
  });
});

describe('cellIndex', () => {
  it('should compute row-major index', () => {
    expect(cellIndex(0, 0, 256)).toBe(0);
    expect(cellIndex(1, 0, 256)).toBe(1);
    expect(cellIndex(0, 1, 256)).toBe(256);
    expect(cellIndex(255, 255, 256)).toBe(256 * 256 - 1);
  });

  it('should work with small chunk sizes', () => {
    expect(cellIndex(0, 0, 4)).toBe(0);
    expect(cellIndex(3, 0, 4)).toBe(3);
    expect(cellIndex(0, 1, 4)).toBe(4);
    expect(cellIndex(3, 3, 4)).toBe(15);
  });
});

describe('chunkMemoryBytes', () => {
  it('should estimate memory for 256×256 chunk', () => {
    // 256*256 = 65536 cells, 7 arrays * 4 bytes each = 28 bytes/cell
    const expected = 256 * 256 * 7 * 4;
    expect(chunkMemoryBytes(256)).toBe(expected);
  });

  it('should scale with chunk size', () => {
    expect(chunkMemoryBytes(128)).toBe(128 * 128 * 7 * 4);
    expect(chunkMemoryBytes(4)).toBe(4 * 4 * 7 * 4);
  });
});
