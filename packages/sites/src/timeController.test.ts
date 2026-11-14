import { describe, expect, it, vi } from 'vitest';
import type { EphemerisService, LunarSite } from '@lunar/contracts';
import { createTimeController, SYNODIC_MONTH_DAYS, type TimeClock } from './timeController';

const site: LunarSite = {
  id: 'custom-1', name: 'x', program: 'custom', latDeg: 0, lonDeg: 0, source: 's', verified: false,
};

const eph = (events: { type: 'sunrise' | 'sunset' | 'earthrise' | 'earthset'; utc: string }[]) => ({
  findEvents: vi.fn(async () => events),
}) as unknown as Pick<EphemerisService, 'findEvents'>;

describe('TimeController', () => {
  it('steps by lunar days', () => {
    const tc = createTimeController('2025-01-01T00:00:00Z', eph([]));
    const r = tc.stepLunarDays(1);
    expect(r.ok).toBe(true);
    const diff = Date.parse(tc.getUtc()) - Date.parse('2025-01-01T00:00:00Z');
    expect(Math.abs(diff - SYNODIC_MONTH_DAYS * 86_400_000)).toBeLessThan(1000);
  });

  it('jumps to the next matching event', async () => {
    const tc = createTimeController('2025-01-01T00:00:00Z', eph([
      { type: 'sunset', utc: '2025-01-05T00:00:00Z' },
      { type: 'sunrise', utc: '2025-01-10T12:00:00Z' },
    ]));
    const r = await tc.jumpToNext(site, 'sunrise');
    expect(r).toEqual({ ok: true, value: '2025-01-10T12:00:00Z' });
    expect(tc.getUtc()).toBe('2025-01-10T12:00:00Z');
    expect((await tc.jumpToNext(site, 'earthrise')).ok).toBe(false);
  });

  it('unsubscribe stops notifications', () => {
    const tc = createTimeController('2025-01-01T00:00:00Z', eph([]));
    const cb = vi.fn();
    const off = tc.onChange(cb);
    tc.setUtc('2025-01-02T00:00:00Z');
    off();
    tc.setUtc('2025-01-03T00:00:00Z');
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('play advances with injected clock and pause stops it', () => {
    let now = 0;
    let tick: () => void = () => {};
    const stop = vi.fn();
    const clock: TimeClock = { now: () => now, every: (_ms, cb) => { tick = cb; return stop; } };
    const tc = createTimeController('2025-01-01T00:00:00Z', eph([]), clock);
    tc.play(3600);
    now = 1000;
    tick();
    expect(tc.getUtc()).toBe('2025-01-01T01:00:00Z');
    tc.pause();
    expect(stop).toHaveBeenCalled();
  });

  it('rejects invalid UTC', () => {
    const tc = createTimeController('2025-01-01T00:00:00Z', eph([]));
    expect(() => tc.setUtc('nope')).toThrow();
  });
});
