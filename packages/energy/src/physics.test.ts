import { describe, expect, it } from 'vitest';
import type { SkyState } from '@lunar/contracts';
import { AU_KM, incidenceCos, irradianceWm2 } from './physics';
import { methods, dualAxis, horizontal, mast } from './methods';

function sky(az: number, el: number, above: boolean): SkyState {
  return {
    utc: '2030-01-01T00:00:00Z',
    sun: { azimuthDeg: az, elevationDeg: el, aboveTerrainHorizon: above },
    earth: { azimuthDeg: 0, elevationDeg: 0, aboveTerrainHorizon: false },
    directCommsAvailable: false,
  };
}

describe('physics', () => {
  it('irradiance is 1361 at 1 AU and follows inverse square', () => {
    expect(irradianceWm2(AU_KM)).toBeCloseTo(1361, 6);
    expect(irradianceWm2(AU_KM * 2)).toBeCloseTo(1361 / 4, 6);
  });

  it('cos incidence at known angles', () => {
    expect(incidenceCos(0, 90, 0, 0)).toBeCloseTo(1, 9);
    expect(incidenceCos(0, 30, 0, 0)).toBeCloseTo(0.5, 9);
    expect(incidenceCos(180, 0, 90, 180)).toBeCloseTo(1, 9);
    expect(incidenceCos(0, 0, 90, 180)).toBe(0);
    expect(incidenceCos(90, 45, 45, 90)).toBeCloseTo(1, 9);
  });
});

describe('methods', () => {
  it('power is zero below the terrain horizon for every method except the constant source', () => {
    for (const m of methods) {
      const r = m.compute(sky(120, 10, false), {});
      if (m.id === 'constantSource') expect(r.powerW).toBeGreaterThan(0);
      else expect(r.powerW).toBe(0);
    }
  });

  it('dual axis >= horizontal for the same sky', () => {
    for (const el of [1, 10, 45, 80]) {
      const s = sky(200, el, true);
      expect(dualAxis.compute(s, {}).powerW).toBeGreaterThanOrEqual(horizontal.compute(s, {}).powerW);
    }
  });

  it('horizontal power = area x efficiency x irradiance x sin(elevation)', () => {
    const p = horizontal.compute(sky(0, 30, true), { areaM2: 2, efficiency: 0.5 }).powerW;
    expect(p).toBeCloseTo(2 * 0.5 * 1361 * 0.5, 6);
  });

  it('mast sees the Sun above its own horizon even if the terrain flag is false', () => {
    const s = sky(0, 5, false);
    expect(mast.compute(s, { mastHorizonElevDeg: 2 }).powerW).toBeGreaterThan(0);
    expect(mast.compute(s, { mastHorizonElevDeg: 8 }).powerW).toBe(0);
  });
});
