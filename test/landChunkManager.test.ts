import {
  createLandChunkManager,
  type LandChunkManagerConfig,
  type LandChunk,
  type ChunkGenerator,
} from '../src/land';

// Small world for fast tests: 4×4 chunks, 4×4 cells per chunk
const SMALL_CONFIG: LandChunkManagerConfig = {
  chunkCells: 4,
  worldChunksX: 4,
  worldChunksY: 4,
  maxResidentChunks: 8,
};

describe('createLandChunkManager — construction', () => {
  it('should create a manager with correct config', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    expect(mgr.worldChunksX).toBe(4);
    expect(mgr.worldChunksY).toBe(4);
    expect(mgr.chunkCells).toBe(4);
    expect(mgr.maxResidentChunks).toBe(8);
    expect(mgr.residentCount()).toBe(0);
  });

  it('should throw on invalid worldChunksX/Y', () => {
    expect(() => createLandChunkManager({ ...SMALL_CONFIG, worldChunksX: 0 })).toThrow();
    expect(() => createLandChunkManager({ ...SMALL_CONFIG, worldChunksY: -1 })).toThrow();
  });

  it('should throw on invalid maxResidentChunks', () => {
    expect(() => createLandChunkManager({ ...SMALL_CONFIG, maxResidentChunks: 0 })).toThrow();
    expect(() => createLandChunkManager({ ...SMALL_CONFIG, maxResidentChunks: -5 })).toThrow();
  });
});

describe('getChunk — lazy creation', () => {
  it('should create a chunk on first access', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    expect(mgr.hasChunk(0, 0)).toBe(false);

    const chunk = mgr.getChunk(0, 0);
    expect(chunk.cx).toBe(0);
    expect(chunk.cy).toBe(0);
    expect(chunk.chunkCells).toBe(4);
    expect(chunk.cellCount).toBe(16);
    expect(mgr.hasChunk(0, 0)).toBe(true);
    expect(mgr.residentCount()).toBe(1);
  });

  it('should return the same chunk on repeated access', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const c1 = mgr.getChunk(1, 2);
    const c2 = mgr.getChunk(1, 2);
    expect(c1).toBe(c2);
  });

  it('should create distinct chunks for different coordinates', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(0, 0);
    const b = mgr.getChunk(1, 0);
    const c = mgr.getChunk(0, 1);
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(b).not.toBe(c);
    expect(mgr.residentCount()).toBe(3);
  });
});

describe('getChunk — toroidal wrapping', () => {
  it('should wrap positive overflow in X', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(0, 0);
    const b = mgr.getChunk(4, 0); // 4 % 4 = 0
    expect(a).toBe(b);
    expect(b.cx).toBe(0);
  });

  it('should wrap positive overflow in Y', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(0, 0);
    const b = mgr.getChunk(0, 4); // 4 % 4 = 0
    expect(a).toBe(b);
    expect(b.cy).toBe(0);
  });

  it('should wrap negative coordinates in X', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(3, 0);
    const b = mgr.getChunk(-1, 0); // -1 mod 4 = 3
    expect(a).toBe(b);
    expect(b.cx).toBe(3);
  });

  it('should wrap negative coordinates in Y', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(0, 3);
    const b = mgr.getChunk(0, -1); // -1 mod 4 = 3
    expect(a).toBe(b);
    expect(b.cy).toBe(3);
  });

  it('should wrap large negative coordinates', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(2, 1);
    const b = mgr.getChunk(-6, -7); // -6 mod 4 = 2, -7 mod 4 = 1
    expect(a).toBe(b);
  });

  it('should wrap large positive coordinates', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const a = mgr.getChunk(1, 3);
    const b = mgr.getChunk(101, 103); // 101 mod 4 = 1, 103 mod 4 = 3
    expect(a).toBe(b);
  });
});

