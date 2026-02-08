/**
 * LandChunk — SoA (Struct-of-Arrays) storage for a 256×256 block of land cells.
 *
 * Each field is a separate typed array for cache-friendly batch processing.
 * Chunk coordinates (cx, cy) identify the chunk in the world grid.
 * Cell index within a chunk: i = localY * chunkCells + localX
 */

// ── Types ───────────────────────────────────────────────────────────

export interface LandChunkData {
  // --- terrain (static after world-gen)
  terrainHeightM: Float32Array;    // meters relative to sea level (can be negative)

  // --- water (dynamic)
  waterDepthM: Float32Array;       // meters of surface water above ground (>= 0)

  // --- surface water & rivers
  riverId: Int32Array;             // optional ID / channel marker (-1 = none)
  runoffFlux: Float32Array;        // accumulated flow proxy for rendering/debugging

  // --- soil & groundwater coupling
  soilMoisture: Float32Array;      // 0..1 bucket
  fieldCapacity: Float32Array;     // 0..1 (later derived from soil/biome)

  // --- vegetation macro-state (v1.1 minimal)
  grassCover: Float32Array;        // 0..1
}

export interface LandChunk {
  /** Chunk X coordinate in the world chunk grid */
  readonly cx: number;
  /** Chunk Y coordinate in the world chunk grid */
  readonly cy: number;
  /** Number of cells per side (256) */
  readonly chunkCells: number;
  /** Total number of cells in this chunk (chunkCells²) */
  readonly cellCount: number;
  /** SoA field arrays */
  readonly data: LandChunkData;
}

// ── Factory ─────────────────────────────────────────────────────────

/**
 * Create a new LandChunk with all arrays zero-initialized.
 * riverId is initialized to -1 (no river).
 */
export function createLandChunk(cx: number, cy: number, chunkCells: number): LandChunk {
  const cellCount = chunkCells * chunkCells;

  const riverId = new Int32Array(cellCount);
  riverId.fill(-1);

  return {
    cx,
    cy,
    chunkCells,
    cellCount,
    data: {
      terrainHeightM: new Float32Array(cellCount),
      waterDepthM: new Float32Array(cellCount),
      riverId,
      runoffFlux: new Float32Array(cellCount),
      soilMoisture: new Float32Array(cellCount),
      fieldCapacity: new Float32Array(cellCount),
      grassCover: new Float32Array(cellCount),
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert local (x, y) within a chunk to a flat array index. */
export function cellIndex(localX: number, localY: number, chunkCells: number): number {
  return localY * chunkCells + localX;
}

/** Estimate memory usage of a single chunk in bytes. */
export function chunkMemoryBytes(chunkCells: number): number {
  const cellCount = chunkCells * chunkCells;
  // 6 Float32Arrays (4 bytes each) + 1 Int32Array (4 bytes)
  return cellCount * 7 * 4;
}
