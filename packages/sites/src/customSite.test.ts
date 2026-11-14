import { describe, expect, it } from 'vitest';
import { validateCustomSite } from './customSite';

describe('validateCustomSite', () => {
  it('accepts valid input (strings with comma decimals)', () => {
    const r = validateCustomSite({ name: 'Mi sitio', lat: '-89,5', lon: '45' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.latDeg).toBe(-89.5);
      expect(r.value.program).toBe('custom');
      expect(r.value.verified).toBe(false);
    }
  });

  it('reports per-field errors in Spanish', () => {
    const r = validateCustomSite({ name: '  ', lat: 91, lon: 'abc' });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.name).toMatch(/obligatorio/);
      expect(r.errors.lat).toMatch(/latitud/);
      expect(r.errors.lon).toMatch(/longitud/);
    }
  });
});
