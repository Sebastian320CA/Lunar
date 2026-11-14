import { describe, expect, it } from 'vitest';
import { APOLLO_SITE_IDS } from '@lunar/contracts';
import { MAX_CLASS_PACKAGE_BYTES, loadClassPackage, validateManifest } from './classPackage.js';

const siteId = APOLLO_SITE_IDS[0];

const validPackage = {
  version: 1,
  name: 'Clase 1',
  siteIds: [siteId],
  lessons: [{ title: 'Introduccion', note: 'Nota' }],
};

describe('loadClassPackage', () => {
  it('acepta un paquete valido (string y Uint8Array)', () => {
    const json = JSON.stringify(validPackage);
    const a = loadClassPackage(json);
    expect(a.ok).toBe(true);
    if (a.ok) {
      expect(a.value.name).toBe('Clase 1');
      expect(a.value.siteIds).toEqual([siteId]);
    }
    expect(loadClassPackage(new TextEncoder().encode(json)).ok).toBe(true);
  });

  it('rechaza entradas que superan el tamano maximo', () => {
    expect(loadClassPackage('x'.repeat(MAX_CLASS_PACKAGE_BYTES + 1)).ok).toBe(false);
    expect(loadClassPackage(new Uint8Array(MAX_CLASS_PACKAGE_BYTES + 1)).ok).toBe(false);
  });

  it('rechaza JSON invalido sin lanzar', () => {
    const r = loadClassPackage('{no es json');
    expect(r).toEqual({ ok: false, error: 'JSON inválido' });
  });

  it('rechaza la clave __proto__', () => {
    const r = loadClassPackage(
      '{"version":1,"name":"x","siteIds":[],"lessons":[],"__proto__":{"admin":true}}',
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('__proto__');
  });

  it('rechaza un id de sitio desconocido', () => {
    const r = loadClassPackage(JSON.stringify({ ...validPackage, siteIds: ['no-existe'] }));
    expect(r.ok).toBe(false);
  });
});

describe('validateManifest', () => {
  it('acepta un manifest valido', () => {
    const manifest = {
      version: 1,
      models: [{ id: 'moon', path: 'models/moon.glb', credit: 'NASA' }],
    };
    expect(validateManifest(manifest)).toEqual({ ok: true, value: manifest });
  });

  it('rechaza un manifest invalido indicando la ruta', () => {
    const r = validateManifest({ version: 1, models: [{ id: 'm', path: '../x.glb', credit: 'NASA' }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('models.0');
  });

  it('rechaza entradas que no son objetos', () => {
    expect(validateManifest(null).ok).toBe(false);
    expect(validateManifest('x').ok).toBe(false);
  });
});
