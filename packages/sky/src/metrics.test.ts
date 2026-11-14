import { describe, expect, it } from 'vitest';
import type { EphemerisService, LunarSite, SkyState, TerrainService } from '@lunar/contracts';
import { computeSiteMetrics, uncertaintyText } from './metrics.js';

const site: LunarSite = { id: 't', name: 'T', program: 'custom', latDeg: 0, lonDeg: 0, source: 'test', verified: false };

function st(sunUp: boolean, comms: boolean, sunEl = sunUp ? 10 : -10): SkyState {
  return {
    utc: '2025-01-01T00:00:00Z',
    sun: { azimuthDeg: 0, elevationDeg: sunEl, aboveTerrainHorizon: sunUp },
    earth: { azimuthDeg: 0, elevationDeg: comms ? 5 : -5, aboveTerrainHorizon: comms },
    directCommsAvailable: comms,
  };
}

function deps(series: SkyState[], res = 20) {
  const ephemeris = { getSeries: async () => series } as unknown as EphemerisService;
  const terrain: TerrainService = {
    getHorizon: async () => ({ azimuthStepDeg: 1, elevationDeg: [], demResolutionM: res, demSource: 'mock' }),
  };
  return { ephemeris, terrain };
}

const S = '2025-01-01T00:00:00Z';
const E = '2025-01-02T00:00:00Z';

describe('computeSiteMetrics', () => {
  it('keeps values in range for a mixed series and finds the longest comms gap', async () => {
    const series = [st(true, true, 40), st(true, false), st(false, false), st(false, false), st(false, false), st(true, true)];
    const m = await computeSiteMetrics(deps(series), site, S, E, 30);
    expect(m.maxSunElevationDeg).toBe(40);
    expect(m.sunlitFraction).toBeCloseTo(3 / 6);
    expect(m.earthVisibleFraction).toBeCloseTo(2 / 6);
    expect(m.longestLightHours).toBe(1);
    expect(m.longestDarkHours).toBe(1.5);
    expect(m.longestCommsWindowHours).toBe(0.5);
    expect(m.longestCommsGapHours).toBe(2);
    expect(m.demResolutionM).toBe(20);
    for (const f of [m.sunlitFraction, m.earthVisibleFraction]) expect(f >= 0 && f <= 1).toBe(true);
  });

  it('handles an always-lit series', async () => {
    const m = await computeSiteMetrics(deps([st(true, true), st(true, true)]), site, S, E, 60);
    expect(m.sunlitFraction).toBe(1);
    expect(m.longestLightHours).toBe(2);
    expect(m.longestDarkHours).toBe(0);
    expect(m.longestCommsGapHours).toBe(0);
  });

  it('handles an always-dark series', async () => {
    const m = await computeSiteMetrics(deps([st(false, false), st(false, false)]), site, S, E, 60);
    expect(m.sunlitFraction).toBe(0);
    expect(m.longestLightHours).toBe(0);
    expect(m.longestDarkHours).toBe(2);
    expect(m.earthVisibleFraction).toBe(0);
    expect(m.longestCommsGapHours).toBe(2);
  });

  it('returns zeros for an empty series', async () => {
    const m = await computeSiteMetrics(deps([]), site, S, E, 60);
    expect(m.sunlitFraction).toBe(0);
    expect(m.longestDarkHours).toBe(0);
  });

  it('rejects invalid intervals and steps', async () => {
    await expect(computeSiteMetrics(deps([]), site, 'nope', E, 60)).rejects.toThrow(/startUtc/);
    await expect(computeSiteMetrics(deps([]), site, S, 'nope', 60)).rejects.toThrow(/endUtc/);
    await expect(computeSiteMetrics(deps([]), site, E, S, 60)).rejects.toThrow(/endUtc/);
    await expect(computeSiteMetrics(deps([]), site, S, E, 0)).rejects.toThrow(/stepMin/);
  });
});

describe('uncertaintyText', () => {
  it('mentions the resolution in es and en', () => {
    expect(uncertaintyText(20, 'es')).toContain('20 m');
    expect(uncertaintyText(20, 'en')).toContain('20 m');
    expect(uncertaintyText(20, 'es')).not.toBe(uncertaintyText(20, 'en'));
  });
  it('handles unknown resolution', () => {
    expect(uncertaintyText(0, 'en')).toContain('unknown');
  });
});
