/**
 * Terrain Generation Pipeline — Deterministic, seamlessly wrapping on a torus.
 *
 * Pipeline stages:
 *   1. Continentalness field (continent centers + noise + domain warp + coastline detail)
 *   2. Mountain belts (masked ridge noise)
 *   3. Rolling relief (hills)
 *   4. Ocean fraction bias (coarse sampling → seaLevelBiasM)
 *   5. Hypsometric curve remap (land elevation distribution)
 *   6. Bathymetry shaping (distance-to-coast → shelf/slope/basin)
 *
 * World-init computes global metadata (seaLevelBiasM, bathymetry distance map).
 * Per-chunk generation uses that metadata + noise to fill terrainHeightM.
 */

import { createTorusNoise, createDerivedTorusNoise, type TorusNoise } from './torusNoise';
import { type RngStream } from '../rng/streams';
import { createRng } from '../rng';
import { combineSeed } from '../rng/hash';

// ── Types ───────────────────────────────────────────────────────────

export interface TerrainGenConfig {
  seed: number;
  worldWidthM: number;
  worldHeightM: number;
  worldCellsX: number;
  worldCellsY: number;
  landCellSizeM: number;
  chunkCells: number;

  // Terrain bounds
  minTerrainM: number;   // -3000
  maxTerrainM: number;   // +4500

  // Ocean fraction
  targetOceanFraction: number;   // 0.65
  oceanFractionTolerance: number; // 0.02

  // Continentalness
  majorContinentCount: number;     // 3
  majorContinentRadiusKm: number;  // 2500
  minorContinentCountMin: number;  // 5
  minorContinentCountMax: number;  // 8
  minorContinentRadiusKm: number;  // 900
  domainWarpAmplitudeKm: number;   // 400
  coastlineDetailScaleKm: number;  // 100

  // Mountains
  mainBeltCount: number;           // 3
  mainBeltLengthKm: [number, number];  // [3000, 6000]
  mainBeltWidthKm: [number, number];   // [300, 600]
  mainBeltPeakM: [number, number];     // [1500, 2500]
  secondaryBeltCount: number;      // 2
  secondaryBeltLengthKm: [number, number]; // [1500, 3500]
  secondaryBeltWidthKm: [number, number];  // [150, 400]
  secondaryBeltPeakM: [number, number];    // [800, 1500]

  // Bathymetry
  shelfDepthM: number;    // -200
  slopeDepthM: number;    // -1500
  basinDepthM: number;    // -3000

  // Coarse sampling resolution for ocean fraction
  coarseSampleRes: number; // 1024
}

/** Pre-computed world metadata needed for per-chunk generation. */
export interface WorldGenMetadata {
  /** Global vertical bias so ~65% of terrain is below sea level */
  seaLevelBiasM: number;
  /** Coarse distance-to-coast map (in coarse grid cells) for bathymetry */
  coastDistanceMap: Float32Array;
  /** Coarse grid resolution */
  coastDistanceRes: number;
  /** Coarse land mask (1 = land, 0 = ocean-eligible) */
  coastLandMask: Uint8Array;
  /**
   * Coarse ocean mask (1 = connected ocean, 0 = land or inland depression).
   * Computed via flood-fill from the global minimum terrainHeightM cell
   * across all coarse cells with (rawHeight + seaLevelBiasM) < 0.
   */
  oceanMask: Uint8Array;
}

/** Continent/island center on the torus */
interface ContinentCenter {
  xM: number;
  yM: number;
  radiusM: number;
  strength: number; // 0..1 weight
}

/** Mountain belt definition */
interface MountainBelt {
  /** Belt center X in meters */
  cxM: number;
  /** Belt center Y in meters */
  cyM: number;
  /** Belt orientation angle in radians */
  angle: number;
  /** Half-length in meters */
  halfLengthM: number;
  /** Half-width in meters */
  halfWidthM: number;
  /** Peak height contribution in meters */
  peakM: number;
}

// ── Toroidal distance ───────────────────────────────────────────────

