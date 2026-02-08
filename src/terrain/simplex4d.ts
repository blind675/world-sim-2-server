/**
 * 4D Simplex Noise — Seeded, deterministic.
 *
 * Based on Stefan Gustavson's simplex noise implementation,
 * adapted for 4D with a seeded permutation table (Mulberry32 PRNG).
 *
 * Used for seamless toroidal terrain generation: 2D world coordinates
 * are mapped to a 4D hypertorus, and this function samples that space.
 */

import { createPrng, nextUint32 } from '../rng/prng';

// ── Gradient table for 4D ────────────────────────────────────────────

// 32 gradients in 4D (from the corners of a 4D hypercube, selecting
// those with 3 non-zero components for better isotropy)
const GRAD4: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 1, 1], [0, 1, 1, -1], [0, 1, -1, 1], [0, 1, -1, -1],
  [0, -1, 1, 1], [0, -1, 1, -1], [0, -1, -1, 1], [0, -1, -1, -1],
  [1, 0, 1, 1], [1, 0, 1, -1], [1, 0, -1, 1], [1, 0, -1, -1],
  [-1, 0, 1, 1], [-1, 0, 1, -1], [-1, 0, -1, 1], [-1, 0, -1, -1],
  [1, 1, 0, 1], [1, 1, 0, -1], [1, -1, 0, 1], [1, -1, 0, -1],
  [-1, 1, 0, 1], [-1, 1, 0, -1], [-1, -1, 0, 1], [-1, -1, 0, -1],
  [1, 1, 1, 0], [1, 1, -1, 0], [1, -1, 1, 0], [1, -1, -1, 0],
  [-1, 1, 1, 0], [-1, 1, -1, 0], [-1, -1, 1, 0], [-1, -1, -1, 0],
];

// Skewing factors for 4D simplex
const F4 = (Math.sqrt(5.0) - 1.0) / 4.0;
const G4 = (5.0 - Math.sqrt(5.0)) / 20.0;

// ── Permutation table ────────────────────────────────────────────────

function buildPermTable(seed: number): Uint8Array {
  const perm = new Uint8Array(512);
  const base = new Uint8Array(256);

  // Initialize identity
  for (let i = 0; i < 256; i++) {
    base[i] = i;
  }

  // Fisher-Yates shuffle with seeded PRNG
  const prng = createPrng(seed);
  for (let i = 255; i > 0; i--) {
    const j = nextUint32(prng) % (i + 1);
    const tmp = base[i];
    base[i] = base[j];
    base[j] = tmp;
  }

  // Double the table for wrapping without modulo
  for (let i = 0; i < 256; i++) {
    perm[i] = base[i];
    perm[i + 256] = base[i];
  }

  return perm;
}

// ── Simplex4D class ──────────────────────────────────────────────────

export interface Simplex4DConfig {
  seed: number;
}

export class Simplex4D {
  private readonly perm: Uint8Array;

  constructor(config: Simplex4DConfig) {
    this.perm = buildPermTable(config.seed);
  }

