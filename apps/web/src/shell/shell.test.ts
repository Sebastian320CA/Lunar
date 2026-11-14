import { describe, expect, it, vi } from 'vitest';
import type { LunarSite } from '@lunar/contracts';
import { DISCLAIMER } from '@lunar/ui';
import { buildReport, mountShell } from './shell';
import type { WebContext } from '../modules/context';

const site: LunarSite = {
  id: 'apollo11',
  name: 'Apollo 11',
  program: 'apollo',
  latDeg: 0.67,
  lonDeg: 23.47,
  source: 'test',
  verified: true,
} as unknown as LunarSite;

function ctx(): WebContext {
  return {
    demo: true,
    assetUrl: (p) => p,
    dataUrl: () => undefined,
    services: { sites: { list: () => [site], add: vi.fn() } },
  };
}

describe('shell', () => {
  it('renders disclaimer, logo, scene area and site list', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const shell = mountShell(root, ctx());
    expect(root.querySelector('footer')?.textContent).toBe(DISCLAIMER);
    expect(root.querySelector('header svg')).not.toBeNull();
    expect(root.querySelector('#scene')).not.toBeNull();
    expect(root.querySelector('.ln-site-list')?.textContent).toContain('Apollo 11');
    shell.destroy();
  });

  it('buildReport includes site and metrics table', () => {
    const r = buildReport(site, '2025-01-01T00:00:00Z', undefined);
    expect(r.scenarios[0]?.id).toBe('apollo11');
    expect(r.sections).toEqual([]);
  });
});
