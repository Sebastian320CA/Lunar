// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerPanelTab } from '@lunar/contracts';
import type { I18nApi, LunarSite } from '@lunar/contracts';
import { openSitePanel } from '../src/panel/panel';
import { createSummaryTab } from '../src/panel/summaryTab';

const i18n: I18nApi = { setLanguage: () => undefined, t: (k) => `T:${k}`, onChange: () => () => undefined };
const site: LunarSite = { id: 's', name: '<b>X</b>', program: 'clps', latDeg: 1, lonDeg: 2, source: 'src', verified: false };
const mq = (matches: boolean) => vi.stubGlobal('matchMedia', () => ({ matches }));

registerPanelTab(createSummaryTab(i18n));
registerPanelTab({ id: 'b', titleKey: 'tab.b', mount: (c) => { c.textContent = 'B'; return () => undefined; } });

afterEach(() => { document.body.textContent = ''; vi.unstubAllGlobals(); });

describe('openSitePanel', () => {
  it('reduced motion: Esc closes immediately and restores focus', () => {
    mq(true);
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    openSitePanel({ anchor: { xPx: 10, yPx: 20 }, site, utc: '2030-01-01T00:00:00Z', i18n });
    const dlg = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.style.transform).toBe('none');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('lists tabs in registration order and renders summary with textContent and pending marker', () => {
    mq(true);
    openSitePanel({ anchor: { xPx: 0, yPx: 0 }, site, utc: '2030-01-01T00:00:00Z', i18n });
    const ids = Array.from(document.querySelectorAll('[role="tab"]')).map((e) => (e as HTMLElement).dataset['tabId']);
    expect(ids).toEqual(['resumen', 'b']);
    expect(document.querySelector('b')).toBeNull();
    expect(document.querySelector('[data-pending-marker]')?.textContent).toBe('T:panel.pending');
  });

  it('animated path: starts transformed and closes after the animation', () => {
    mq(false);
    vi.useFakeTimers();
    const h = openSitePanel({ anchor: { xPx: 5, yPx: 6 }, site, utc: '2030-01-01T00:00:00Z', i18n });
    expect(h.element.style.transform).toContain('rotateX');
    h.close();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    vi.advanceTimersByTime(400);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    vi.useRealTimers();
  });
});
