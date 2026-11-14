// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getTheme, setTheme } from '../src/design/theme';
import { LOGO_SVG } from '../src/design/logo';

describe('theme', () => {
  it('sets and reads the data-theme attribute', () => {
    setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getTheme()).toBe('dark');
    setTheme('light');
    expect(getTheme()).toBe('light');
  });

  it('system removes the attribute', () => {
    setTheme('dark');
    setTheme('system');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(getTheme()).toBe('system');
  });
});

describe('logo', () => {
  it('is an svg without NASA wording', () => {
    expect(LOGO_SVG.startsWith('<svg')).toBe(true);
    expect(LOGO_SVG.toLowerCase()).not.toContain('nasa');
  });
});
