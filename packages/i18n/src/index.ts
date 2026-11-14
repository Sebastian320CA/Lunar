import type { Language } from '@lunar/contracts';
import { createI18n } from './i18n';
import type { Entry, I18n } from './i18n';
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
import it from './locales/it.json';
import ko from './locales/ko.json';
import tr from './locales/tr.json';

export { createI18n } from './i18n';
export type { Entry, I18n, PluralForms, Resources, Vars } from './i18n';
export { LANGUAGE_FOCUS, getLanguageFocus } from './languageFocus';
export type { LanguageFocus } from './languageFocus';

export const LOCALES: Readonly<Record<Language, Record<string, unknown>>> = {
  es, en, zh, ja, pt, fr, de, ru, hi, ar, it, ko, tr,
};

/** Registers every core namespace of every bundled locale into `i18n`. */
export function loadLocales(i18n: Pick<I18n, 'addResources'>): void {
  const namespaces = new Set<string>();
  for (const data of Object.values(LOCALES)) {
    for (const ns of Object.keys(data)) if (ns !== '_meta') namespaces.add(ns);
  }
  for (const ns of namespaces) {
    const dict: Record<Language, Record<string, Entry>> = {};
    for (const [lang, data] of Object.entries(LOCALES)) {
      const section = data[ns];
      if (section && typeof section === 'object') dict[lang] = section as Record<string, Entry>;
    }
    i18n.addResources(ns, dict);
  }
}

/** Creates an i18n instance with all bundled locales loaded. */
export function createLoadedI18n(...args: Parameters<typeof createI18n>): I18n {
  const i18n = createI18n(...args);
  loadLocales(i18n);
  return i18n;
}
