import { describe, expect, it } from 'vitest';
import { BinarySource, encodeEphemeris, validateHeader } from './binary';
import { angularRadiusDeg, MOON_RADIUS_KM, SUN_RADIUS_KM, sunMoonDistanceKm, toAzEl } from './geometry';

const START = '2025-01-01T00:00:00Z';
const STEP = 600;
const N = 200;

function fn(tSec: number, c: number): number {
  const w = (2 * Math.PI) / (27.3 * 86400);
  return 1.5e8 * Math.cos(w * tSec + c) + c * 1000;
}

function makeRows(): Float64Array {
  const rows = new Float64Array(N * 6);
  for (let i = 0; i < N; i++) for (let c = 0; c < 6; c++) rows[i * 6 + c] = fn(i * STEP, c);
  return rows;
}

describe('BinarySource', () => {
  it('round trips rows and validates sha256', async () => {
    const rows = makeRows();
    const { header, bin } = await encodeEphemeris({ version: 1, frame: 'MOON_PA', startUtc: START, stepSeconds: STEP }, rows);
    expect(validateHeader(header)).toBeNull();
    const src = await BinarySource.create(header, bin);
    const out = new Float64Array(6);
    const t0 = Date.parse(START);
    src.sunEarth(t0 + 5 * STEP * 1000, out);
    for (let c = 0; c < 6; c++) expect(out[c]).toBeCloseTo(rows[5 * 6 + c] as number, 3);
    expect(src.coverage()).toEqual({ startMs: t0, endMs: t0 + (N - 1) * STEP * 1000 });
  });

  it('rejects tampered binary, bad header and out-of-range time', async () => {
    const { header, bin } = await encodeEphemeris({ version: 1, frame: 'F', startUtc: START, stepSeconds: STEP }, makeRows());
    const bad = new Uint8Array(bin);
    bad[10] = (bad[10] as number) ^ 1;
    await expect(BinarySource.create(header, bad)).rejects.toThrow(/sha256/);
    await expect(BinarySource.create({ ...header, count: 3 }, bin)).rejects.toThrow(/size/);
    await expect(BinarySource.create({ ...header, units: 'm' }, bin)).rejects.toThrow(/units/);
    const src = await BinarySource.create(header, bin);
    expect(() => src.sunEarth(0, new Float64Array(6))).toThrow(RangeError);
  });

  it('interpolates a smooth function with small error (including edges)', async () => {
    const { header, bin } = await encodeEphemeris({ version: 1, frame: 'F', startUtc: START, stepSeconds: STEP }, makeRows());
    const src = await BinarySource.create(header, bin);
    const t0 = Date.parse(START);
    const out = new Float64Array(6);
    let maxRel = 0;
    for (const k of [0.1, 0.5, 3.37, 77.77, N - 1.5, N - 1.05]) {
      src.sunEarth(t0 + k * STEP * 1000, out);
      for (let c = 0; c < 6; c++) {
        const exact = fn(k * STEP, c);
        maxRel = Math.max(maxRel, Math.abs(out[c]! - exact) / 1.5e8);
      }
    }
    expect(maxRel).toBeLessThan(1e-9);
  });
});

describe('geometry', () => {
  const o = new Float64Array(2);
  it('zenith vector gives elevation 90', () => {
    toAzEl(MOON_RADIUS_KM + 1000, 0, 0, 0, 0, o);
    expect(o[1]).toBeCloseTo(90, 9);
  });
  it('north, east, south, west directions at equator lon 0', () => {
    const R = MOON_RADIUS_KM;
    toAzEl(R, 0, 1e6, 0, 0, o); // north (+z)
    expect(o[0]).toBeCloseTo(0, 6);
    expect(o[1]).toBeCloseTo(0, 6);
    toAzEl(R, 1e6, 0, 0, 0, o); // east (+y)
    expect(o[0]).toBeCloseTo(90, 6);
    toAzEl(R, -1e6, 0, 0, 0, o); // west (-y)
    expect(o[0]).toBeCloseTo(270, 6);
    toAzEl(R, 0, -1e6, 0, 0, o); // south (-z)
    expect(o[0]).toBeCloseTo(180, 6);
  });
  it('azimuth always in [0, 360)', () => {
    for (let i = 0; i < 360; i += 7) {
      const a = (i * Math.PI) / 180;
      toAzEl(1e5, 1e8 * Math.sin(a), 1e8 * Math.cos(a), 10, 20, o);
      expect(o[0]).toBeGreaterThanOrEqual(0);
      expect(o[0]).toBeLessThan(360);
    }
  });
  it('angular radius and distance', () => {
    expect(angularRadiusDeg(SUN_RADIUS_KM, 1.496e8)).toBeCloseTo(0.2666, 3);
    expect(sunMoonDistanceKm(3, 4, 12)).toBe(13);
  });
});
