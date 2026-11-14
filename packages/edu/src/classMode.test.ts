import { describe, expect, it } from 'vitest';
import { createClassSession } from './classMode';
import { exportClassPackage, importClassPackage, toClassPackage } from './classPackage';

function make() {
  return createClassSession({
    name: 'Clase Luna',
    description: 'Intro',
    siteIds: [],
    parts: [{ title: 'Parte 1', note: 'Iluminacion' }, { title: 'Parte 2' }],
    teams: ['Rojo', 'Azul'],
  });
}

describe('class session', () => {
  it('scores per round and ranks teams', () => {
    const c = make();
    expect(c.addScore('team-1', 1).ok).toBe(false);
    c.startRound();
    c.addScore('team-1', 5);
    c.startRound();
    c.addScore('team-2', 8);
    c.addScore('team-1', 1);
    expect(c.ranking()[0]).toMatchObject({ name: 'Azul', total: 8 });
    expect(c.addScore('nope', 1).ok).toBe(false);
  });

  it('parts are independently accessible', () => {
    const c = make();
    expect(c.getPart(1)).toEqual({ ok: true, value: { title: 'Parte 2' } });
    expect(c.getPart(9).ok).toBe(false);
  });
});

describe('class package', () => {
  it('export then import returns an equal package', () => {
    const c = make();
    const r = importClassPackage(exportClassPackage(c.session));
    expect(r).toEqual({ ok: true, value: toClassPackage(c.session) });
  });

  it('rejects invalid and oversized input', () => {
    expect(importClassPackage('{nope').ok).toBe(false);
    expect(importClassPackage('{"version":2}').ok).toBe(false);
    expect(importClassPackage('x'.repeat(1_048_577)).ok).toBe(false);
  });
});