function toroidalDistanceM(
  x1: number, y1: number,
  x2: number, y2: number,
  worldWidthM: number, worldHeightM: number,
): number {
  let dx = Math.abs(x1 - x2);
  let dy = Math.abs(y1 - y2);
  if (dx > worldWidthM * 0.5) dx = worldWidthM - dx;
  if (dy > worldHeightM * 0.5) dy = worldHeightM - dy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ── Smooth falloff kernel ───────────────────────────────────────────

/** Smooth falloff: 1 at center, 0 at radius, smooth transition. */
function smoothFalloff(distance: number, radius: number): number {
  if (distance >= radius) return 0;
  const t = distance / radius;
  // Quintic smoothstep for C2 continuity
  const s = 1 - t;
  return s * s * s * (s * (s * 6 - 15) + 10);
}

// ── Continent placement (semi-random with min-distance) ─────────────

function placeContinents(
  rng: RngStream,
  count: number,
  radiusKm: number,
  worldWidthM: number,
  worldHeightM: number,
  existingCenters: ContinentCenter[],
  minDistanceKm: number,
  maxAttempts: number = 200,
): ContinentCenter[] {
  const radiusM = radiusKm * 1000;
  const minDistM = minDistanceKm * 1000;
  const placed: ContinentCenter[] = [];

  for (let n = 0; n < count; n++) {
    let bestCandidate: { xM: number; yM: number; minDist: number } | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const xM = rng.float() * worldWidthM;
      const yM = rng.float() * worldHeightM;

      // Check min distance to all existing + already placed
      let minDist = Infinity;
      for (const c of [...existingCenters, ...placed]) {
        const d = toroidalDistanceM(xM, yM, c.xM, c.yM, worldWidthM, worldHeightM);
        if (d < minDist) minDist = d;
      }

      if (minDist >= minDistM) {
        placed.push({ xM, yM, radiusM, strength: 1.0 });
        bestCandidate = null;
        break;
      }

      // Track best candidate in case we can't meet the constraint
      if (!bestCandidate || minDist > bestCandidate.minDist) {
        bestCandidate = { xM, yM, minDist };
      }
    }

    // Fallback: use best candidate if constraint couldn't be met
    if (bestCandidate && placed.length < n + 1) {
      placed.push({
        xM: bestCandidate.xM,
        yM: bestCandidate.yM,
        radiusM,
        strength: 1.0,
      });
    }
  }

  return placed;
}

// ── Mountain belt placement ─────────────────────────────────────────

function placeBelts(
  rng: RngStream,
  count: number,
  lengthKmRange: [number, number],
  widthKmRange: [number, number],
  peakMRange: [number, number],
  worldWidthM: number,
  worldHeightM: number,
  continentCenters: ContinentCenter[],
): MountainBelt[] {
  const belts: MountainBelt[] = [];

  for (let i = 0; i < count; i++) {
    // Place belt near a continent center (cycle through them)
    const continent = continentCenters[i % continentCenters.length];

    // Offset from continent center (within continent radius)
    const offsetAngle = rng.float() * 2 * Math.PI;
    const offsetDist = rng.float() * continent.radiusM * 0.6;
    const cxM = (continent.xM + Math.cos(offsetAngle) * offsetDist + worldWidthM) % worldWidthM;
    const cyM = (continent.yM + Math.sin(offsetAngle) * offsetDist + worldHeightM) % worldHeightM;

    const angle = rng.float() * Math.PI; // orientation
    const lengthKm = lengthKmRange[0] + rng.float() * (lengthKmRange[1] - lengthKmRange[0]);
    const widthKm = widthKmRange[0] + rng.float() * (widthKmRange[1] - widthKmRange[0]);
    const peakM = peakMRange[0] + rng.float() * (peakMRange[1] - peakMRange[0]);

    belts.push({
      cxM,
      cyM,
      angle,
      halfLengthM: lengthKm * 500, // half-length in meters
      halfWidthM: widthKm * 500,   // half-width in meters
      peakM,
    });
  }

  return belts;
}

// ── Belt mask evaluation ────────────────────────────────────────────

