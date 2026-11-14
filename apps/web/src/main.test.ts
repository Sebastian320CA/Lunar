import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ok = (id: string) => ({ default: { id, setup: vi.fn() } });

vi.mock('./modules/i18n', () => ok('i18n'));
vi.mock('./modules/ui', () => ok('ui'));
vi.mock('./modules/ephemeris', () => ({
  default: {
    id: 'ephemeris',
    setup: () => {
      throw new Error('boom');
    },
  },
}));
vi.mock('./modules/terrain', () => ok('terrain'));
vi.mock('./modules/sites', () => ok('sites'));
vi.mock('./modules/scene3d', () => ok('scene3d'));
vi.mock('./modules/sky', () => ok('sky'));
vi.mock('./modules/energy', () => ok('energy'));
vi.mock('./modules/compare', () => ok('compare'));
vi.mock('./modules/solar-view', () => ok('solarView'));
vi.mock('./modules/export', () => ok('export'));
vi.mock('./modules/edu', () => ok('edu'));
vi.mock('./modules/edu-games', () => ok('edu-games'));

describe('main bootstrap', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows an error screen for the failing module and still mounts the shell', async () => {
    await import('./main');
    await vi.waitFor(() => {
      expect(document.querySelector('#app footer')).not.toBeNull();
    });
    const slot = document.querySelector('#module-errors [data-module="ephemeris"]');
    expect(slot).not.toBeNull();
    expect(slot?.textContent).toContain('ephemeris');
    expect(document.querySelectorAll('#module-errors [data-module]').length).toBe(1);
  });
});