describe('LRU eviction', () => {
  it('should evict the least-recently-used chunk when at capacity', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 3,
    };
    const mgr = createLandChunkManager(config);

    // Fill cache: chunks (0,0), (1,0), (2,0)
    mgr.getChunk(0, 0);
    mgr.getChunk(1, 0);
    mgr.getChunk(2, 0);
    expect(mgr.residentCount()).toBe(3);

    // Access (3,0) — should evict (0,0) as LRU
    mgr.getChunk(3, 0);
    expect(mgr.residentCount()).toBe(3);
    expect(mgr.hasChunk(0, 0)).toBe(false);
    expect(mgr.hasChunk(1, 0)).toBe(true);
    expect(mgr.hasChunk(2, 0)).toBe(true);
    expect(mgr.hasChunk(3, 0)).toBe(true);
  });

  it('should update LRU order on access (touch)', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 3,
    };
    const mgr = createLandChunkManager(config);

    // Fill: (0,0), (1,0), (2,0)
    mgr.getChunk(0, 0);
    mgr.getChunk(1, 0);
    mgr.getChunk(2, 0);

    // Touch (0,0) — moves it to MRU
    mgr.getChunk(0, 0);

    // Now LRU order: (1,0) is LRU, then (2,0), then (0,0)
    // Access (3,0) — should evict (1,0)
    mgr.getChunk(3, 0);
    expect(mgr.hasChunk(0, 0)).toBe(true);
    expect(mgr.hasChunk(1, 0)).toBe(false);
    expect(mgr.hasChunk(2, 0)).toBe(true);
    expect(mgr.hasChunk(3, 0)).toBe(true);
  });

  it('should re-create evicted chunks on next access', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 2,
    };
    let genCount = 0;
    const generator: ChunkGenerator = () => { genCount++; };
    const mgr = createLandChunkManager(config, generator);

    mgr.getChunk(0, 0);
    mgr.getChunk(1, 0);
    expect(genCount).toBe(2);

    // Evict (0,0)
    mgr.getChunk(2, 0);
    expect(genCount).toBe(3);
    expect(mgr.hasChunk(0, 0)).toBe(false);

    // Re-access (0,0) — should regenerate
    mgr.getChunk(0, 0);
    expect(genCount).toBe(4);
    expect(mgr.hasChunk(0, 0)).toBe(true);
  });

  it('should lose dynamic state on eviction', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 2,
    };
    const mgr = createLandChunkManager(config);

    const chunk = mgr.getChunk(0, 0);
    chunk.data.waterDepthM[0] = 42.5;
    chunk.data.soilMoisture[0] = 0.8;

    // Fill and evict (0,0)
    mgr.getChunk(1, 0);
    mgr.getChunk(2, 0);
    expect(mgr.hasChunk(0, 0)).toBe(false);

    // Re-access — dynamic state is lost (zero-initialized)
    const reloaded = mgr.getChunk(0, 0);
    expect(reloaded.data.waterDepthM[0]).toBe(0);
    expect(reloaded.data.soilMoisture[0]).toBe(0);
  });

  it('should handle maxResidentChunks = 1', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 1,
    };
    const mgr = createLandChunkManager(config);

    mgr.getChunk(0, 0);
    expect(mgr.residentCount()).toBe(1);

    mgr.getChunk(1, 0);
    expect(mgr.residentCount()).toBe(1);
    expect(mgr.hasChunk(0, 0)).toBe(false);
    expect(mgr.hasChunk(1, 0)).toBe(true);
  });
});

describe('chunkGenerator callback', () => {
  it('should call generator on chunk creation', () => {
    const generated: Array<[number, number]> = [];
    const generator: ChunkGenerator = (chunk) => {
      generated.push([chunk.cx, chunk.cy]);
    };
    const mgr = createLandChunkManager(SMALL_CONFIG, generator);

    mgr.getChunk(0, 0);
    mgr.getChunk(2, 3);
    expect(generated).toEqual([[0, 0], [2, 3]]);
  });

  it('should not call generator on cache hit', () => {
    let callCount = 0;
    const generator: ChunkGenerator = () => { callCount++; };
    const mgr = createLandChunkManager(SMALL_CONFIG, generator);

    mgr.getChunk(0, 0);
    mgr.getChunk(0, 0);
    mgr.getChunk(0, 0);
    expect(callCount).toBe(1);
  });

  it('should allow generator to populate terrain data', () => {
    const generator: ChunkGenerator = (chunk) => {
      for (let i = 0; i < chunk.cellCount; i++) {
        chunk.data.terrainHeightM[i] = 100 + i;
      }
    };
    const mgr = createLandChunkManager(SMALL_CONFIG, generator);

    const chunk = mgr.getChunk(0, 0);
    expect(chunk.data.terrainHeightM[0]).toBe(100);
    expect(chunk.data.terrainHeightM[15]).toBe(115);
  });

  it('should work without a generator (zero-initialized)', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    const chunk = mgr.getChunk(0, 0);
    expect(chunk.data.terrainHeightM[0]).toBe(0);
  });
});

describe('forEachResident', () => {
  it('should iterate over all resident chunks', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    mgr.getChunk(0, 0);
    mgr.getChunk(1, 1);
    mgr.getChunk(2, 2);

    const visited: Array<[number, number]> = [];
    mgr.forEachResident((chunk) => {
      visited.push([chunk.cx, chunk.cy]);
    });

    expect(visited.length).toBe(3);
    expect(visited).toContainEqual([0, 0]);
    expect(visited).toContainEqual([1, 1]);
    expect(visited).toContainEqual([2, 2]);
  });

  it('should iterate over nothing when empty', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    let count = 0;
    mgr.forEachResident(() => { count++; });
    expect(count).toBe(0);
  });
});