function evaluateBeltMask(
  xM: number, yM: number,
  belt: MountainBelt,
  worldWidthM: number, worldHeightM: number,
): number {
  // Toroidal displacement from belt center
  let dx = xM - belt.cxM;
  let dy = yM - belt.cyM;

  // Wrap to nearest image
  if (dx > worldWidthM * 0.5) dx -= worldWidthM;
  if (dx < -worldWidthM * 0.5) dx += worldWidthM;
  if (dy > worldHeightM * 0.5) dy -= worldHeightM;
  if (dy < -worldHeightM * 0.5) dy += worldHeightM;

  // Rotate into belt-local coordinates
  const cosA = Math.cos(belt.angle);
  const sinA = Math.sin(belt.angle);
  const along = dx * cosA + dy * sinA;   // along the belt
  const across = -dx * sinA + dy * cosA; // perpendicular

  // Elliptical falloff
  const normAlong = along / belt.halfLengthM;
  const normAcross = across / belt.halfWidthM;
  const dist2 = normAlong * normAlong + normAcross * normAcross;

  if (dist2 >= 1.0) return 0;

  // Smooth falloff
  const t = Math.sqrt(dist2);
  const s = 1 - t;
  return s * s * s; // cubic falloff
}

// ── Terrain Generator ───────────────────────────────────────────────

export class TerrainGenerator {
  private readonly config: TerrainGenConfig;
  private readonly continentNoise: TorusNoise;
  private readonly warpNoiseX: TorusNoise;
  private readonly warpNoiseY: TorusNoise;
  private readonly coastlineNoise: TorusNoise;
  private readonly ridgeNoise: TorusNoise;
  private readonly hillNoise: TorusNoise;
  private readonly continentCenters: ContinentCenter[];
  private readonly mountainBelts: MountainBelt[];

  constructor(config: TerrainGenConfig) {
    this.config = config;

    const baseNoiseConfig = {
      worldWidthM: config.worldWidthM,
      worldHeightM: config.worldHeightM,
      seed: config.seed,
    };

    // Create independent noise layers with derived seeds
    this.continentNoise = createDerivedTorusNoise(baseNoiseConfig, 'continent');
    this.warpNoiseX = createDerivedTorusNoise(baseNoiseConfig, 'warpX');
    this.warpNoiseY = createDerivedTorusNoise(baseNoiseConfig, 'warpY');
    this.coastlineNoise = createDerivedTorusNoise(baseNoiseConfig, 'coastline');
    this.ridgeNoise = createDerivedTorusNoise(baseNoiseConfig, 'ridge');
    this.hillNoise = createDerivedTorusNoise(baseNoiseConfig, 'hills');

    // Place continents and mountains using seeded RNG
    const rng = createRng(config.seed);
    const terrainStream = rng.stream('terrain-placement');

    // Place major continents
    this.continentCenters = placeContinents(
      terrainStream.fork('major'),
      config.majorContinentCount,
      config.majorContinentRadiusKm,
      config.worldWidthM,
      config.worldHeightM,
      [],
      config.majorContinentRadiusKm * 1.5, // min distance = 1.5× radius
    );

    // Place minor continents
    const minorCount = config.minorContinentCountMin +
      Math.floor(terrainStream.fork('minor-count').float() *
        (config.minorContinentCountMax - config.minorContinentCountMin + 1));

    const minorCenters = placeContinents(
      terrainStream.fork('minor'),
      minorCount,
      config.minorContinentRadiusKm,
      config.worldWidthM,
      config.worldHeightM,
      this.continentCenters,
      config.minorContinentRadiusKm * 1.0, // min distance = 1× radius
    );

    this.continentCenters = [...this.continentCenters, ...minorCenters];

    // Place mountain belts
    const mainBelts = placeBelts(
      terrainStream.fork('main-belts'),
      config.mainBeltCount,
      config.mainBeltLengthKm,
      config.mainBeltWidthKm,
      config.mainBeltPeakM,
      config.worldWidthM,
      config.worldHeightM,
      this.continentCenters.slice(0, config.majorContinentCount),
    );

    const secondaryBelts = placeBelts(
      terrainStream.fork('secondary-belts'),
      config.secondaryBeltCount,
      config.secondaryBeltLengthKm,
      config.secondaryBeltWidthKm,
      config.secondaryBeltPeakM,
      config.worldWidthM,
      config.worldHeightM,
      this.continentCenters.slice(0, config.majorContinentCount),
    );

    this.mountainBelts = [...mainBelts, ...secondaryBelts];
  }

