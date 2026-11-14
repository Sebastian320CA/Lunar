// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mountAbout, DISCLAIMER } from '../src/about/about';

const manifest = {
  version: 1,
  models: [{ id: 'moon', path: 'models/moon.glb', credit: 'Moon model by <b>Alice</b>' }],
  textures: [{ id: 'tex', path: 'textures/a.png', credit: 'Texture by Bob' }],
  audio: [{ id: 'amb', path: 'audio/a.ogg', credit: 'Audio by Carol' }],
};

describe('about', () => {
  it('lists every asset credit, disclaimers and data sources', () => {
    const c = document.createElement('div');
    mountAbout(c, manifest);
    const text = c.textContent ?? '';
    for (const s of ['Moon model by <b>Alice</b>', 'Texture by Bob', 'Audio by Carol', DISCLAIMER, 'NASA does not endorse', 'Arizona State University', 'DE440', 'LOLA', 'NSSDCA', 'Natural Earth']) {
      expect(text).toContain(s);
    }
    expect(c.querySelector('b')).toBeNull();
    const anchors = [...c.querySelectorAll('a')];
    expect(anchors.map((a) => a.getAttribute('href'))).toContain('https://trek.nasa.gov/moon/');
    expect(anchors.every((a) => a.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
  });

  it('shows an error for an invalid manifest', () => {
    const c = document.createElement('div');
    mountAbout(c, { version: 2 });
    expect(c.querySelector('[role="alert"]')?.textContent).toContain('manifest inválido');
    expect(c.textContent).toContain(DISCLAIMER);
  });
});
