import { describe, expect, it } from 'vitest';
import type { HorizonProfile, LunarSite } from '../../contracts/src/index';
import { createTerrainService, horizonElevationAt } from '../src/service';
import { sphericalHorizon } from '../src/spherical';

const site: LunarSite = {
  id: 's', name: 's', program: 'custom', latDeg: 0, lonDeg: 0, source: 't', verified: false,
} as LunarSite;

const mk = (n: number, step: number): HorizonProfile => ({
  azimuthStepDeg: step,
  elevationDeg: Array.from({ length: n }, (_, i) => i),
  demResolutionM: 100,
  demSource: 't',
});

describe('terrain service', () => {
  it('returns a valid profile', async () => {
    const p = mk(360, 1);
    expect(await createTerrainService(async () => p).getHorizon(site)).toBe(p);
  });
  it('rejects wrong length', async () => {
    await expect(createTerrainService(async () => mk(359, 1)).getHorizon(site)).rejects.toThrow();
    await expect(createTerrainService(async () => mk(360, 0.5)).getHorizon(site)).rejects.toThrow();
  });
  it('interpolates with wrap-around', () => {
    const p = mk(360, 1);
    expect(horizonElevationAt(p, 10.5)).toBeCloseTo(10.5);
    expect(horizonElevationAt(p, 359.5)).toBeCloseTo(179.5); // (359 + 0) / 2
    expect(horizonElevationAt(p, -0.5)).toBeCloseTo(179.5);
    expect(horizonElevationAt(p, 720)).toBeCloseTo(0);
  });
});

describe('sphericalHorizon', () => {
  it('has fallback fields and 0 deg at height 0', () => {
    const p = sphericalHorizon(0);
    expect(p.elevationDeg).toHaveLength(360);
    expect(p.elevationDeg.every((e) => e === 0)).toBe(true);
    expect(p.demResolutionM).toBe(1737400);
    expect(p.demSource.startsWith('PENDIENTE: sin DEM')).toBe(true);
  });
  it('dips for a raised observer', () => {
    const e = sphericalHorizon(5).elevationDeg[0]!;
    expect(e).toBeLessThan(0);
    expect(e).toBeCloseTo(-(Math.sqrt(2 * 5 / 1737400) * 180) / Math.PI, 2);
  });
});
