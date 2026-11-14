import { ASSET_KINDS } from '@lunar/contracts';
import { validateManifest } from '@lunar/security';

export const DISCLAIMER = 'Inspirado en NASA Space Apps - No avalado por la NASA';
export const NON_ENDORSEMENT =
  'La NASA no avala a entidades que no pertenecen al gobierno de EE. UU. / NASA does not endorse non-US-government entities.';

export interface DataCredit {
  readonly name: string;
  readonly note: string;
  readonly url?: string;
}

export const DATA_CREDITS: readonly DataCredit[] = [
  {
    name: 'LROC QuickMap',
    note: 'Operado por Arizona State University, no es un sitio de la NASA.',
    url: 'https://quickmap.lroc.im-ldi.com/',
  },
  { name: 'NASA Moon Trek', note: 'Datos y mapas de la Luna.', url: 'https://trek.nasa.gov/moon/' },
  { name: 'NAIF SPICE', note: 'Kernels DE440 y Moon PA/ME (efemérides y orientación lunar).' },
  { name: 'LRO LOLA', note: 'Altimetría lunar para el terreno.' },
  { name: 'NSSDCA / LROC', note: 'Coordenadas de los sitios de aterrizaje.' },
  { name: 'Natural Earth', note: 'Datos cartográficos de la Tierra.' },
  { name: 'Meeus', note: 'Algoritmos astronómicos (Astronomical Algorithms).' },
  {
    name: 'CSA - Exploración lunar',
    note: 'Solo como contexto.',
    url: 'https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/',
  },
];

function el<K extends keyof HTMLElementTagNameMap>(
  doc: Document,
  tag: K,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Monta la pantalla "Acerca de y creditos". Solo textContent; nunca innerHTML.
 * `t` es opcional: traduce titulos (claves `about.*`); sin el se usa el texto en español.
 */
export function mountAbout(container: HTMLElement, manifest: unknown, t?: (key: string) => string): void {
  const doc = container.ownerDocument;
  const tr = (key: string, fallback: string): string => {
    const v = t?.(key);
    return v && v !== key ? v : fallback;
  };
  container.replaceChildren();
  const root = el(doc, 'section');
  root.setAttribute('aria-label', tr('about.title', 'Acerca de y créditos'));
  root.appendChild(el(doc, 'h2', tr('about.title', 'Acerca de y créditos')));
  root.appendChild(el(doc, 'p', tr('common.disclaimer', DISCLAIMER)));
  root.appendChild(el(doc, 'p', t ? tr('about.nonEndorsement', NON_ENDORSEMENT) : NON_ENDORSEMENT));

  root.appendChild(el(doc, 'h3', tr('about.assets', 'Créditos de assets')));
  const result = validateManifest(manifest);
  if (!result.ok) {
    const err = el(doc, 'p', `${tr('about.loadError', 'No se pudieron cargar los créditos')}: ${result.error}`);
    err.setAttribute('role', 'alert');
    root.appendChild(err);
  } else {
    const list = el(doc, 'ul');
    for (const kind of ASSET_KINDS) {
      for (const asset of result.value[kind] ?? []) {
        list.appendChild(el(doc, 'li', `${asset.id} (${kind}): ${asset.credit}`));
      }
    }
    root.appendChild(list);
  }

  root.appendChild(el(doc, 'h3', tr('about.data', 'Fuentes de datos')));
  const sources = el(doc, 'ul');
  for (const c of DATA_CREDITS) {
    const li = el(doc, 'li');
    li.appendChild(el(doc, 'strong', c.name));
    li.appendChild(doc.createTextNode(`: ${c.note} `));
    if (c.url !== undefined) {
      const a = el(doc, 'a', c.url);
      a.setAttribute('href', c.url);
      a.setAttribute('rel', 'noopener noreferrer');
      a.setAttribute('target', '_blank');
      li.appendChild(a);
    }
    sources.appendChild(li);
  }
  root.appendChild(sources);
  container.appendChild(root);
}
