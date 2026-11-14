// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import type { LunarSite } from '@lunar/contracts';
import { mountSiteList } from './siteList';
import { mountCustomForm } from './customForm';
import { mountTimeline } from './timeline';
import { createTimeController } from '../timeController';

const sites: LunarSite[] = [
  { id: 'a', name: '<b>Alfa</b>', program: 'apollo', latDeg: 0, lonDeg: 0, source: 's', verified: true },
  { id: 'b', name: 'Beta', program: 'clps', latDeg: 1, lonDeg: 1, source: 's', verified: false },
];

describe('mountSiteList', () => {
  it('selecciona un sitio y no interpreta HTML', () => {
    const c = document.createElement('div');
    const onSelect = vi.fn();
    mountSiteList(c, sites, onSelect);
    const btns = c.querySelectorAll('button');
    expect(btns[0]?.textContent).toBe('<b>Alfa</b>');
    expect(c.querySelector('b')).toBeNull();
    btns[1]?.click();
    expect(onSelect).toHaveBeenCalledWith(sites[1]);
    expect(btns[1]?.getAttribute('aria-pressed')).toBe('true');
  });
});

describe('mountCustomForm', () => {
  it('muestra errores y no llama onSubmit con datos inválidos; acepta válidos', () => {
    const c = document.createElement('div');
    const onSubmit = vi.fn();
    mountCustomForm(c, onSubmit);
    const form = c.querySelector('form') as HTMLFormElement;
    (c.querySelector('#custom-lat') as HTMLInputElement).value = '95';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(c.querySelector('#custom-lat-error')?.textContent).not.toBe('');
    (c.querySelector('#custom-name') as HTMLInputElement).value = 'Mi sitio';
    (c.querySelector('#custom-lat') as HTMLInputElement).value = '-89,5';
    (c.querySelector('#custom-lon') as HTMLInputElement).value = '10';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(c.querySelector('#custom-lat-error')?.textContent).toBe('');
  });
});

describe('mountTimeline', () => {
  const mk = () =>
    createTimeController('2025-01-01T00:00:00Z', { findEvents: async () => [] }, { now: () => 0, every: () => () => undefined });

  it('una fecha inválida muestra error y no cambia la hora', () => {
    const c = document.createElement('div');
    const t = mk();
    mountTimeline(c, t);
    (c.querySelector('#timeline-utc') as HTMLInputElement).value = 'no-es-fecha';
    c.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(c.querySelector('#timeline-error')?.textContent).not.toBe('');
    expect(t.getUtc()).toBe('2025-01-01T00:00:00Z');
  });

  it('una fecha válida y el botón de día lunar actualizan la hora', () => {
    const c = document.createElement('div');
    const t = mk();
    mountTimeline(c, t);
    (c.querySelector('#timeline-utc') as HTMLInputElement).value = '2025-02-03T04:05:06Z';
    c.querySelector('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(t.getUtc()).toBe('2025-02-03T04:05:06Z');
    const before = Date.parse(t.getUtc());
    (c.querySelectorAll('button')[3] as HTMLButtonElement).click();
    expect(Date.parse(t.getUtc())).toBeGreaterThan(before);
  });
});

