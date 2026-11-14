/**
 * Editable table: language -> point on Earth to focus when the language is chosen.
 * Criterion: most populous country that speaks the language (es is the mandatory
 * exception: Colombia). Coordinates are approximate capitals, cosmetic only, not
 * scientific. `verified: false` until tools/i18n-data/build_focus.py regenerates
 * them from Natural Earth (public domain, https://www.naturalearthdata.com).
 */
export interface LanguageFocus {
  lang: string;
  country: string;
  latDeg: number;
  lonDeg: number;
  note: string;
  verified: boolean;
}

const NOTE = 'pais mas poblado que lo habla';

export const LANGUAGE_FOCUS: readonly LanguageFocus[] = [
  { lang: 'en', country: 'Estados Unidos', latDeg: 38.907, lonDeg: -77.037, note: NOTE, verified: false },
  { lang: 'zh', country: 'China', latDeg: 39.904, lonDeg: 116.407, note: NOTE, verified: false },
  { lang: 'ja', country: 'Japon', latDeg: 35.682, lonDeg: 139.692, note: NOTE, verified: false },
  { lang: 'es', country: 'Colombia', latDeg: 4.711, lonDeg: -74.072, note: 'excepcion obligatoria: Colombia', verified: false },
  { lang: 'pt', country: 'Brasil', latDeg: -15.794, lonDeg: -47.882, note: NOTE, verified: false },
  { lang: 'fr', country: 'Francia', latDeg: 48.857, lonDeg: 2.352, note: NOTE, verified: false },
  { lang: 'de', country: 'Alemania', latDeg: 52.52, lonDeg: 13.405, note: NOTE, verified: false },
  { lang: 'ru', country: 'Rusia', latDeg: 55.756, lonDeg: 37.617, note: NOTE, verified: false },
  { lang: 'hi', country: 'India', latDeg: 28.614, lonDeg: 77.209, note: NOTE, verified: false },
  { lang: 'ar', country: 'Egipto', latDeg: 30.044, lonDeg: 31.236, note: NOTE, verified: false },
  { lang: 'it', country: 'Italia', latDeg: 41.903, lonDeg: 12.496, note: NOTE, verified: false },
  { lang: 'ko', country: 'Corea del Sur', latDeg: 37.567, lonDeg: 126.978, note: NOTE, verified: false },
  { lang: 'tr', country: 'Turquia', latDeg: 39.933, lonDeg: 32.86, note: NOTE, verified: false },
];

export function getLanguageFocus(lang: string): LanguageFocus | undefined {
  const base = lang.toLowerCase().split('-')[0];
  return LANGUAGE_FOCUS.find((r) => r.lang === base);
}
