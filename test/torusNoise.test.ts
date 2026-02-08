import { createTorusNoise, createDerivedTorusNoise } from '../src/terrain/torusNoise';

const WORLD_W = 40_000_000; // 40,000 km in meters (20,000 km radius planet)
const WORLD_H = 40_000_000;
const SEED = 42;

describe('TorusNoise', () => {
  describe('sample', () => {
    it('should return values in approximately [-1, 1]', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      let min = Infinity, max = -Infinity;

      for (let i = 0; i < 1000; i++) {
        const v = noise.sample(i * 40000, i * 30000, 1.0 / 1_000_000);
        if (v < min) min = v;
        if (v > max) max = v;
      }

      expect(min).toBeGreaterThan(-1.5);
      expect(max).toBeLessThan(1.5);
    });

    it('should wrap seamlessly in X', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      const freq = 1.0 / 2_000_000;

      for (let y = 0; y < 10; y++) {
        const yM = y * 4_000_000;
        const a = noise.sample(0, yM, freq);
        const b = noise.sample(WORLD_W, yM, freq);
        expect(a).toBeCloseTo(b, 10);
      }
    });

    it('should wrap seamlessly in Y', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      const freq = 1.0 / 2_000_000;

      for (let x = 0; x < 10; x++) {
        const xM = x * 4_000_000;
        const a = noise.sample(xM, 0, freq);
        const b = noise.sample(xM, WORLD_H, freq);
        expect(a).toBeCloseTo(b, 10);
      }
    });

    it('should be deterministic', () => {
      const a = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      const b = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      const freq = 1.0 / 500_000;

      for (let i = 0; i < 50; i++) {
        const x = i * 800_000;
        const y = i * 600_000;
        expect(a.sample(x, y, freq)).toBe(b.sample(x, y, freq));
      }
    });
  });

  describe('fbm', () => {
    it('should return values in approximately [-1, 1]', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      let min = Infinity, max = -Infinity;

      for (let i = 0; i < 500; i++) {
        const v = noise.fbm(i * 80000, i * 60000, 1.0 / 2_000_000, 4);
        if (v < min) min = v;
        if (v > max) max = v;
      }

      expect(min).toBeGreaterThan(-1.5);
      expect(max).toBeLessThan(1.5);
    });

    it('should wrap seamlessly', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      const freq = 1.0 / 2_000_000;

      const a = noise.fbm(0, 5_000_000, freq, 4);
      const b = noise.fbm(WORLD_W, 5_000_000, freq, 4);
      expect(a).toBeCloseTo(b, 10);
    });
  });

  describe('ridged', () => {
    it('should return values in [0, 1] range', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      let min = Infinity, max = -Infinity;

      for (let i = 0; i < 500; i++) {
        const v = noise.ridged(i * 80000, i * 60000, 1.0 / 500_000, 4);
        if (v < min) min = v;
        if (v > max) max = v;
      }

      // Ridged noise is squared absolute value, so should be >= 0
      expect(min).toBeGreaterThanOrEqual(-0.01);
      expect(max).toBeLessThanOrEqual(1.5);
    });

    it('should wrap seamlessly', () => {
      const noise = createTorusNoise({ worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED });
      const freq = 1.0 / 500_000;

      const a = noise.ridged(0, 5_000_000, freq, 4);
      const b = noise.ridged(WORLD_W, 5_000_000, freq, 4);
      expect(a).toBeCloseTo(b, 10);
    });
  });

  describe('createDerivedTorusNoise', () => {
    it('should produce different noise for different labels', () => {
      const base = { worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED };
      const a = createDerivedTorusNoise(base, 'continent');
      const b = createDerivedTorusNoise(base, 'warp');
      const freq = 1.0 / 1_000_000;

      let same = 0;
      for (let i = 0; i < 50; i++) {
        if (a.sample(i * 800_000, i * 600_000, freq) === b.sample(i * 800_000, i * 600_000, freq)) same++;
      }
      expect(same).toBeLessThan(3);
    });

    it('should be deterministic for same label', () => {
      const base = { worldWidthM: WORLD_W, worldHeightM: WORLD_H, seed: SEED };
      const a = createDerivedTorusNoise(base, 'test');
      const b = createDerivedTorusNoise(base, 'test');
      const freq = 1.0 / 1_000_000;

      for (let i = 0; i < 50; i++) {
        expect(a.sample(i * 800_000, 0, freq)).toBe(b.sample(i * 800_000, 0, freq));
      }
    });
  });
});