describe('stats', () => {
  it('should track accesses, hits, misses', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);

    mgr.getChunk(0, 0); // miss
    mgr.getChunk(0, 0); // hit
    mgr.getChunk(1, 0); // miss
    mgr.getChunk(0, 0); // hit

    const stats = mgr.getStats();
    expect(stats.totalAccesses).toBe(4);
    expect(stats.cacheHits).toBe(2);
    expect(stats.cacheMisses).toBe(2);
    expect(stats.residentCount).toBe(2);
    expect(stats.evictions).toBe(0);
  });

  it('should track evictions', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 2,
    };
    const mgr = createLandChunkManager(config);

    mgr.getChunk(0, 0);
    mgr.getChunk(1, 0);
    mgr.getChunk(2, 0); // evicts (0,0)
    mgr.getChunk(3, 0); // evicts (1,0)

    const stats = mgr.getStats();
    expect(stats.evictions).toBe(2);
    expect(stats.cacheMisses).toBe(4);
  });

  it('should reset stats without evicting chunks', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    mgr.getChunk(0, 0);
    mgr.getChunk(1, 0);

    mgr.resetStats();
    const stats = mgr.getStats();
    expect(stats.totalAccesses).toBe(0);
    expect(stats.cacheHits).toBe(0);
    expect(stats.cacheMisses).toBe(0);
    expect(stats.evictions).toBe(0);
    // Chunks are still resident
    expect(stats.residentCount).toBe(2);
    expect(mgr.hasChunk(0, 0)).toBe(true);
  });
});

describe('clear', () => {
  it('should remove all resident chunks', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    mgr.getChunk(0, 0);
    mgr.getChunk(1, 1);
    mgr.getChunk(2, 2);
    expect(mgr.residentCount()).toBe(3);

    mgr.clear();
    expect(mgr.residentCount()).toBe(0);
    expect(mgr.hasChunk(0, 0)).toBe(false);
    expect(mgr.hasChunk(1, 1)).toBe(false);
    expect(mgr.hasChunk(2, 2)).toBe(false);
  });

  it('should allow re-population after clear', () => {
    let genCount = 0;
    const generator: ChunkGenerator = () => { genCount++; };
    const mgr = createLandChunkManager(SMALL_CONFIG, generator);

    mgr.getChunk(0, 0);
    expect(genCount).toBe(1);

    mgr.clear();

    mgr.getChunk(0, 0);
    expect(genCount).toBe(2); // re-generated
    expect(mgr.residentCount()).toBe(1);
  });
});

describe('hasChunk — wrapping', () => {
  it('should respect toroidal wrapping for hasChunk', () => {
    const mgr = createLandChunkManager(SMALL_CONFIG);
    mgr.getChunk(0, 0);

    expect(mgr.hasChunk(0, 0)).toBe(true);
    expect(mgr.hasChunk(4, 0)).toBe(true);  // wraps to (0,0)
    expect(mgr.hasChunk(0, 4)).toBe(true);  // wraps to (0,0)
    expect(mgr.hasChunk(-4, 0)).toBe(true); // wraps to (0,0)
    expect(mgr.hasChunk(1, 0)).toBe(false);
  });
});

describe('LRU ordering — complex scenarios', () => {
  it('should correctly evict after interleaved access patterns', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 10,
      worldChunksY: 10,
      maxResidentChunks: 4,
    };
    const mgr = createLandChunkManager(config);

    // Load 4 chunks
    mgr.getChunk(0, 0);
    mgr.getChunk(1, 0);
    mgr.getChunk(2, 0);
    mgr.getChunk(3, 0);

    // Touch in reverse order: (0,0) becomes MRU
    mgr.getChunk(3, 0);
    mgr.getChunk(2, 0);
    mgr.getChunk(1, 0);
    mgr.getChunk(0, 0);

    // LRU order (tail→head): (3,0), (2,0), (1,0), (0,0)
    // Evict should remove (3,0) first
    mgr.getChunk(4, 0);
    expect(mgr.hasChunk(3, 0)).toBe(false);
    expect(mgr.hasChunk(0, 0)).toBe(true);
    expect(mgr.hasChunk(1, 0)).toBe(true);
    expect(mgr.hasChunk(2, 0)).toBe(true);
    expect(mgr.hasChunk(4, 0)).toBe(true);
  });

  it('should handle rapid eviction cycles', () => {
    const config: LandChunkManagerConfig = {
      chunkCells: 4,
      worldChunksX: 100,
      worldChunksY: 1,
      maxResidentChunks: 3,
    };
    const mgr = createLandChunkManager(config);

    // Access 50 different chunks — each triggers eviction after the 3rd
    for (let i = 0; i < 50; i++) {
      mgr.getChunk(i, 0);
    }

    expect(mgr.residentCount()).toBe(3);
    // Only the last 3 should be resident
    expect(mgr.hasChunk(47, 0)).toBe(true);
    expect(mgr.hasChunk(48, 0)).toBe(true);
    expect(mgr.hasChunk(49, 0)).toBe(true);
    expect(mgr.hasChunk(46, 0)).toBe(false);

    const stats = mgr.getStats();
    expect(stats.totalAccesses).toBe(50);
    expect(stats.cacheMisses).toBe(50);
    expect(stats.evictions).toBe(47);
  });
});
