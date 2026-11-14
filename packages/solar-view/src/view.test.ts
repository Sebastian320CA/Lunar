import { describe, expect, it, vi } from 'vitest';
import type { BodyState, EnergyResult } from '@lunar/contracts';
import { createSolarPanelView, type SolarViewRenderer } from './view';

const result: EnergyResult = { methodId: 'fixed', panelTiltDeg: 30, panelAzimuthDeg: 180, powerW: 1, energyWh: 1 };
const sun: BodyState = { azimuthDeg: 90, elevationDeg: 20, aboveTerrainHorizon: true };

function makeRenderer(): SolarViewRenderer & { disposed: number } {
  const dom = { parentNode: null as { removeChild(n: unknown): void } | null };
  const r = {
    disposed: 0,
    domElement: dom as unknown as HTMLElement,
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose() {
      r.disposed++;
    },
  };
  return r;
}

function fakeContainer(): HTMLElement {
  return {
    clientWidth: 400,
    clientHeight: 300,
    appendChild(n: { parentNode: unknown }) {
      n.parentNode = { removeChild: () => undefined };
    },
  } as unknown as HTMLElement;
}

describe('createSolarPanelView', () => {
  it('mounts, updates and renders with a mocked renderer', () => {
    const r = makeRenderer();
    const view = createSolarPanelView({ createRenderer: () => r });
    view.mount(fakeContainer());
    view.update(result, sun);
    expect(r.render).toHaveBeenCalled();
    view.dispose();
  });

  it('dispose is idempotent and update after dispose does not throw', () => {
    const r = makeRenderer();
    const view = createSolarPanelView({ createRenderer: () => r });
    view.mount(fakeContainer());
    view.dispose();
    expect(() => view.dispose()).not.toThrow();
    const calls = (r.render as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(() => view.update(result, sun)).not.toThrow();
    expect((r.render as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calls);
    expect(r.disposed).toBe(1);
  });
});
