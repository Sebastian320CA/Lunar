import { describe, expect, it } from 'vitest';
import type { BodyState, EnergyResult } from '@lunar/contracts';
import {
  compassHeadingDeg,
  computeOrientation,
  directionFromAzEl,
  elevationIndicatorDeg,
  normalizeAzimuthDeg,
  panelNormal,
} from './orientation';

const sun = (azimuthDeg: number, elevationDeg: number): BodyState => ({
  azimuthDeg,
  elevationDeg,
  aboveTerrainHorizon: true,
});
const res = (panelTiltDeg: number, panelAzimuthDeg: number): EnergyResult => ({
  methodId: 'x',
  panelTiltDeg,
  panelAzimuthDeg,
  powerW: 0,
  energyWh: 0,
});

describe('panelNormal', () => {
  it('tilt 0 is straight up', () => {
    const n = panelNormal(0, 123);
    expect(n.y).toBeCloseTo(1);
    expect(n.x).toBeCloseTo(0);
    expect(n.z).toBeCloseTo(0);
  });
  it('tilt 90 leans toward the azimuth', () => {
    const north = panelNormal(90, 0);
    expect(north.z).toBeCloseTo(-1);
    expect(north.y).toBeCloseTo(0);
    const east = panelNormal(90, 90);
    expect(east.x).toBeCloseTo(1);
    const south = panelNormal(45, 180);
    expect(south.z).toBeCloseTo(Math.SQRT1_2);
    expect(south.y).toBeCloseTo(Math.SQRT1_2);
  });
});

describe('computeOrientation', () => {
  it('ray points to the Sun', () => {
    const o = computeOrientation(res(0, 0), sun(90, 30));
    expect(o.rayDirection.x).toBeCloseTo(Math.cos(Math.PI / 6));
    expect(o.rayDirection.y).toBeCloseTo(0.5);
    expect(o.rayDirection.z).toBeCloseTo(0);
    const d = directionFromAzEl(0, 90);
    expect(d.y).toBeCloseTo(1);
  });
  it('incidence is 0 when the panel faces the Sun', () => {
    const o = computeOrientation(res(60, 270), sun(270, 30));
    expect(o.incidenceDeg).toBeCloseTo(0, 5);
  });
  it('unit vectors', () => {
    const o = computeOrientation(res(-20, 45), sun(200, -5));
    const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
    expect(len(o.normal)).toBeCloseTo(1);
    expect(len(o.rayDirection)).toBeCloseTo(1);
  });
});

describe('indicators', () => {
  it('clamps elevation and normalizes heading', () => {
    expect(elevationIndicatorDeg(sun(0, 95))).toBe(90);
    expect(elevationIndicatorDeg(sun(0, Number.NaN))).toBe(0);
    expect(compassHeadingDeg(sun(-90, 0))).toBe(270);
    expect(normalizeAzimuthDeg(360)).toBe(0);
  });
});
