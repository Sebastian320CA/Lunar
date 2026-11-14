import { describe, expect, it } from 'vitest';
import type { HorizonProfile, SkyEvent, SkyState } from '@lunar/contracts';
import { renderSkyDiagram } from './diagram.js';
import { createCountdown, nextSetEvent } from './countdown.js';

const horizon: HorizonProfile = {
  azimuthStepDeg: 1,
  elevationDeg: Array.from({ length: 360 }, (_, i) => (i % 40 === 0 ? 3 : 0)),
  demResolutionM: 20,
  demSource: 'test',
};
const sky: SkyState = {
  utc: '2030-01-01T00:00:00Z',
  sun: { azimuthDeg: 100, elevationDeg: 20, aboveTerrainHorizon: true },
  earth: { azimuthDeg: 250, elevationDeg: 5, aboveTerrainHorizon: true },
  directCommsAvailable: true,
};

describe('renderSkyDiagram', () => {
  it('contains Sun, Earth, terrain and four cardinals', () => {
    const svg = renderSkyDiagram({ horizon, sky, size: 400 });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('data-body="sun"');
    expect(svg).toContain('data-body="earth"');
    expect(svg).toContain('data-role="terrain"');
    for (const c of ['N', 'E', 'S', 'W']) expect(svg).toContain(`data-cardinal="${c}"`);
  });
  it('tolerates invalid size and non-finite values', () => {
    const svg = renderSkyDiagram({ horizon, sky: { ...sky, sun: { ...sky.sun, azimuthDeg: NaN } }, size: -1 });
    expect(svg).not.toContain('NaN');
  });
});

describe('countdown', () => {
  const events: SkyEvent[] = [
    { type: 'sunrise', utc: '2030-01-01T01:00:00Z' },
    { type: 'earthset', utc: '2030-01-01T05:00:00Z' },
    { type: 'sunset', utc: '2030-01-01T03:00:00Z' },
    { type: 'sunset', utc: '2029-12-31T20:00:00Z' },
  ];
  it('picks the next sunset or earthset', () => {
    expect(nextSetEvent(events, '2030-01-01T00:00:00Z')?.type).toBe('sunset');
    expect(nextSetEvent(events, '2030-01-01T04:00:00Z')?.type).toBe('earthset');
    expect(nextSetEvent(events, '2030-01-02T00:00:00Z')).toBeNull();
  });
  it('updates textContent on time change and stops on unsubscribe', () => {
    const el = { textContent: '' as string | null };
    let cb: ((u: string) => void) | null = null;
    const time = {
      getUtc: () => '2030-01-01T00:00:00Z',
      onChange: (f: (u: string) => void) => {
        cb = f;
        return () => {
          cb = null;
        };
      },
    };
    const off = createCountdown(el, () => events, time);
    expect(el.textContent).toContain('Sunset in 3h 00m 00s');
    cb!('2030-01-01T04:00:00Z');
    expect(el.textContent).toContain('Earthset in 1h');
    off();
    expect(cb).toBeNull();
  });
});
