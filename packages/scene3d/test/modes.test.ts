import { describe, expect, it } from 'vitest';
import { ModeMachine, OrbitState, canTransition, landingPose, type SceneMode } from '../src/modes.js';

function make(durations = {}) {
  let t = 0;
  const m = new ModeMachine(() => t, durations);
  return { m, tick: (ms: number) => (t += ms) };
}

describe('ModeMachine', () => {
  it('valid and invalid transitions', () => {
    expect(canTransition('intro', 'landing')).toBe(true);
    expect(canTransition('intro', 'site')).toBe(false);
    const { m } = make();
    expect(m.transitionTo('site').ok).toBe(false);
    expect(m.transitionTo('free').ok).toBe(true);
  });

  it('completes after the configured duration', () => {
    const { m, tick } = make({ free: 1000 });
    const events: string[] = [];
    m.onChange((e) => events.push(e.type));
    m.transitionTo('free');
    tick(500);
    const a = m.update();
    expect(a?.to).toBe('free');
    expect(a?.progress).toBeCloseTo(0.5, 5);
    expect(m.mode).toBe('intro');
    tick(500);
    expect(m.update()).toBeNull();
    expect(m.mode).toBe('free');
    expect(events).toEqual(['start', 'end']);
  });

  it('durations are configurable; zero is instant', () => {
    const { m } = make({ free: 0 });
    m.setDuration('map', 10);
    expect(m.getDuration('map')).toBe(10);
    m.transitionTo('free');
    expect(m.mode).toBe('free');
    expect(m.isTransitioning()).toBe(false);
  });

  it('cancel mid-transition keeps the origin mode', () => {
    const { m, tick } = make({ free: 1000 });
    m.transitionTo('free');
    tick(300);
    expect(m.cancel()).toBe(true);
    expect(m.mode).toBe('intro');
    expect(m.isTransitioning()).toBe(false);
    expect(m.cancel()).toBe(false);
  });

  it('a new transition replaces the one in progress, validated from origin', () => {
    const { m, tick } = make();
    m.transitionTo('free');
    tick(100);
    expect(m.transitionTo('landing').ok).toBe(true);
    tick(100000);
    m.update();
    expect(m.mode).toBe('landing');
  });

  it('dims background in site mode', () => {
    const { m, tick } = make({ free: 0, map: 0, site: 1000 });
    for (const s of ['free', 'map'] as SceneMode[]) m.transitionTo(s);
    expect(m.backgroundDim()).toBe(0);
    m.transitionTo('site');
    tick(500);
    expect(m.backgroundDim()).toBeCloseTo(0.5, 5);
    tick(500);
    expect(m.backgroundDim()).toBe(1);
  });
});

describe('camera helpers', () => {
  it('orbit clamps radius and polar angle', () => {
    const o = new OrbitState();
    o.impulse(0, 100, -1000);
    for (let i = 0; i < 60; i++) o.step(1 / 60);
    expect(o.radius).toBeGreaterThanOrEqual(o.limits.minRadius);
    expect(o.polar).toBeLessThanOrEqual(o.limits.maxPolar);
  });

  it('landing camera sits just above the surface', () => {
    const p = landingPose(10, 20);
    expect(p.position.length()).toBeGreaterThan(1);
    expect(p.position.length()).toBeLessThan(1.05);
  });
});
