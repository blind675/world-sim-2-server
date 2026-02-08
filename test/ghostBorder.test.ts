import { buildGhostBorder, paddedIndex } from '../src/land/ghostBorder';
import { createLandChunkManager } from '../src/land/landChunkManager';
import { cellIndex } from '../src/land/landChunk';
import {
  stepChunkHydrology,
  stepChunkHydrologyWithBorders,
  addWaterAtCell,
  totalWaterVolume,
  createDefaultHydrologyConfig,
  type HydrologyConfig,
} from '../src/land/hydrology';

const CC = 4; // small chunk for fast tests
const WCX = 3; // 3x3 world in chunks
const WCY = 3;

function makeManager(terrainFn?: (cx: number, cy: number, x: number, y: number) => number) {
  return createLandChunkManager(
    { chunkCells: CC, worldChunksX: WCX, worldChunksY: WCY, maxResidentChunks: 100 },
    terrainFn
      ? (chunk) => {
          for (let ly = 0; ly < CC; ly++) {
            for (let lx = 0; lx < CC; lx++) {
              chunk.data.terrainHeightM[ly * CC + lx] = terrainFn(chunk.cx, chunk.cy, lx, ly);
            }
          }
        }
      : undefined,
  );
}

const fastConfig: HydrologyConfig = {
  ...createDefaultHydrologyConfig(),
  subStepsPerTick: 10,
};

describe('buildGhostBorder', () => {
  it('should create a padded grid of size (chunkCells+2)²', () => {
    const mgr = makeManager(() => 100);
    const ghost = buildGhostBorder(1, 1, mgr);

    expect(ghost.paddedSize).toBe(CC + 2);
    expect(ghost.chunkCells).toBe(CC);
    expect(ghost.terrainHeightM.length).toBe((CC + 2) * (CC + 2));
    expect(ghost.waterDepthM.length).toBe((CC + 2) * (CC + 2));
  });

  it('should copy center chunk data into interior of padded grid', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);
    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    // Check interior matches center chunk
    const center = mgr.getChunk(1, 1);
    for (let ly = 0; ly < CC; ly++) {
      for (let lx = 0; lx < CC; lx++) {
        const srcIdx = ly * CC + lx;
        const dstIdx = (ly + 1) * ps + (lx + 1);
        expect(ghost.terrainHeightM[dstIdx]).toBe(center.data.terrainHeightM[srcIdx]);
      }
    }
  });

  it('should copy N neighbor bottom row into top halo', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);
    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    const nChunk = mgr.getChunk(1, 0); // N neighbor
    for (let lx = 0; lx < CC; lx++) {
      const srcIdx = (CC - 1) * CC + lx; // bottom row
      const dstIdx = 0 * ps + (lx + 1);  // top halo
      expect(ghost.terrainHeightM[dstIdx]).toBe(nChunk.data.terrainHeightM[srcIdx]);
    }
  });

  it('should copy S neighbor top row into bottom halo', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);
    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    const sChunk = mgr.getChunk(1, 2); // S neighbor
    for (let lx = 0; lx < CC; lx++) {
      const srcIdx = 0 * CC + lx; // top row
      const dstIdx = (CC + 1) * ps + (lx + 1);
      expect(ghost.terrainHeightM[dstIdx]).toBe(sChunk.data.terrainHeightM[srcIdx]);
    }
  });

  it('should copy W neighbor right column into left halo', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);
    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    const wChunk = mgr.getChunk(0, 1); // W neighbor
    for (let ly = 0; ly < CC; ly++) {
      const srcIdx = ly * CC + (CC - 1); // right column
      const dstIdx = (ly + 1) * ps + 0;
      expect(ghost.terrainHeightM[dstIdx]).toBe(wChunk.data.terrainHeightM[srcIdx]);
    }
  });

  it('should copy E neighbor left column into right halo', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);
    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    const eChunk = mgr.getChunk(2, 1); // E neighbor
    for (let ly = 0; ly < CC; ly++) {
      const srcIdx = ly * CC + 0; // left column
      const dstIdx = (ly + 1) * ps + (CC + 1);
      expect(ghost.terrainHeightM[dstIdx]).toBe(eChunk.data.terrainHeightM[srcIdx]);
    }
  });

  it('should copy diagonal corner cells correctly', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);
    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    // NW corner: bottom-right cell of chunk (0,0)
    const nwChunk = mgr.getChunk(0, 0);
    expect(ghost.terrainHeightM[paddedIndex(0, 0, ps)])
      .toBe(nwChunk.data.terrainHeightM[(CC - 1) * CC + (CC - 1)]);

    // NE corner: bottom-left cell of chunk (2,0)
    const neChunk = mgr.getChunk(2, 0);
    expect(ghost.terrainHeightM[paddedIndex(CC + 1, 0, ps)])
      .toBe(neChunk.data.terrainHeightM[(CC - 1) * CC + 0]);

    // SW corner: top-right cell of chunk (0,2)
    const swChunk = mgr.getChunk(0, 2);
    expect(ghost.terrainHeightM[paddedIndex(0, CC + 1, ps)])
      .toBe(swChunk.data.terrainHeightM[0 * CC + (CC - 1)]);

    // SE corner: top-left cell of chunk (2,2)
    const seChunk = mgr.getChunk(2, 2);
    expect(ghost.terrainHeightM[paddedIndex(CC + 1, CC + 1, ps)])
      .toBe(seChunk.data.terrainHeightM[0]);
  });

  it('should handle toroidal wrapping at world edges', () => {
    const mgr = makeManager((cx, cy, x, y) => cx * 1000 + cy * 100 + x * 10 + y);

    // Build ghost for chunk (0,0) — its N neighbor wraps to (0, WCY-1)
    const ghost = buildGhostBorder(0, 0, mgr);
    const ps = ghost.paddedSize;

    // N neighbor is chunk (0, WCY-1) = (0, 2)
    const nChunk = mgr.getChunk(0, WCY - 1);
    for (let lx = 0; lx < CC; lx++) {
      const srcIdx = (CC - 1) * CC + lx;
      const dstIdx = 0 * ps + (lx + 1);
      expect(ghost.terrainHeightM[dstIdx]).toBe(nChunk.data.terrainHeightM[srcIdx]);
    }

    // W neighbor is chunk (WCX-1, 0) = (2, 0)
    const wChunk = mgr.getChunk(WCX - 1, 0);
    for (let ly = 0; ly < CC; ly++) {
      const srcIdx = ly * CC + (CC - 1);
      const dstIdx = (ly + 1) * ps + 0;
      expect(ghost.terrainHeightM[dstIdx]).toBe(wChunk.data.terrainHeightM[srcIdx]);
    }
  });

  it('should also copy waterDepthM into the ghost border', () => {
    const mgr = makeManager(() => 100);
    // Add water to a neighbor chunk
    const nChunk = mgr.getChunk(1, 0);
    nChunk.data.waterDepthM[(CC - 1) * CC + 2] = 5.0; // bottom row, x=2

    const ghost = buildGhostBorder(1, 1, mgr);
    const ps = ghost.paddedSize;

    // Should appear in top halo at (2+1, 0) = (3, 0)
    expect(ghost.waterDepthM[0 * ps + 3]).toBe(5.0);
  });
});

