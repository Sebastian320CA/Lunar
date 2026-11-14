import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ANALYTIC_NOTE, AnalyticSource, moonEclipticOfDate } from './analytic';
import { BinarySource } from './binary';

const DEG = 180 / Math.PI;

function angleDeg(a: Float64Array, ao: number, b: Float64Array, bo: number): number {
  const dot = (a[ao] as number) * (b[bo] as number) + (a[ao + 1] as number) * (b[bo + 1] as number) + (a[ao + 2] as number) * (b[bo + 2] as number);
  const na = Math.hypot(a[ao] as number, a[ao + 1] as number, a[ao + 2] as number);
  const nb = Math.hypot(b[bo] as number, b[bo + 1] as number, b[bo + 2] as number);
  return Math.acos(Math.min(1, Math.max(-1, dot / (na * nb)))) * DEG;
}

describe('AnalyticSource (Meeus, approximate)', () => {
  it('labels itself as approximate', () => {
    expect(ANALYTIC_NOTE).toMatch(/^APROXIMADO/);
    expect(new AnalyticSource().note).toBe(ANALYTIC_NOTE);
  });

  it('matches Meeus ex. 47.a within the truncated-series tolerance', () => {
    // Meeus, Astronomical Algorithms 2a ed., ej. 47.a: 1992-04-12 0h TD (JDE 2448724.5).
    // Serie completa: lambda = 133.162655 deg, beta = -3.229126 deg, Delta = 368409.7 km (antes de nutacion).
    const out = new Float64Array(4);
    moonEclipticOfDate(2448724.5, out);
    expect(Math.abs((out[0] as number) - 133.162655)).toBeLessThan(0.02);
    expect(Math.abs((out[1] as number) + 3.229126)).toBeLessThan(0.01);
    expect(Math.abs((out[2] as number) - 368409.7)).toBeLessThan(100);
  });

  it('throws outside coverage', () => {
    expect(() => new AnalyticSource().sunEarth(Date.UTC(1800, 0, 1), new Float64Array(6))).toThrow(RangeError);
  });

  it('agrees with the binary ME ephemeris within 0.5 deg in Sun and Earth direction', async () => {
    // Rutas relativas al paquete (vitest corre con cwd = packages/ephemeris).
    let header: unknown;
    let bin: Uint8Array;
    try {
      header = JSON.parse(readFileSync('../../data/ephemeris/ephemeris.json', 'utf8'));
      bin = new Uint8Array(readFileSync('../../data/ephemeris/ephemeris.bin'));
    } catch {
      return; // datos no generados en este entorno
    }
    expect((header as { frame: string }).frame).toBe('MOON_ME_DE440_ME421');
    const ref = await BinarySource.create(header, bin);
    const ana = new AnalyticSource();
    const a = new Float64Array(6);
    const b = new Float64Array(6);
    const times = ['2025-03-14T06:00:00Z', '2026-07-04T18:30:00Z', '2027-11-21T00:00:00Z', '2028-12-31T12:00:00Z', '2029-05-09T09:15:00Z'];
    for (const t of times) {
      const ms = Date.parse(t);
      ref.sunEarth(ms, a);
      ana.sunEarth(ms, b);
      expect(angleDeg(a, 0, b, 0)).toBeLessThan(0.5);
      expect(angleDeg(a, 3, b, 3)).toBeLessThan(0.5);
    }
  });
});
