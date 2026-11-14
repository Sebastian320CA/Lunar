import { describe, expect, it } from 'vitest';
import type { LunarSite, SiteMetrics } from '@lunar/contracts';
import { addScenario, compareMetrics, sensitivity, viabilityIndex, type Scenario } from './core.js';

const m = (o: Partial<SiteMetrics> = {}): SiteMetrics => ({
  maxSunElevationDeg: 10,
  sunlitFraction: 0.5,
  longestLightHours: 100,
  longestDarkHours: 100,
  earthVisibleFraction: 0.5,
  longestCommsWindowHours: 100,
  longestCommsGapHours: 100,
  demResolutionM: 20,
  ...o,
});
const sc = (id: string, start: string): Scenario => ({ siteId: id, utcStart: start, utcEnd: '2030-02-01T00:00:00Z' });
const site: LunarSite = { id: 's', name: 'S', program: 'custom', latDeg: 10, lonDeg: 0, source: 't', verified: true };

describe('addScenario', () => {
  it('rejects a fourth scenario', () => {
    let list: Scenario[] = [];
    for (const id of ['a', 'b', 'c']) {
      const r = addScenario(list, sc(id, '2030-01-01T00:00:00Z'));
      expect(r.ok).toBe(true);
      if (r.ok) list = r.value;
    }
    const r = addScenario(list, sc('d', '2030-01-01T00:00:00Z'));
    expect(r.ok).toBe(false);
    expect(list).toHaveLength(3);
  });
});

describe('compareMetrics', () => {
  it('keeps input order side by side and sorts sequentially by start', async () => {
    const list = [sc('b', '2030-03-01T00:00:00Z'), sc('a', '2030-01-01T00:00:00Z')];
    const res = await compareMetrics(list, async (s) => m({ maxSunElevationDeg: s.siteId === 'a' ? 1 : 2 }));
    expect(res.sideBySide.map((r) => r.scenario.siteId)).toEqual(['b', 'a']);
    expect(res.sequential.map((r) => r.scenario.siteId)).toEqual(['a', 'b']);
    expect(res.sequential[0]!.metrics.maxSunElevationDeg).toBe(1);
  });
});

describe('viabilityIndex', () => {
  const sunny = m({ sunlitFraction: 0.9, earthVisibleFraction: 0.1 });
  const comms = m({ sunlitFraction: 0.1, earthVisibleFraction: 0.9 });
  it('weights change the ranking', () => {
    const light = { sunlit: 10, earthVisible: 0, longestLight: 0, commsWindow: 0, commsGap: 0, longestDark: 0 };
    const link = { ...light, sunlit: 0, earthVisible: 10 };
    expect(viabilityIndex(sunny, light).score).toBeGreaterThan(viabilityIndex(comms, light).score);
    expect(viabilityIndex(sunny, link).score).toBeLessThan(viabilityIndex(comms, link).score);
  });
  it('stays within 0..100 and exposes the breakdown', () => {
    const r = viabilityIndex(m());
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.breakdown.reduce((s, b) => s + b.contribution, 0)).toBeCloseTo(r.score);
  });
  it('returns 0 when all weights are 0', () => {
    const z = { sunlit: 0, earthVisible: 0, longestLight: 0, commsWindow: 0, commsGap: 0, longestDark: 0 };
    expect(viabilityIndex(m(), z).score).toBe(0);
  });
});

describe('sensitivity', () => {
  it('returns base, then km shifts, then day shifts in input order', async () => {
    const calls: string[] = [];
    const out = await sensitivity(
      site,
      [5, -5],
      [1, 2],
      async (s, a) => {
        calls.push(`${s.latDeg.toFixed(3)}|${a}`);
        return m();
      },
      { utcStart: '2030-01-01T00:00:00Z', utcEnd: '2030-01-10T00:00:00Z' },
    );
    expect(out.map((e) => [e.kind, e.shift])).toEqual([['base', 0], ['km', 5], ['km', -5], ['days', 1], ['days', 2]]);
    expect(out[1]!.site.latDeg).toBeGreaterThan(site.latDeg);
    expect(out[2]!.site.latDeg).toBeLessThan(site.latDeg);
    expect(out[3]!.utcStart).toBe('2030-01-02T00:00:00.000Z');
    expect(calls).toHaveLength(5);
  });
});
