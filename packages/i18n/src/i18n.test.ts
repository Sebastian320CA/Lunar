import { describe, expect, it, vi } from 'vitest';
import type { SceneApi } from '@lunar/contracts';
import { createI18n } from './i18n';
import { LANGUAGE_FOCUS } from './languageFocus';

function mk(languages: string[] = ['es-CO']) {
  const focusEarthOn = vi.fn();
  const scene = { focusEarthOn } as unknown as SceneApi;
  const i18n = createI18n(() => scene, { languages });
  return { i18n, focusEarthOn };
}

describe('i18n core', () => {
  it('returns the key when missing', () => {
    expect(mk().i18n.t('no.such')).toBe('no.such');
  });

  it('detects initial language and interpolates', () => {
    const { i18n } = mk(['es-CO']);
    i18n.addResources('common', { es: { hi: 'Hola {name}' } });
    expect(i18n.getLanguage()).toBe('es');
    expect(i18n.tv('common.hi', { name: 'Luna' })).toBe('Hola Luna');
  });

  it('selects plural forms', () => {
    const { i18n } = mk(['en']);
    i18n.addResources('x', { en: { n: { one: '{count} site', other: '{count} sites' } } });
    expect(i18n.tv('x.n', { count: 1 })).toBe('1 site');
    expect(i18n.tv('x.n', { count: 3 })).toBe('3 sites');
  });

  it('is RTL for ar only', () => {
    const { i18n } = mk();
    i18n.setLanguage('ar');
    expect(i18n.dir()).toBe('rtl');
    i18n.setLanguage('en');
    expect(i18n.dir()).toBe('ltr');
  });

  it('es focuses Colombia', () => {
    const { i18n, focusEarthOn } = mk(['en']);
    i18n.setLanguage('es');
    expect(focusEarthOn).toHaveBeenCalledWith(4.711, -74.072);
  });

  it('unsubscribe stops notifications', () => {
    const { i18n } = mk();
    const cb = vi.fn();
    const off = i18n.onChange(cb);
    i18n.setLanguage('fr');
    off();
    i18n.setLanguage('de');
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('fr');
  });

  it('table covers 13 languages', () => {
    expect(LANGUAGE_FOCUS).toHaveLength(13);
  });
});
