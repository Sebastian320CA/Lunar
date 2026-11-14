import type { I18nApi, Language, SceneApi, Unsubscribe } from '@lunar/contracts';
import { getLanguageFocus } from './languageFocus';

export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Entry = string | PluralForms;
/** Per language dictionary: `{ es: { key: 'texto' }, en: { ... } }`. */
export type Resources = Record<Language, Record<string, Entry>>;
export type Vars = Record<string, string | number>;

export interface I18n extends I18nApi {
  addResources(ns: string, dict: Resources): void;
  /** Translate with `{var}` interpolation; `count` selects the plural form. */
  tv(key: string, vars?: Vars): string;
  getLanguage(): Language;
  dir(): 'ltr' | 'rtl';
}

const RTL = new Set(['ar', 'he', 'fa', 'ur']);
const DEFAULT_LANG: Language = 'es';

function base(lang: string): string {
  return (lang.toLowerCase().split('-')[0] ?? lang).trim();
}

export function createI18n(
  sceneGetter: () => SceneApi | null | undefined,
  opts: { languages?: readonly string[]; fallback?: Language } = {},
): I18n {
  const fallback = opts.fallback ?? 'en';
  const store = new Map<string, Map<string, Entry>>(); // lang -> key -> entry
  const listeners = new Set<(lang: Language) => void>();

  function initial(): Language {
    const list =
      opts.languages ??
      (typeof navigator !== 'undefined' && navigator.languages?.length ? navigator.languages : []);
    for (const l of list) {
      const b = base(l);
      if (b) return b;
    }
    return DEFAULT_LANG;
  }

  let current: Language = initial();

  function lookup(lang: string, key: string): Entry | undefined {
    return store.get(lang)?.get(key);
  }

  function resolve(key: string): Entry | undefined {
    return lookup(current, key) ?? lookup(fallback, key);
  }

  function interpolate(text: string, vars?: Vars): string {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (m, name: string) =>
      Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
    );
  }

  return {
    addResources(ns, dict) {
      for (const [lang, entries] of Object.entries(dict)) {
        let m = store.get(lang);
        if (!m) {
          m = new Map();
          store.set(lang, m);
        }
        for (const [k, v] of Object.entries(entries)) m.set(`${ns}.${k}`, v);
      }
    },
    setLanguage(lang) {
      const b = base(lang);
      if (!b) return;
      current = b;
      const row = getLanguageFocus(b);
      const scene = sceneGetter();
      if (row && scene) scene.focusEarthOn(row.latDeg, row.lonDeg);
      for (const cb of [...listeners]) cb(current);
    },
    t(key) {
      return this.tv(key);
    },
    tv(key, vars) {
      const entry = resolve(key);
      if (entry === undefined) return key;
      if (typeof entry === 'string') return interpolate(entry, vars);
      const count = vars && typeof vars.count === 'number' ? vars.count : 0;
      let form: Intl.LDMLPluralRule = 'other';
      try {
        form = new Intl.PluralRules(current).select(count);
      } catch {
        /* invalid locale tag: use 'other' */
      }
      return interpolate(entry[form] ?? entry.other, vars);
    },
    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    getLanguage: () => current,
    dir: () => (RTL.has(current) ? 'rtl' : 'ltr'),
  };
}
