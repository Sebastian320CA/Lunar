import { describe, expect, it } from 'vitest';
import sitesJson from '../../../data/sites/sites.json';
import { APOLLO_SITE_IDS } from '@lunar/contracts';
import { loadSites, parseSites } from './catalog';

const valid = {
  id: 'clps-x',
  name: 'Test',
  program: 'clps',
  latDeg: -80,
  lonDeg: 1.5,
  source: 'src',
  verified: false,
};

describe('parseSites', () => {
  it('parses the real sites.json with canonical longitudes and all Apollo ids', () => {
    const r = parseSites(sitesJson);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const s of r.value) {
      expect(s.lonDeg).toBeGreaterThan(-180);
      expect(s.lonDeg).toBeLessThanOrEqual(180);
    }
    const apollo = r.value.filter((s) => s.program === 'apollo').map((s) => s.id);
    expect(apollo.sort()).toEqual([...APOLLO_SITE_IDS].sort());
  });

  it('rejects invalid inputs', () => {
    expect(parseSites({}).ok).toBe(false);
    expect(parseSites([{ ...valid, latDeg: 91 }]).ok).toBe(false);
    expect(parseSites([{ ...valid, lonDeg: 200 }]).ok).toBe(false); // not canonical
    expect(parseSites([{ ...valid, lonDeg: -180 }]).ok).toBe(false);
    expect(parseSites([{ ...valid, program: 'apollo', id: 'apollo-13' }]).ok).toBe(false);
    expect(parseSites([{ ...valid, verified: 'yes' }]).ok).toBe(false);
    expect(parseSites([valid, valid]).ok).toBe(false);
  });

  it('accepts lon 180 and a valid entry', () => {
    const r = parseSites([{ ...valid, lonDeg: 180 }]);
    expect(r.ok).toBe(true);
  });
});

describe('loadSites', () => {
  it('reports a missing file and loads through dataUrl', async () => {
    expect((await loadSites({ dataUrl: () => undefined })).ok).toBe(false);
    const r = await loadSites(
      { dataUrl: () => '/x' },
      async () => ({ ok: true, status: 200, json: async () => [valid] }),
    );
    expect(r.ok).toBe(true);
  });
});
