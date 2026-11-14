import { describe, expect, it } from 'vitest';
import type { EnergyInput, SkyState } from '@lunar/contracts';
import fc from 'fast-check';
import { createBattery } from './battery';
import { cumulativeEnergyWh, computeSeries, totalEnergyWh } from './series';
import { horizontal } from './methods';

function sky(el: number): SkyState {
  return {
    utc: '2030-01-01T00:00:00Z',
    sun: { azimuthDeg: 0, elevationDeg: el, aboveTerrainHorizon: el > 0 },
    earth: { azimuthDeg: 0, elevationDeg: 0, aboveTerrainHorizon: false },
    directCommsAvailable: false,
  };
}

describe('series', () => {
  it('energy equals power x time for constant input', () => {
    const inputs: EnergyInput[] = Array.from({ length: 10 }, () => ({ sky: sky(90), params: {}, stepSeconds: 1800 }));
    const res = computeSeries(horizontal, inputs);
    const p = res[0]!.powerW;
    expect(p).toBeGreaterThan(0);
    expect(totalEnergyWh(res)).toBeCloseTo(p * 5, 6);
    const cum = cumulativeEnergyWh(res);
    expect(cum[9]).toBeCloseTo(p * 5, 6);
    expect(cum[0]).toBeCloseTo(p * 0.5, 6);
  });
});

describe('battery', () => {
  it('endures a night proportional to capacity / load', () => {
    const b = createBattery({ capacityWh: 100, loadW: 10, efficiency: 1 });
    const r = b.simulate([50, 50, 0, 0, 0, 0], 3600);
    expect(r.nightEnduredHours).toBeCloseTo(4, 9);
    expect(r.depleted).toBe(false);
    const r2 = createBattery({ capacityWh: 20, loadW: 10, efficiency: 1 }).simulate([0, 0, 0, 0], 3600);
    expect(r2.nightEnduredHours).toBeCloseTo(2, 9);
    expect(r2.depleted).toBe(true);
    expect(r2.unmetWh).toBeCloseTo(20, 9);
  });

  it('soc stays within [0, capacity] for any input', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1e4, noNaN: true }),
        fc.double({ min: 0, max: 1e3, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.array(fc.double({ min: 0, max: 1e4, noNaN: true }), { maxLength: 50 }),
        (cap, load, eff, series) => {
          const r = createBattery({ capacityWh: cap, loadW: load, efficiency: eff }).simulate(series, 600);
          return r.socWh.every((s) => s >= 0 && s <= cap + 1e-9);
        },
      ),
    );
  });
});
