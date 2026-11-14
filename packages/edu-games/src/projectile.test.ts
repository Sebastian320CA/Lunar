import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { GRAVITY_EARTH, GRAVITY_MOON, flightTime, maxHeight, positionAt, range } from './physics';
import { loadBestScore, scoreShot } from './projectile';

describe('physics', () => {
  it('matches closed-form values for 40 m/s at 30 degrees on the Moon', () => {
    expect(flightTime(40, 30, GRAVITY_MOON)).toBeCloseTo(40 / 1.62, 9);
    expect(range(40, 30, GRAVITY_MOON)).toBeCloseTo((1600 * Math.sin(Math.PI / 3)) / 1.62, 9);
    expect(maxHeight(40, 30, GRAVITY_MOON)).toBeCloseTo(400 / (2 * 1.62), 9);
  });

  it('lands at the computed range at the computed time', () => {
    const p = positionAt(30, 40, GRAVITY_MOON, flightTime(30, 40, GRAVITY_MOON));
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.x).toBeCloseTo(range(30, 40, GRAVITY_MOON), 9);
  });

  it('Moon range is g_earth/g_moon (about 6x) the Earth range for any launch', () => {
    fc.assert(
      fc.property(fc.double({ min: 1, max: 200, noNaN: true }), fc.double({ min: 1, max: 89, noNaN: true }), (v, a) => {
        const ratio = range(v, a, GRAVITY_MOON) / range(v, a, GRAVITY_EARTH);
        expect(ratio).toBeCloseTo(GRAVITY_EARTH / GRAVITY_MOON, 6);
        expect(ratio).toBeGreaterThan(6);
        expect(ratio).toBeLessThan(6.1);
      }),
    );
  });
});

describe('scoring and storage', () => {
  it('scores a hit as 100 and a miss by distance', () => {
    expect(scoreShot(205, 200, 8).score).toBe(100);
    expect(scoreShot(250, 200, 8)).toMatchObject({ targetHit: false, score: 50 });
    expect(scoreShot(900, 200, 8).score).toBe(0);
  });

  it('returns 0 when localStorage is unavailable', () => {
    expect(loadBestScore()).toBe(0);
  });
});
