/** Saneado de SVG (allowlist) y rasterizado a PNG. El contenido de entrada es no confiable. */

export const MAX_SVG_CHARS = 500_000;
export const MAX_PNG_BYTES = 5_000_000;

const ALLOWED_ELEMENTS = new Set([
  'svg', 'g', 'defs', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'title', 'desc', 'lineargradient', 'radialgradient', 'stop', 'clippath',
]);
const TEXT_ELEMENTS = new Set(['text', 'tspan', 'title', 'desc']);
/** Elementos cuyo contenido completo se descarta. */
const DROP_CONTENT = new Set(['script', 'style', 'foreignobject', 'iframe', 'object', 'embed', 'use', 'image', 'animate', 'set', 'a']);

const ALLOWED_ATTRS = new Set([
  'viewbox', 'width', 'height', 'x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-opacity', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity',
  'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'dx', 'dy',
  'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'clip-path',
  'id', 'class', 'xmlns',
]);

function escapeText(s: string): string {
  return s.replace(/&(?!(?:amp|lt|gt|quot|#\d+);)/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

function safeValue(name: string, value: string): boolean {
  const v = value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  if (v.includes('java' + 'script:') || v.includes('data:') || v.includes('expression(')) return false;
  if (name === 'xmlns') return value === 'http://www.w3.org/2000/svg';
  // url() solo a referencias locales
  const urls = v.match(/url\([^)]*\)/g) ?? [];
  return urls.every((u) => /^url\((['"]?)#[\w-]+\1\)$/.test(u));
}

const TAG_RE = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<[!?][^>]*>|<(\/?)([A-Za-z][\w:-]*)([^>]*)>/g;
const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[\w:.-]/;
const SPACE = /\s/;

/** Extrae pares nombre/valor de la parte de atributos de una etiqueta (sin regex anidadas). */
function parseAttrs(raw: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const n = raw.length;
  let i = 0;
  const skipSpace = (p: number): number => {
    let q = p;
    while (q < n && SPACE.test(raw.charAt(q))) q += 1;
    return q;
  };
  while (i < n) {
    if (!NAME_START.test(raw.charAt(i))) {
      i += 1;
      continue;
    }
    const start = i;
    i += 1;
    while (i < n && NAME_CHAR.test(raw.charAt(i))) i += 1;
    const name = raw.slice(start, i);
    let value = '';
    const eq = skipSpace(i);
    if (raw.charAt(eq) === '=') {
      const vs = skipSpace(eq + 1);
      const q = raw.charAt(vs);
      if (q === '"' || q === "'") {
        const end = raw.indexOf(q, vs + 1);
        if (end >= 0) {
          value = raw.slice(vs + 1, end);
          i = end + 1;
        }
      } else {
        let e = vs;
        while (e < n && !/[\s"'>]/.test(raw.charAt(e))) e += 1;
        if (e > vs) {
          value = raw.slice(vs, e);
          i = e;
        }
      }
    }
    out.push([name, value]);
  }
  return out;
}

/** Devuelve un SVG saneado, o cadena vacia si la entrada no es un SVG valido. */
export function sanitizeSvg(input: unknown): string {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_SVG_CHARS) return '';
  let out = '';
  const stack: string[] = [];
  let dropDepth = 0;
  let last = 0;
  let sawRoot = false;
  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const emitText = (raw: string): void => {
    if (dropDepth > 0 || stack.length === 0) return;
    const top = stack[stack.length - 1] ?? '';
    if (TEXT_ELEMENTS.has(top)) out += escapeText(raw.replace(/<[^>]*$/, ''));
  };
  while ((m = TAG_RE.exec(input)) !== null) {
    emitText(input.slice(last, m.index));
    last = TAG_RE.lastIndex;
    const name = m[2]?.toLowerCase();
    if (!name) continue; // comentario, CDATA, doctype, PI
    const closing = m[1] === '/';
    const selfClosing = (m[3] ?? '').trimEnd().endsWith('/');
    if (dropDepth > 0 || DROP_CONTENT.has(name)) {
      if (closing) dropDepth = Math.max(0, dropDepth - 1);
      else if (!selfClosing) dropDepth += 1;
      continue;
    }
    if (!ALLOWED_ELEMENTS.has(name)) continue; // descarta la etiqueta, no su contenido
    const outName = CANON[name] ?? name;
    if (closing) {
      const i = stack.lastIndexOf(name);
      if (i >= 0) {
        while (stack.length > i + 1) out += close(stack.pop());
        stack.pop();
        out += `</${outName}>`;
      }
      continue;
    }
    if (!sawRoot) {
      if (name !== 'svg') return '';
      sawRoot = true;
    }
    let attrs = '';
    const raw = m[3] ?? '';
    for (const [attrName, av] of parseAttrs(raw)) {
      const an = attrName.toLowerCase();
      if (!ALLOWED_ATTRS.has(an) || an.startsWith('on') || !safeValue(an, av)) continue;
      attrs += ` ${an === 'viewbox' ? 'viewBox' : an}="${escapeAttr(av)}"`;
    }
    if (name === 'svg' && !attrs.includes('xmlns=')) attrs += ' xmlns="http://www.w3.org/2000/svg"';
    if (selfClosing) out += `<${outName}${attrs}/>`;
    else {
      out += `<${outName}${attrs}>`;
      stack.push(name);
    }
  }
  emitText(input.slice(last));
  if (!sawRoot) return '';
  while (stack.length) out += close(stack.pop());
  return out;
}

const CANON: Record<string, string> = {
  lineargradient: 'linearGradient',
  radialgradient: 'radialGradient',
  clippath: 'clipPath',
};
function close(name: string | undefined): string {
  return name ? `</${CANON[name] ?? name}>` : '';
}

const PNG_RE = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

/** Acepta solo `data:image/png;base64,` con firma PNG valida; devuelve los bytes o null. */
export function decodePngDataUrl(input: unknown): Uint8Array | null {
  if (typeof input !== 'string' || input.length > MAX_PNG_BYTES * 2) return null;
  const m = PNG_RE.exec(input);
  if (!m?.[1] || m[1].length % 4 !== 0) return null;
  let bin: string;
  try {
    bin = atob(m[1]);
  } catch {
    return null;
  }
  if (bin.length > MAX_PNG_BYTES || bin.length < 8) return null;
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i += 1) if (bin.charCodeAt(i) !== sig[i]) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Devuelve la URL si es un PNG data URL valido, o cadena vacia. */
export function sanitizePngDataUrl(input: unknown): string {
  return decodePngDataUrl(input) ? (input as string) : '';
}

/** Rasteriza un SVG saneado a PNG via canvas. Devuelve null si no hay canvas o falla. */
export async function svgToPngDataUrl(svg: string, width = 800, height = 450): Promise<string | null> {
  const clean = sanitizeSvg(svg);
  if (!clean || typeof document === 'undefined' || typeof Image === 'undefined') return null;
  const w = Math.min(Math.max(Math.floor(width), 1), 4000);
  const h = Math.min(Math.max(Math.floor(height), 1), 4000);
  return new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        const url = canvas.toDataURL('image/png');
        resolve(sanitizePngDataUrl(url) || null);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(clean)}`;
  });
}