  /**
   * Evaluate raw terrain height at a world position (in meters).
   * This is BEFORE ocean fraction bias, hypsometric remap, and bathymetry.
   */
  rawHeight(xM: number, yM: number): number {
    const cfg = this.config;

    // ── 1. Continentalness field ──────────────────────────────────
    let continentalness = 0;

    // Sum falloff from all continent centers
    for (const center of this.continentCenters) {
      const dist = toroidalDistanceM(
        xM, yM, center.xM, center.yM,
        cfg.worldWidthM, cfg.worldHeightM,
      );
      continentalness += center.strength * smoothFalloff(dist, center.radiusM);
    }

    // Add low-frequency noise to break symmetry
    const continentNoiseFreq = 1.0 / (cfg.worldWidthM * 0.3); // ~30% of world
    continentalness += 0.3 * this.continentNoise.fbm(xM, yM, continentNoiseFreq, 3);

    // ── Domain warping ────────────────────────────────────────────
    const warpAmpM = cfg.domainWarpAmplitudeKm * 1000;
    const warpFreq = 1.0 / (cfg.worldWidthM * 0.15);
    const warpX = warpAmpM * this.warpNoiseX.fbm(xM, yM, warpFreq, 3);
    const warpY = warpAmpM * this.warpNoiseY.fbm(xM, yM, warpFreq, 3);

    // Re-evaluate continentalness at warped position
    let warpedContinentalness = 0;
    for (const center of this.continentCenters) {
      const dist = toroidalDistanceM(
        xM + warpX, yM + warpY, center.xM, center.yM,
        cfg.worldWidthM, cfg.worldHeightM,
      );
      warpedContinentalness += center.strength * smoothFalloff(dist, center.radiusM);
    }
    warpedContinentalness += 0.3 * this.continentNoise.fbm(xM + warpX, yM + warpY, continentNoiseFreq, 3);

    // Blend original and warped for stability
    continentalness = 0.3 * continentalness + 0.7 * warpedContinentalness;

    // ── Coastline detail noise ────────────────────────────────────
    const coastFreq = 1.0 / (cfg.coastlineDetailScaleKm * 1000);
    continentalness += 0.15 * this.coastlineNoise.fbm(xM, yM, coastFreq, 4);

    // Convert continentalness to raw height (centered around 0)
    // continentalness ~[0, 1.5] → height ~[-2000, 3000]
    let height = (continentalness - 0.5) * 4000;

    // ── 2. Mountain belts ─────────────────────────────────────────
    const ridgeFreq = 1.0 / 50000; // ~50 km features
    for (const belt of this.mountainBelts) {
      const mask = evaluateBeltMask(xM, yM, belt, cfg.worldWidthM, cfg.worldHeightM);
      if (mask > 0.001) {
        const ridge = this.ridgeNoise.ridged(xM, yM, ridgeFreq, 4, 2.0, 0.5);
        height += mask * belt.peakM * ridge;
      }
    }

    // ── 3. Rolling relief (hills) ─────────────────────────────────
    const hillFreq = 1.0 / 20000; // ~20 km features
    height += 200 * this.hillNoise.fbm(xM, yM, hillFreq, 4, 2.2, 0.45);

    return height;
  }

  /**
   * Compute world-init metadata: ocean fraction bias + bathymetry distance map.
   * This is called once at world creation.
   */
  computeWorldMetadata(): WorldGenMetadata {
    const cfg = this.config;
    const res = cfg.coarseSampleRes;

    // ── Step 4: Ocean fraction bias ───────────────────────────────
    // Sample raw heights on a coarse grid
    const sampleCount = res * res;
    const samples = new Float32Array(sampleCount);

    for (let sy = 0; sy < res; sy++) {
      const yM = (sy + 0.5) * cfg.worldHeightM / res;
      for (let sx = 0; sx < res; sx++) {
        const xM = (sx + 0.5) * cfg.worldWidthM / res;
        samples[sy * res + sx] = this.rawHeight(xM, yM);
      }
    }

    // Binary search for seaLevelBiasM
    const seaLevelBiasM = this.findOceanBias(samples, cfg.targetOceanFraction);

    // ── Step 6: Bathymetry distance-to-coast ──────────────────────
    // Build coarse land mask (after applying bias)
    const landMask = new Uint8Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      landMask[i] = (samples[i] + seaLevelBiasM) >= 0 ? 1 : 0;
    }