  /**
   * Evaluate 4D simplex noise at (x, y, z, w).
   * Returns a value in approximately [-1, 1].
   */
  noise(x: number, y: number, z: number, w: number): number {
    const perm = this.perm;

    // Skew the input space to determine which simplex cell we're in
    const s = (x + y + z + w) * F4;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const k = Math.floor(z + s);
    const l = Math.floor(w + s);

    // Unskew the cell origin back to (x,y,z,w) space
    const t = (i + j + k + l) * G4;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const W0 = l - t;

    // Distances from cell origin
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    const w0 = w - W0;

    // Determine which simplex we're in (4D has 24 possible simplices)
    // We use a ranking approach to find the traversal order
    let rankx = 0, ranky = 0, rankz = 0, rankw = 0;
    if (x0 > y0) rankx++; else ranky++;
    if (x0 > z0) rankx++; else rankz++;
    if (x0 > w0) rankx++; else rankw++;
    if (y0 > z0) ranky++; else rankz++;
    if (y0 > w0) ranky++; else rankw++;
    if (z0 > w0) rankz++; else rankw++;

    // Simplex corner offsets (i1,j1,k1,l1) through (i3,j3,k3,l3)
    const i1 = rankx >= 3 ? 1 : 0;
    const j1 = ranky >= 3 ? 1 : 0;
    const k1 = rankz >= 3 ? 1 : 0;
    const l1 = rankw >= 3 ? 1 : 0;

    const i2 = rankx >= 2 ? 1 : 0;
    const j2 = ranky >= 2 ? 1 : 0;
    const k2 = rankz >= 2 ? 1 : 0;
    const l2 = rankw >= 2 ? 1 : 0;

    const i3 = rankx >= 1 ? 1 : 0;
    const j3 = ranky >= 1 ? 1 : 0;
    const k3 = rankz >= 1 ? 1 : 0;
    const l3 = rankw >= 1 ? 1 : 0;

    // Offsets for the 5 corners of the simplex
    const x1 = x0 - i1 + G4;
    const y1 = y0 - j1 + G4;
    const z1 = z0 - k1 + G4;
    const w1 = w0 - l1 + G4;

    const x2 = x0 - i2 + 2.0 * G4;
    const y2 = y0 - j2 + 2.0 * G4;
    const z2 = z0 - k2 + 2.0 * G4;
    const w2 = w0 - l2 + 2.0 * G4;

    const x3 = x0 - i3 + 3.0 * G4;
    const y3 = y0 - j3 + 3.0 * G4;
    const z3 = z0 - k3 + 3.0 * G4;
    const w3 = w0 - l3 + 3.0 * G4;

    const x4 = x0 - 1.0 + 4.0 * G4;
    const y4 = y0 - 1.0 + 4.0 * G4;
    const z4 = z0 - 1.0 + 4.0 * G4;
    const w4 = w0 - 1.0 + 4.0 * G4;

    // Hash coordinates to gradient indices
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    const ll = l & 255;

    // Contribution from the five corners
    let n0 = 0, n1 = 0, n2 = 0, n3 = 0, n4 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0 - w0 * w0;
    if (t0 > 0) {
      const gi0 = perm[ii + perm[jj + perm[kk + perm[ll]]]] % 32;
      t0 *= t0;
      const g = GRAD4[gi0];
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0 + g[2] * z0 + g[3] * w0);
    }

    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1 - w1 * w1;
    if (t1 > 0) {
      const gi1 = perm[ii + i1 + perm[jj + j1 + perm[kk + k1 + perm[ll + l1]]]] % 32;
      t1 *= t1;
      const g = GRAD4[gi1];
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1 + g[2] * z1 + g[3] * w1);
    }

    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2 - w2 * w2;
    if (t2 > 0) {
      const gi2 = perm[ii + i2 + perm[jj + j2 + perm[kk + k2 + perm[ll + l2]]]] % 32;
      t2 *= t2;
      const g = GRAD4[gi2];
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2 + g[2] * z2 + g[3] * w2);
    }

    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3 - w3 * w3;
    if (t3 > 0) {
      const gi3 = perm[ii + i3 + perm[jj + j3 + perm[kk + k3 + perm[ll + l3]]]] % 32;
      t3 *= t3;
      const g = GRAD4[gi3];
      n3 = t3 * t3 * (g[0] * x3 + g[1] * y3 + g[2] * z3 + g[3] * w3);
    }

    let t4 = 0.6 - x4 * x4 - y4 * y4 - z4 * z4 - w4 * w4;
    if (t4 > 0) {
      const gi4 = perm[ii + 1 + perm[jj + 1 + perm[kk + 1 + perm[ll + 1]]]] % 32;
      t4 *= t4;
      const g = GRAD4[gi4];
      n4 = t4 * t4 * (g[0] * x4 + g[1] * y4 + g[2] * z4 + g[3] * w4);
    }

    // Scale to [-1, 1] (approximate normalization factor for 4D simplex)
    return 27.0 * (n0 + n1 + n2 + n3 + n4);
  }
}

export function createSimplex4D(seed: number): Simplex4D {
  return new Simplex4D({ seed });
}
