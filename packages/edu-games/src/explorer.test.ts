import { describe, expect, it } from 'vitest';
import type { BodyState, EphemerisService, LunarSite, SkyState } from '@lunar/contracts';
import { DEFAULT_PARAMS, createState, energyRate, stepExplorer } from './explorer';

const site: LunarSite = {
  id: 'test',
  name: 'Test site',
  program: 'custom',
  latDeg: 0,
  lonDeg: 0,
  source: 'test fixture',
  verified: false,
};

const body = (elevationDeg: number): BodyState => ({
  azimuthDeg: 0,
  elevationDeg,
  aboveTerrainHorizon: elevationDeg > 0,
});

const sky = (sunEl: number, earthEl: number): SkyState => ({
  utc: '2026-01-01T00:00:00Z',
  sun: body(sunEl),
  earth: body(earthEl),
  directCommsAvailable: earthEl > 0,
});

const mockEphemeris = (s: SkyState): EphemerisService => ({
  getSky: async () => s,
  getSeries: async () => [s],
  findEvents: async () => [],
});

describe('explorer energy', () => {
  it('increases in sunlight (mocked EphemerisService)', async () => {
    const s = await mockEphemeris(sky(30, -10)).getSky(site, 'x');
    const next = stepExplorer(createState(), s, 1, 0);
    expect(next.energy).toBeGreaterThan(createState().energy);
  });

  it('decreases in darkness', async () => {
    const s = await mockEphemeris(sky(-5, -10)).getSky(site, 'x');
    const next = stepExplorer(createState(), s, 1, 0);
    expect(next.energy).toBeLessThan(createState().energy);
  });

  it('Earth visibility adds charge', () => {
    expect(energyRate(sky(30, 10), false)).toBeGreaterThan(energyRate(sky(30, -10), false));
  });

  it('clamps energy to max, ends the game in darkness at 0, and collects samples', () => {
    expect(stepExplorer(createState(), sky(30, 10), 1000, 0).energy).toBe(DEFAULT_PARAMS.maxEnergy);
    const dead = stepExplorer({ ...createState(), energy: 0.5 }, sky(-5, -5), 10, 0);
    expect(dead.energy).toBe(0);
    expect(dead.alive).toBe(false);
    const got = stepExplorer({ ...createState(), x: 7.8, samples: [8] }, sky(30, 0), 0.01, 1);
    expect(got.samples).toEqual([]);
    expect(got.score).toBe(DEFAULT_PARAMS.samplePoints);
  });
});
