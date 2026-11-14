import type { LunarSite } from '@lunar/contracts';
import { Group, Object3D, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { FocusAnimator, focusRotation, normalizeMs, validateFocusTarget } from '../src/focus.js';
import { MarkerLayer } from '../src/markers.js';
import { latLonToVec3 } from '../src/math.js';
import { SunController } from '../src/sun.js';

const site = (id: string, latDeg: number, lonDeg: number, program: LunarSite['program'] = 'apollo'): LunarSite => ({
  id,
  name: id,
  program,
  latDeg,
  lonDeg,
  source: 't',
  verified: true,
});

function layer() {
  const camera = new PerspectiveCamera(50, 1, 0.01, 2000);
  camera.position.set(0, 0, 4);
  camera.lookAt(0, 0, 0);
  const parent = new Group();
  const l = new MarkerLayer(camera, { getSize: () => ({ width: 800, height: 800 }), parent });
  l.setSiteMarkers([site('front', 0, 0), site('back', 0, 180, 'clps'), site('east', 0, 40, 'commercial')]);
  return l;
}

describe('MarkerLayer', () => {
  it('anchor is null for unknown ids and hidden (far side) sites', () => {
    const l = layer();
    expect(l.getSiteScreenAnchor('nope')).toBeNull();
    expect(l.getSiteScreenAnchor('back')).toBeNull();
  });

  it('anchor of the facing site is the screen center', () => {
    const a = layer().getSiteScreenAnchor('front');
    expect(a).not.toBeNull();
    expect(a?.xPx).toBeCloseTo(400, 0);
    expect(a?.yPx).toBeCloseTo(400, 0);
  });

  it('assigns distinct colors per program', () => {
    const l = layer();
    const colors = new Set(['front', 'back', 'east'].map((i) => l.colorOf(i)));
    expect(colors.size).toBe(3);
  });

  it('picks by pointer, notifies, and unsubscribe stops callbacks', () => {
    const l = layer();
    const got: string[] = [];
    const off = l.onSiteSelected((id) => got.push(id));
    expect(l.pickAt(400, 400)).toBe('front');
    expect(l.pickAt(5, 5)).toBeNull();
    off();
    l.pickAt(400, 400);
    expect(got).toEqual(['front']);
  });

  it('keyboard moves focus and activates', () => {
    const l = layer();
    const got: string[] = [];
    l.onSiteSelected((id) => got.push(id));
    expect(l.handleKey('ArrowRight')).toBe(true);
    l.handleKey('ArrowRight');
    l.handleKey('Enter');
    expect(got).toEqual(['back']);
  });
});

describe('focus', () => {
  it('maps lat/lon to the camera-facing axis', () => {
    for (const [lat, lon] of [[0, 0], [30, 90], [-45, -120], [89, 180]] as const) {
      const v = latLonToVec3(lat, lon, 1).applyQuaternion(focusRotation(lat, lon));
      expect(v.distanceTo(new Vector3(0, 0, 1))).toBeLessThan(1e-9);
    }
  });

  it('validates canonical lon and defaults ms to 1000', () => {
    expect(validateFocusTarget(0, 180).ok).toBe(true);
    expect(validateFocusTarget(0, -180).ok).toBe(false);
    expect(validateFocusTarget(91, 0).ok).toBe(false);
    expect(normalizeMs(undefined)).toBe(1000);
    expect(normalizeMs(0)).toBe(0);
  });

  it('animates with the injected clock and ignores invalid targets', () => {
    let t = 0;
    const a = new FocusAnimator(() => t);
    const o = new Object3D();
    expect(a.focus(o, 0, 200)).toBe(false);
    expect(a.focus(o, 0, 90)).toBe(true);
    t = 500;
    a.update();
    expect(a.isAnimating()).toBe(true);
    t = 1000;
    a.update();
    expect(a.isAnimating()).toBe(false);
    expect(latLonToVec3(0, 90, 1).applyQuaternion(o.quaternion).z).toBeCloseTo(1, 9);
  });
});

describe('SunController', () => {
  it('applies provider output for the simulation time', () => {
    const seen: number[] = [];
    const s = new SunController((d) => seen.push(d.x));
    s.setSimulationTime('2025-01-01T00:00:00Z');
    s.setSunDirectionProvider((utc) => ({ x: utc.startsWith('2025') ? 1 : 0, y: 0, z: 0 }));
    s.setSimulationTime('2026-01-01T00:00:00Z'); // zero vector ignored
    expect(seen).toEqual([1]);
  });
});