describe('cross-chunk hydrology with ghost borders', () => {
  it('should allow water to flow across chunk boundaries', () => {
    // Create a world where terrain slopes from chunk (0,0) high to chunk (1,0) low
    const mgr = makeManager((cx, _cy, x, _y) => {
      // Global X position determines height: higher on left, lower on right
      const globalX = cx * CC + x;
      return 200 - globalX * 10; // decreasing left to right
    });

    // Add water at the right edge of chunk (0,0)
    const chunk0 = mgr.getChunk(0, 0);
    for (let y = 0; y < CC; y++) {
      addWaterAtCell(chunk0.data, CC, CC - 1, y, 5.0);
    }

    const beforeVol0 = totalWaterVolume(chunk0.data.waterDepthM);

    // Run hydrology WITH ghost borders on chunk (0,0)
    stepChunkHydrologyWithBorders(0, 0, mgr, {
      ...fastConfig,
      subStepsPerTick: 20,
    });

    const afterVol0 = totalWaterVolume(chunk0.data.waterDepthM);

    // Water should have flowed out of chunk (0,0) into the ghost (neighbor chunk)
    // So chunk 0's total water should decrease
    expect(afterVol0).toBeLessThan(beforeVol0);
  });

  it('should NOT allow cross-chunk flow without ghost borders', () => {
    const mgr = makeManager((cx, _cy, x, _y) => {
      const globalX = cx * CC + x;
      return 200 - globalX * 10;
    });

    const chunk0 = mgr.getChunk(0, 0);
    for (let y = 0; y < CC; y++) {
      addWaterAtCell(chunk0.data, CC, CC - 1, y, 5.0);
    }

    const beforeVol0 = totalWaterVolume(chunk0.data.waterDepthM);

    // Run hydrology WITHOUT ghost borders
    stepChunkHydrology(chunk0.data, CC, {
      ...fastConfig,
      subStepsPerTick: 20,
    });

    const afterVol0 = totalWaterVolume(chunk0.data.waterDepthM);

    // Without ghost borders, water is conserved within the chunk
    expect(afterVol0).toBeCloseTo(beforeVol0, 4);
  });

  it('water flowing to ghost should decrease source chunk total', () => {
    // Flat terrain at 100m, but neighbor chunk at 0m
    const mgr = makeManager((cx, _cy, _x, _y) => {
      return cx === 1 ? 100 : 0; // chunk 1 is high, others are low
    });

    const chunk1 = mgr.getChunk(1, 1);
    // Add water to the right edge of chunk (1,1)
    for (let y = 0; y < CC; y++) {
      addWaterAtCell(chunk1.data, CC, CC - 1, y, 10.0);
    }

    const before = totalWaterVolume(chunk1.data.waterDepthM);

    stepChunkHydrologyWithBorders(1, 1, mgr, {
      ...fastConfig,
      subStepsPerTick: 30,
    });

    const after = totalWaterVolume(chunk1.data.waterDepthM);
    expect(after).toBeLessThan(before);
  });

  it('should be deterministic with ghost borders', () => {
    function setupWorld() {
      const mgr = makeManager((cx, cy, x, y) => {
        const globalX = cx * CC + x;
        const globalY = cy * CC + y;
        return 200 - globalX * 5 - globalY * 3;
      });
      const chunk = mgr.getChunk(1, 1);
      addWaterAtCell(chunk.data, CC, 2, 2, 10.0);
      return mgr;
    }

    const mgrA = setupWorld();
    const mgrB = setupWorld();

    stepChunkHydrologyWithBorders(1, 1, mgrA, fastConfig);
    stepChunkHydrologyWithBorders(1, 1, mgrB, fastConfig);

    const chunkA = mgrA.getChunk(1, 1);
    const chunkB = mgrB.getChunk(1, 1);

    for (let i = 0; i < CC * CC; i++) {
      expect(chunkA.data.waterDepthM[i]).toBe(chunkB.data.waterDepthM[i]);
    }
  });

  it('should handle toroidal wrapping for water flow at world edges', () => {
    // Terrain: chunk (0,*) is high, chunk (WCX-1,*) is low
    // Water at left edge of chunk (0,0) should flow to chunk (WCX-1,0) via wrapping
    const mgr = makeManager((cx, _cy, x, _y) => {
      if (cx === 0 && x === 0) return 200; // left edge of chunk 0 is high
      if (cx === 0) return 150;
      return 50; // other chunks are low
    });

    const chunk0 = mgr.getChunk(0, 0);
    // Add water at the left edge (x=0) of chunk (0,0)
    for (let y = 0; y < CC; y++) {
      addWaterAtCell(chunk0.data, CC, 0, y, 10.0);
    }

    const before = totalWaterVolume(chunk0.data.waterDepthM);

    stepChunkHydrologyWithBorders(0, 0, mgr, {
      ...fastConfig,
      subStepsPerTick: 20,
    });

    const after = totalWaterVolume(chunk0.data.waterDepthM);

    // Water should flow left into the ghost (wrapping to chunk WCX-1)
    expect(after).toBeLessThan(before);
  });

  it('existing intra-chunk tests should still pass with ghost=undefined', () => {
    // Verify backward compatibility: stepChunkHydrology without ghost
    const mgr = makeManager((_cx, _cy, x, _y) => 200 - x * 20);
    const chunk = mgr.getChunk(0, 0);
    addWaterAtCell(chunk.data, CC, 0, 2, 5.0);

    const before = totalWaterVolume(chunk.data.waterDepthM);
    stepChunkHydrology(chunk.data, CC, fastConfig); // no ghost
    const after = totalWaterVolume(chunk.data.waterDepthM);

    // Water conserved within chunk
    expect(after).toBeCloseTo(before, 4);
  });
});

describe('paddedIndex', () => {
  it('should compute correct flat index', () => {
    expect(paddedIndex(0, 0, 6)).toBe(0);
    expect(paddedIndex(5, 0, 6)).toBe(5);
    expect(paddedIndex(0, 1, 6)).toBe(6);
    expect(paddedIndex(3, 2, 6)).toBe(15);
  });
});
