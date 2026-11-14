import { sanitizeText } from '@lunar/security';

export interface ChartSeries {
  label: string;
  values: number[];
}

export interface ChartOptions {
  width?: number;
  height?: number;
  title?: string;
  /** Etiquetas del eje X (opcional). */
  xLabels?: string[];
  yUnit?: string;
}

export interface BarDatum {
  label: string;
  value: number;
}

const COLORS = ['#f5b301', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#14b8a6'];

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Texto seguro: sanitizeText y escape XML. */
function text(x: string | undefined): string {
  const r = sanitizeText(x ?? '', 120);
  return esc(r.ok ? r.value : '');
}

function num(n: number): string {
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toString() : '0';
}

function dim(v: number | undefined, d: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 4000) : d;
}

function open(w: number, h: number, title: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}" width="${num(w)}" height="${num(h)}" role="img" aria-label="${title}">` +
    `<title>${title}</title><rect width="${num(w)}" height="${num(h)}" fill="#ffffff"/>`
  );
}

function finite(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

function lineChart(series: ChartSeries[], opts: ChartOptions, defaultTitle: string): string {
  const w = dim(opts.width, 600);
  const h = dim(opts.height, 320);
  const title = text(opts.title ?? defaultTitle);
  const padL = 56;
  const padR = 12;
  const padT = 28;
  const padB = 44;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  let max = 0;
  let n = 0;
  for (const s of series) {
    n = Math.max(n, s.values.length);
    for (const v of s.values) max = Math.max(max, finite(v));
  }
  if (max <= 0) max = 1;
  const unit = text(opts.yUnit);
  let out = open(w, h, title);
  out += `<text x="${num(w / 2)}" y="16" text-anchor="middle" font-size="13" font-family="sans-serif">${title}</text>`;
  out += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${num(padT + ph)}" stroke="#444"/>`;
  out += `<line x1="${padL}" y1="${num(padT + ph)}" x2="${num(padL + pw)}" y2="${num(padT + ph)}" stroke="#444"/>`;
  out += `<text x="${padL - 4}" y="${padT + 4}" text-anchor="end" font-size="10" font-family="sans-serif">${num(max)}</text>`;
  out += `<text x="${padL - 4}" y="${num(padT + ph)}" text-anchor="end" font-size="10" font-family="sans-serif">0</text>`;
  if (unit) out += `<text x="4" y="${num(padT + ph / 2)}" font-size="10" font-family="sans-serif">${unit}</text>`;
  const xl = opts.xLabels ?? [];
  if (xl.length > 0) {
    out += `<text x="${padL}" y="${num(h - 28)}" font-size="10" font-family="sans-serif">${text(xl[0])}</text>`;
    out += `<text x="${num(padL + pw)}" y="${num(h - 28)}" text-anchor="end" font-size="10" font-family="sans-serif">${text(xl[xl.length - 1])}</text>`;
  }
  series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length] ?? '#000';
    const pts = s.values.map((v, j) => {
      const x = padL + (n > 1 ? (j / (n - 1)) * pw : 0);
      const y = padT + ph - (Math.max(0, finite(v)) / max) * ph;
      return `${num(x)},${num(y)}`;
    });
    out += `<polyline class="series" fill="none" stroke="${color}" stroke-width="2" points="${pts.join(' ')}"/>`;
    const lx = padL + i * 110;
    out += `<rect x="${lx}" y="${num(h - 16)}" width="10" height="10" fill="${color}"/>`;
    out += `<text x="${lx + 14}" y="${num(h - 7)}" font-size="10" font-family="sans-serif">${text(s.label)}</text>`;
  });
  return out + '</svg>';
}

function barChart(data: BarDatum[], opts: ChartOptions, defaultTitle: string): string {
  const w = dim(opts.width, 600);
  const h = dim(opts.height, 320);
  const title = text(opts.title ?? defaultTitle);
  const padL = 56;
  const padR = 12;
  const padT = 28;
  const padB = 44;
  const pw = w - padL - padR;
  const ph = h - padT - padB;
  let max = 0;
  for (const d of data) max = Math.max(max, finite(d.value));
  if (max <= 0) max = 1;
  const unit = text(opts.yUnit);
  let out = open(w, h, title);
  out += `<text x="${num(w / 2)}" y="16" text-anchor="middle" font-size="13" font-family="sans-serif">${title}</text>`;
  out += `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${num(padT + ph)}" stroke="#444"/>`;
  out += `<line x1="${padL}" y1="${num(padT + ph)}" x2="${num(padL + pw)}" y2="${num(padT + ph)}" stroke="#444"/>`;
  out += `<text x="${padL - 4}" y="${padT + 4}" text-anchor="end" font-size="10" font-family="sans-serif">${num(max)}</text>`;
  if (unit) out += `<text x="4" y="${num(padT + ph / 2)}" font-size="10" font-family="sans-serif">${unit}</text>`;
  const slot = data.length > 0 ? pw / data.length : pw;
  data.forEach((d, i) => {
    const bh = (Math.max(0, finite(d.value)) / max) * ph;
    const x = padL + i * slot + slot * 0.15;
    const color = COLORS[i % COLORS.length] ?? '#000';
    out += `<rect class="bar" x="${num(x)}" y="${num(padT + ph - bh)}" width="${num(slot * 0.7)}" height="${num(bh)}" fill="${color}"/>`;
    out += `<text x="${num(x + slot * 0.35)}" y="${num(h - 24)}" text-anchor="middle" font-size="10" font-family="sans-serif">${text(d.label)}</text>`;
  });
  return out + '</svg>';
}

/** Potencia (W) en el tiempo: una polilinea por serie. */
export function powerChartSvg(series: ChartSeries[], opts: ChartOptions = {}): string {
  return lineChart(series, { yUnit: 'W', ...opts }, 'Power');
}

/** Energia acumulada (Wh) en el tiempo: una polilinea por serie. */
export function cumulativeEnergySvg(series: ChartSeries[], opts: ChartOptions = {}): string {
  return lineChart(series, { yUnit: 'Wh', ...opts }, 'Cumulative energy');
}

/** Comparacion de metodos: una barra por metodo (energia total). */
export function methodComparisonSvg(data: BarDatum[], opts: ChartOptions = {}): string {
  return barChart(data, { yUnit: 'Wh', ...opts }, 'Method comparison');
}

/** Comparacion de sitios: una barra por sitio. */
export function siteComparisonSvg(data: BarDatum[], opts: ChartOptions = {}): string {
  return barChart(data, { yUnit: 'Wh', ...opts }, 'Site comparison');
}