    // BFS distance-to-coast on coarse grid
    const coastDistanceMap = this.computeCoastDistance(landMask, res);

    // ── Ocean connectivity flood-fill on coarse grid ──────────────
    const oceanMask = this.computeOceanMask(samples, seaLevelBiasM, res);

    return {
      seaLevelBiasM,
      coastDistanceMap,
      coastDistanceRes: res,
      coastLandMask: landMask,
      oceanMask,
    };
  }

  /**
   * Generate terrain for a single chunk, using pre-computed world metadata.
   */
  generateChunkTerrain(
    cx: number, cy: number,
    terrainHeightM: Float32Array,
    metadata: WorldGenMetadata,
  ): void {
    const cfg = this.config;
    const chunkCells = cfg.chunkCells;
    const cellSizeM = cfg.landCellSizeM;

    // Chunk origin in world cell coordinates
    const cellOriginX = cx * chunkCells;
    const cellOriginY = cy * chunkCells;

    for (let ly = 0; ly < chunkCells; ly++) {
      const worldCellY = cellOriginY + ly;
      const yM = (worldCellY + 0.5) * cellSizeM;

      for (let lx = 0; lx < chunkCells; lx++) {
        const worldCellX = cellOriginX + lx;
        const xM = (worldCellX + 0.5) * cellSizeM;
        const idx = ly * chunkCells + lx;

        // Raw height + bias
        let h = this.rawHeight(xM, yM) + metadata.seaLevelBiasM;

        // ── Step 5: Hypsometric remap (land only) ─────────────────
        if (h >= 0) {
          h = this.hypsometricRemap(h);
        }

        // ── Step 6: Bathymetry shaping (ocean only) ───────────────
        if (h < 0) {
          h = this.bathymetryShape(h, xM, yM, metadata);
        }

        // Clamp to bounds
        h = Math.max(cfg.minTerrainM, Math.min(cfg.maxTerrainM, h));

        terrainHeightM[idx] = h;
      }
    }
  }

  /**
   * Initialize ocean water depth for a chunk using the coarse ocean mask.
   *
   * For each cell:
   *   - Look up the coarse ocean mask at the cell's world position.
   *   - If the coarse cell is ocean AND terrainHeightM < 0:
   *     waterDepthM = -terrainHeightM (surface at sea level = 0).
   *   - Otherwise: waterDepthM = 0 (land or inland depression).
   *
   * This is an approximation: coastline accuracy is limited to the coarse
   * grid resolution. For cells at coarse-cell boundaries, we use the
   * terrain height as the tiebreaker (negative = ocean if coarse says ocean).
   */
  initializeOceanWater(
    cx: number, cy: number,
    terrainHeightM: Float32Array,
    waterDepthM: Float32Array,
    metadata: WorldGenMetadata,
  ): void {
    const cfg = this.config;
    const chunkCells = cfg.chunkCells;
    const cellSizeM = cfg.landCellSizeM;
    const res = metadata.coastDistanceRes;

    const cellOriginX = cx * chunkCells;
    const cellOriginY = cy * chunkCells;

    for (let ly = 0; ly < chunkCells; ly++) {
      const worldCellY = cellOriginY + ly;
      const yM = (worldCellY + 0.5) * cellSizeM;

      for (let lx = 0; lx < chunkCells; lx++) {
        const worldCellX = cellOriginX + lx;
        const xM = (worldCellX + 0.5) * cellSizeM;
        const idx = ly * chunkCells + lx;

        const h = terrainHeightM[idx];

        // Map to coarse grid cell
        const sx = Math.floor(xM / cfg.worldWidthM * res) % res;
        const sy = Math.floor(yM / cfg.worldHeightM * res) % res;
        const isCoarseOcean = metadata.oceanMask[sy * res + sx] === 1;

        if (isCoarseOcean && h < 0) {
          // Ocean cell: fill water to sea level
          waterDepthM[idx] = -h;
        } else {
          // Land or inland depression: no initial water
          waterDepthM[idx] = 0;
        }
      }
    }
  }

  // ── Private helpers ─────────────────────────────────────────────

  /**
   * Flood-fill ocean connectivity on the coarse grid.
   * Starts from the global minimum (rawHeight + bias) cell and spreads
   * to all connected cells with (rawHeight + bias) < 0.
   * Returns a Uint8Array where 1 = connected ocean, 0 = land/inland.
   */
  private computeOceanMask(
    rawSamples: Float32Array,
    seaLevelBiasM: number,
    res: number,
  ): Uint8Array {
    const count = res * res;
    const oceanMask = new Uint8Array(count);

    // Apply bias to find which cells are below sea level
    const belowSea = new Uint8Array(count);
    let globalMinIdx = 0;
    let globalMinVal = Infinity;
    for (let i = 0; i < count; i++) {
      const h = rawSamples[i] + seaLevelBiasM;
      if (h < 0) {
        belowSea[i] = 1;
      }
      if (h < globalMinVal) {
        globalMinVal = h;
        globalMinIdx = i;
      }
    }

    // If global minimum is not below sea level, no ocean
    if (belowSea[globalMinIdx] === 0) {
      return oceanMask;
    }

    // BFS flood-fill from global minimum
    const queue: number[] = [globalMinIdx];
    oceanMask[globalMinIdx] = 1;

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const x = idx % res;
      const y = Math.floor(idx / res);

      const neighbors = this.getCoarseNeighbors(x, y, res);
      for (const [nx, ny] of neighbors) {
        const nIdx = ny * res + nx;
        if (belowSea[nIdx] === 1 && oceanMask[nIdx] === 0) {
          oceanMask[nIdx] = 1;
          queue.push(nIdx);
        }
      }
    }

    return oceanMask;
  }

  /** Binary search for the vertical bias that achieves target ocean fraction. */
  private findOceanBias(samples: Float32Array, targetFraction: number): number {
    // Sort a copy to find the percentile
    const sorted = Float32Array.from(samples).sort();
    const targetIndex = Math.floor(targetFraction * sorted.length);

    // The bias is the negative of the value at the target percentile
    // (we want that value to become 0 = sea level)
    return -sorted[targetIndex];
  }

  /** BFS distance-to-coast on a coarse grid (toroidal). */
  private computeCoastDistance(landMask: Uint8Array, res: number): Float32Array {
    const dist = new Float32Array(res * res);
    dist.fill(Infinity);

    // Queue: cells adjacent to coast (land↔ocean boundary)
    const queue: number[] = [];

    for (let y = 0; y < res; y++) {
      for (let x = 0; x < res; x++) {
        const idx = y * res + x;
        if (landMask[idx] === 0) {
          // Ocean cell — check if adjacent to land (coast)
          const neighbors = this.getCoarseNeighbors(x, y, res);
          for (const [nx, ny] of neighbors) {
            if (landMask[ny * res + nx] === 1) {
              dist[idx] = 0; // coastal ocean cell
              queue.push(idx);
              break;
            }
          }
        }
      }
    }

    // BFS from coastal ocean cells outward into deep ocean
    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const x = idx % res;
      const y = Math.floor(idx / res);
      const currentDist = dist[idx];

      const neighbors = this.getCoarseNeighbors(x, y, res);
      for (const [nx, ny] of neighbors) {
        const nIdx = ny * res + nx;
        if (landMask[nIdx] === 0 && dist[nIdx] > currentDist + 1) {
          dist[nIdx] = currentDist + 1;
          queue.push(nIdx);
        }
      }
    }

    return dist;
  }

  /** Get 4-connected neighbors with toroidal wrapping on coarse grid. */
  private getCoarseNeighbors(x: number, y: number, res: number): Array<[number, number]> {
    return [
      [(x + 1) % res, y],
      [(x - 1 + res) % res, y],
      [x, (y + 1) % res],
      [x, (y - 1 + res) % res],
    ];
  }

  /**
   * Hypsometric remap: redistribute land elevations to match
   * Earth-like distribution (most land is low-lying).
   * Input h >= 0, output >= 0. Monotonic.
   */
  private hypsometricRemap(h: number): number {
    const maxLand = this.config.maxTerrainM;

    // Normalize to [0, 1]
    // Raw heights can exceed maxTerrainM before remap, so we use a generous input range
    const inputRange = maxLand * 2; // generous input range
    let t = Math.min(h / inputRange, 1.0);

    // Apply a power curve that compresses most land into low elevations
    // t^0.4 pushes values toward 1 (more area at low elevations)
    // Combined with the output scaling, this creates:
    //   ~70% of land below 1000m
    //   ~15-20% between 1000-2000m
    //   ~5-10% between 2000-3000m
    //   ~1-3% above 3000m
    t = Math.pow(t, 0.4);

    return t * maxLand;
  }

  /**
   * Bathymetry shaping: apply shelf/slope/basin depth curve
   * based on distance-to-coast from the coarse grid.
   */
  private bathymetryShape(
    rawH: number,
    xM: number, yM: number,
    metadata: WorldGenMetadata,
  ): number {
    const cfg = this.config;
    const res = metadata.coastDistanceRes;

    // Map world position to coarse grid cell
    const sx = Math.floor(xM / cfg.worldWidthM * res) % res;
    const sy = Math.floor(yM / cfg.worldHeightM * res) % res;
    const coastDist = metadata.coastDistanceMap[sy * res + sx];

    if (!isFinite(coastDist)) {
      // Very far from coast or isolated — deep basin
      return cfg.basinDepthM;
    }

    // Convert coarse grid distance to approximate km
    const coarseCellKm = (cfg.worldWidthM / res) / 1000;
    const distKm = coastDist * coarseCellKm;

    // Depth curve: shelf → slope → basin
    let depth: number;
    if (distKm < 50) {
      // Continental shelf: 0 to shelfDepthM over ~50 km
      const t = distKm / 50;
      depth = t * cfg.shelfDepthM;
    } else if (distKm < 200) {
      // Continental slope: shelfDepthM to slopeDepthM over ~150 km
      const t = (distKm - 50) / 150;
      depth = cfg.shelfDepthM + t * (cfg.slopeDepthM - cfg.shelfDepthM);
    } else if (distKm < 500) {
      // Transition to deep basin: slopeDepthM to basinDepthM over ~300 km
      const t = (distKm - 200) / 300;
      depth = cfg.slopeDepthM + t * (cfg.basinDepthM - cfg.slopeDepthM);
    } else {
      depth = cfg.basinDepthM;
    }

    // Blend with raw height to preserve some noise variation in ocean floor
    // but ensure it stays negative
    const blended = depth + (rawH - depth) * 0.1;
    return Math.min(blended, -1); // always below sea level
  }
}

