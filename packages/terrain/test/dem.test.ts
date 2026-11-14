import { describe, expect, it } from 'vitest';
import { computeHorizonFromDem, type DemTile } from '../src/dem';

const MPD = (1737400 * Math.PI) / 180; // metros por grado
const px = 100 / MPD; // pixel de ~100 m

function tile(fill: (x: number, y: number) => number): DemTile {
  const width = 201;
  const height = 201;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  return {
    data, width, height,
    westDeg: -px * 100, northDeg: px * 100,
    pixelDegLon: px, pixelDegLat: px,
    resolutionM: 100, source: 'sintetico',
  };
}

describe('computeHorizonFromDem', () => {
  it('flat plain gives about 0 degrees and copies tile metadata', () => {
    const p = computeHorizonFromDem(tile(() => 0), 0, 0, 0, 10);
    expect(p.elevationDeg).toHaveLength(36);
    for (const e of p.elevationDeg) expect(Math.abs(e)).toBeLessThan(0.01);
    expect(p.demResolutionM).toBe(100);
    expect(p.demSource).toBe('sintetico');
  });

  it('ridge of known height and distance gives expected elevation', () => {
    // Cresta al este, a 5 km (50 pixeles), de 500 m de alto: atan(500/5000) ~ 5.71 deg.
    const p = computeHorizonFromDem(tile((x) => (x >= 150 ? 500 : 0)), 0, 0, 0, 1);
    expect(p.elevationDeg[90]).toBeGreaterThan(5.5);
    expect(p.elevationDeg[90]).toBeLessThan(5.9);
    expect(Math.abs(p.elevationDeg[270] ?? 99)).toBeLessThan(0.05);
  });

  it('falls back to spherical horizon outside the tile', () => {
    const p = computeHorizonFromDem(tile(() => 100), 45, 90, 0, 1);
    expect(p.demSource).toMatch(/^PENDIENTE/);
    expect(p.elevationDeg).toHaveLength(360);
  });
});
