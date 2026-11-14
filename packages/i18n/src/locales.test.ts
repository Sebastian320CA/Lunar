import { describe, expect, it } from 'vitest';
import es from './locales/es.json';
import en from './locales/en.json';
import zh from './locales/zh.json';
import ja from './locales/ja.json';
import pt from './locales/pt.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ru from './locales/ru.json';
import hi from './locales/hi.json';
import ar from './locales/ar.json';
import itLocale from './locales/it.json';
import ko from './locales/ko.json';
import tr from './locales/tr.json';

const MARKER = 'traduccion automatica pendiente de revision';
const LOCALES: Record<string, unknown> = { es, en, zh, ja, pt, fr, de, ru, hi, ar, it: itLocale, ko, tr };

/** Flatten nested objects to dotted keys; plural-form objects ({one, other}) count as one leaf. */
function keys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  const entries = Object.entries(obj as Record<string, unknown>);
  const isPlural = entries.length > 0 && entries.every(([k, v]) => typeof v === 'string' && /^(zero|one|two|few|many|other)$/.test(k));
  if (isPlural) return [prefix];
  return entries.flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k));
}

function status(l: unknown): string {
  return (l as { _meta: { status: string } })._meta.status;
}

describe('locales', () => {
  it('has the 13 expected languages', () => {
    expect(Object.keys(LOCALES)).toHaveLength(13);
  });

  it('all languages share the same key set as en', () => {
    const ref = keys(en).sort();
    expect(ref.length).toBeGreaterThan(40);
    for (const [lang, data] of Object.entries(LOCALES)) {
      expect(keys(data).sort(), lang).toEqual(ref);
    }
  });

  it('covers the core namespaces', () => {
    for (const ns of ['common', 'menu', 'panel', 'about', 'scene', 'time', 'errors']) {
      expect(Object.keys(en)).toContain(ns);
    }
  });

  it('es and en carry no pending-translation marker', () => {
    expect(JSON.stringify(es)).not.toContain(MARKER);
    expect(JSON.stringify(en)).not.toContain(MARKER);
  });

  it('the other 11 languages carry the marker', () => {
    for (const [lang, data] of Object.entries(LOCALES)) {
      if (lang === 'es' || lang === 'en') continue;
      expect(status(data), lang).toBe(MARKER);
    }
  });
});
