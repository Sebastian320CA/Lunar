import { describe, expect, it } from 'vitest';
import { AnalyticSource } from './analytic';
import { sunDirectionMoonFixed } from './sun';

describe('sunDirectionMoonFixed', () => {
  it('returns a unit vector parallel to the source sun vector', () => {
    const source = new AnalyticSource();
    const utc = '2025-03-20T12:00:00Z';
    const d = sunDirectionMoonFixed(source, utc);
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
    const v = new Float64Array(6);
    source.sunEarth(Date.parse(utc), v);
    const n = Math.hypot(v[0]!, v[1]!, v[2]!);
    expect(d.x).toBeCloseTo(v[0]! / n, 12);
    expect(d.y).toBeCloseTo(v[1]! / n, 12);
    expect(d.z).toBeCloseTo(v[2]! / n, 12);
  });
});