// ── Default config from PDR ─────────────────────────────────────────

export function createDefaultTerrainGenConfig(
  seed: number,
  worldWidthM: number,
  worldHeightM: number,
  worldCellsX: number,
  worldCellsY: number,
  landCellSizeM: number,
  chunkCells: number,
): TerrainGenConfig {
  return {
    seed,
    worldWidthM,
    worldHeightM,
    worldCellsX,
    worldCellsY,
    landCellSizeM,
    chunkCells,

    minTerrainM: -3000,
    maxTerrainM: 4500,

    targetOceanFraction: 0.65,
    oceanFractionTolerance: 0.02,

    majorContinentCount: 3,
    majorContinentRadiusKm: 2500,
    minorContinentCountMin: 5,
    minorContinentCountMax: 8,
    minorContinentRadiusKm: 900,
    domainWarpAmplitudeKm: 400,
    coastlineDetailScaleKm: 100,

    mainBeltCount: 3,
    mainBeltLengthKm: [3000, 6000],
    mainBeltWidthKm: [300, 600],
    mainBeltPeakM: [1500, 2500],
    secondaryBeltCount: 2,
    secondaryBeltLengthKm: [1500, 3500],
    secondaryBeltWidthKm: [150, 400],
    secondaryBeltPeakM: [800, 1500],

    shelfDepthM: -200,
    slopeDepthM: -1500,
    basinDepthM: -3000,

    coarseSampleRes: 1024,
  };
}
