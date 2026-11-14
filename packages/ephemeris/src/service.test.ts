import { describe, expect, it } from 'vitest';
import type { LunarSite, TerrainService } from '@lunar/contracts';
import { AnalyticSource } from './analytic.js';
import { SUN_RADIUS_KM } from './geometry.js';
import { createEphemerisService, getEphemerisMeta } from './service.js';
import type { VectorSource } from './source.js';

const T0 = Date.UTC(2025, 0, 1);
const PERIOD_MIN = 29.5 * 1440;
const OMEGA = 360 / PERIOD_MIN; // grados por minuto
const THETA0 = -100; // grados en T0
const SUN_D = 1.496e8;
const EARTH_D = 384400;
const SUN_LIMB = (Math.asin(SUN_RADIUS_KM / SUN_D) * 180) / Math.PI;

/** Sol en circulo sobre el ecuador lunar; Tierra fija en el cenit de (0, 0). */
const synthetic: VectorSource = {
  sunEarth(utcMs, out) {
    const th = ((THETA0 + OMEGA * ((utcMs - T0) / 60000)) * Math.PI) / 180;
    out[0] = SUN_D * Math.cos(th);
    out[1] = SUN_D * Math.sin(th);
    out[2] = 0;
    out[3] = EARTH_D;
    out[4] = 0;
    out[5] = 0;
  },
  coverage: () => ({ startMs: T0 - 1e11, endMs: T0 + 1e11 }),
};

const site: LunarSite = {
  id: 'eq0', name: 'eq0', program: 'custom', latDeg: 0, lonDeg: 0, source: 'test', verified: false,
};

describe('createEphemerisService', () => {
  it('finds sunrise and sunset for a known circular motion, ascending', async () => {
    const svc = createEphemerisService(synthetic);
    const ev = await svc.findEvents(site, '2025-01-01T00:00:00Z', '2025-01-21T00:00:00Z');
    expect(ev.map((e) => e.type)).toEqual(['sunrise', 'sunset']);
    const rise = T0 + ((-(90 + SUN_LIMB) - THETA0) / OMEGA) * 60000;
    const set = T0 + (((90 + SUN_LIMB) - THETA0) / OMEGA) * 60000;
    expect(Math.abs(Date.parse(ev[0]!.utc) - rise)).toBeLessThan(120000);
    expect(Math.abs(Date.parse(ev[1]!.utc) - set)).toBeLessThan(120000);
  });

  it('returns [] when nothing happens and excludes endUtc', async () => {
    const svc = createEphemerisService(synthetic);
    expect(await svc.findEvents(site, '2025-01-01T00:00:00Z', '2025-01-01T06:00:00Z')).toEqual([]);
    const all = await svc.findEvents(site, '2025-01-01T00:00:00Z', '2025-01-21T00:00:00Z');
    const first = all[0]!.utc;
    const cut = await svc.findEvents(site, '2025-01-01T00:00:00Z', first);
    expect(cut).toEqual([]);
    const incl = await svc.findEvents(site, first, '2025-01-21T00:00:00Z');
    expect(incl[0]!.utc).toBe(first);
  });

  it('rejects invalid input naming the parameter', async () => {
    const svc = createEphemerisService(synthetic);
    await expect(svc.findEvents(site, 'nope', '2025-01-02T00:00:00Z')).rejects.toThrow(/startUtc/);
    await expect(svc.findEvents(site, '2025-01-02T00:00:00Z', '2025-02-30T00:00:00Z')).rejects.toThrow(/endUtc/);
    await expect(svc.findEvents(site, '2025-01-02T00:00:00Z', '2025-01-01T00:00:00Z')).rejects.toThrow(/endUtc/);
  });

  it('getSky uses upper limb, the injected horizon and sets comms from the Earth', async () => {
    // Sol a -90.1 grados: centro bajo el horizonte, borde superior sobre el.
    const at = new Date(T0 + (((-90.1) - THETA0) / OMEGA) * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
    const flat = await createEphemerisService(synthetic).getSky(site, at);
    expect(flat.sun.elevationDeg).toBeLessThan(0);
    expect(flat.sun.aboveTerrainHorizon).toBe(true);
    expect(flat.directCommsAvailable).toBe(true);
    const high = await createEphemerisService(synthetic, () => 95).getSky(site, at);
    expect(high.sun.aboveTerrainHorizon).toBe(false);
    expect(high.directCommsAvailable).toBe(false);
  });

  it('accepts an injected TerrainService', async () => {
    const terrain: TerrainService = {
      getHorizon: async () => ({
        azimuthStepDeg: 1, elevationDeg: new Array<number>(360).fill(95), demResolutionM: 1, demSource: 't',
      }),
    };
    const sky = await createEphemerisService(synthetic, terrain).getSky(site, '2025-01-01T00:00:00Z');
    expect(sky.earth.aboveTerrainHorizon).toBe(false);
  });

  it('getSeries returns inclusive steps and validates stepMin', async () => {
    const svc = createEphemerisService(synthetic);
    const s = await svc.getSeries(site, '2025-01-01T00:00:00Z', '2025-01-01T01:00:00Z', 30);
    expect(s.map((x) => x.utc)).toEqual(['2025-01-01T00:00:00Z', '2025-01-01T00:30:00Z', '2025-01-01T01:00:00Z']);
    await expect(svc.getSeries(site, '2025-01-01T00:00:00Z', '2025-01-01T01:00:00Z', 0)).rejects.toThrow(/stepMin/);
  });

  it('getEphemerisMeta flags the analytic source as approximate', () => {
    const m = getEphemerisMeta(new AnalyticSource());
    expect(m.source).toBe('analytic');
    expect(m.approximate).toBe(true);
    expect(m.note).toMatch(/APROXIMADO/);
  });
});
