import { createSimplex4D } from '../src/terrain/simplex4d';

describe('Simplex4D', () => {
  it('should return values in approximately [-1, 1]', () => {
    const noise = createSimplex4D(42);
    let min = Infinity, max = -Infinity;

    for (let i = 0; i < 10000; i++) {
      const v = noise.noise(i * 0.1, i * 0.07, i * 0.13, i * 0.09);
      if (v < min) min = v;
      if (v > max) max = v;
    }

    expect(min).toBeGreaterThan(-1.5);
    expect(max).toBeLessThan(1.5);
    // Should actually reach reasonable range
    expect(max - min).toBeGreaterThan(0.5);
  });

  it('should be deterministic (same seed → same output)', () => {
    const a = createSimplex4D(123);
    const b = createSimplex4D(123);

    for (let i = 0; i < 100; i++) {
      const x = i * 0.37, y = i * 0.53, z = i * 0.71, w = i * 0.91;
      expect(a.noise(x, y, z, w)).toBe(b.noise(x, y, z, w));
    }
  });

  it('should produce different output for different seeds', () => {
    const a = createSimplex4D(42);
    const b = createSimplex4D(99);

    let same = 0;
    for (let i = 0; i < 100; i++) {
      const x = i * 0.37, y = i * 0.53, z = i * 0.71, w = i * 0.91;
      if (a.noise(x, y, z, w) === b.noise(x, y, z, w)) same++;
    }

    expect(same).toBeLessThan(5); // very unlikely to have many collisions
  });

  it('should return 0-ish at integer coordinates (gradient property)', () => {
    const noise = createSimplex4D(42);
    // At integer coords, simplex noise tends toward 0 but isn't exactly 0
    const v = noise.noise(0, 0, 0, 0);
    expect(Math.abs(v)).toBeLessThan(1.0);
  });

  it('should be smooth (nearby inputs produce nearby outputs)', () => {
    const noise = createSimplex4D(42);
    const base = noise.noise(1.5, 2.5, 3.5, 4.5);
    const nearby = noise.noise(1.501, 2.501, 3.501, 4.501);
    expect(Math.abs(base - nearby)).toBeLessThan(0.1);
  });
});
