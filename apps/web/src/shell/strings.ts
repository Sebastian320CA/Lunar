import es from '@lunar/i18n/src/locales/es.json';

/** Aplana `{ ns: { clave: texto } }` a `{ 'ns.clave': texto }` (las formas plurales usan `other`). */
function flatten(obj: Record<string, unknown>, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_meta') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o['other'] === 'string' && Object.keys(o).every((x) => /^(zero|one|two|few|many|other)$/.test(x))) {
        out[key] = o['other'] as string;
      } else flatten(o, key, out);
    }
  }
  return out;
}

/** Textos en español usados cuando el módulo i18n no está disponible. Fuente única: es.json. */
export const FALLBACK: Readonly<Record<string, string>> = flatten(es as Record<string, unknown>);
