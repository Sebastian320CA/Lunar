import type { SiteMetrics } from '@lunar/contracts';
import { MAX_SCENARIOS, type ComparisonRow, type SensitivityEntry } from './core.js';

/** Escapa texto para contenido y atributos SVG/XML. */
export function escapeSvg(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export type MetricKey = keyof SiteMetrics;

const COLORS = ['#4e9af1', '#f1a84e', '#6fcf97'];
const W = 320;
const H = 200;
const PAD = { l: 44, r: 12, t: 28, b: 40 };

const num = (v: number): number => (Number.isFinite(v) ? v : 0);
const f = (v: number): string => (Math.round(v * 100) / 100).toString();

function frame(title: string, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escapeSvg(title)}">` +
    `<title>${escapeSvg(title)}</title>` +
    `<text x="${W / 2}" y="16" text-anchor="middle" font-size="12" fill="#222">${escapeSvg(title)}</text>` +
    body +
    `</svg>`
  );
}

/** Grafica de barras de una metrica para hasta 3 escenarios (una barra por escenario). */
export function barChartSvg(
  rows: readonly ComparisonRow[],
  metric: MetricKey,
  labels: readonly string[] = [],
  title: string = metric,
): string {
  const used = rows.slice(0, MAX_SCENARIOS);
  const values = used.map((r) => num(r.metrics[metric]));
  const max = Math.max(...values, 0) || 1;
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const plotH = H - PAD.t - PAD.b;
  const slot = (W - PAD.l - PAD.r) / Math.max(used.length, 1);
  const bw = slot * 0.6;
  const y0 = PAD.t + (plotH * max) / span;
  let body = `<line x1="${PAD.l}" y1="${f(y0)}" x2="${W - PAD.r}" y2="${f(y0)}" stroke="#888"/>`;
  body += `<text x="${PAD.l - 4}" y="${PAD.t + 4}" text-anchor="end" font-size="9" fill="#444">${f(max)}</text>`;
  used.forEach((row, i) => {
    const v = values[i] ?? 0;
    const h = (plotH * Math.abs(v)) / span;
    const x = PAD.l + slot * i + (slot - bw) / 2;
    const y = v >= 0 ? y0 - h : y0;
    const label = labels[i] ?? row.scenario.siteId;
    body +=
      `<rect class="bar" x="${f(x)}" y="${f(y)}" width="${f(bw)}" height="${f(h)}" fill="${COLORS[i % COLORS.length]}">` +
      `<title>${escapeSvg(label)}: ${f(v)}</title></rect>` +
      `<text x="${f(x + bw / 2)}" y="${f(y - 3)}" text-anchor="middle" font-size="9" fill="#222">${f(v)}</text>` +
      `<text x="${f(x + bw / 2)}" y="${H - PAD.b + 14}" text-anchor="middle" font-size="9" fill="#222">${escapeSvg(label)}</text>`;
  });
  return frame(title, body);
}

/** Grafica de lineas de sensibilidad: una serie por desplazamiento en km y otra en dias, mas el punto base. */
export function sensitivityLineSvg(
  entries: readonly SensitivityEntry[],
  metric: MetricKey,
  title: string = metric,
): string {
  const base = entries.find((e) => e.kind === 'base');
  const series: { kind: 'km' | 'days'; pts: { shift: number; v: number }[] }[] = (['km', 'days'] as const).map(
    (kind) => ({
      kind,
      pts: entries
        .filter((e) => e.kind === kind)
        .map((e) => ({ shift: e.shift, v: num(e.metrics[metric]) }))
        .sort((a, b) => a.shift - b.shift),
    }),
  );
  const baseV = base ? num(base.metrics[metric]) : undefined;
  for (const s of series) {
    if (baseV !== undefined) {
      s.pts.push({ shift: 0, v: baseV });
      s.pts.sort((a, b) => a.shift - b.shift);
    }
  }
  const all = series.flatMap((s) => s.pts);
  const vs = all.map((p) => p.v);
  const vmin = Math.min(...vs, 0);
  const vmax = Math.max(...vs, 0) || 1;
  const vspan = vmax - vmin || 1;
  const plotW = W - PAD.l - PAD.r;
  const plotH = H - PAD.t - PAD.b;
  let body = `<line x1="${PAD.l}" y1="${H - PAD.b}" x2="${W - PAD.r}" y2="${H - PAD.b}" stroke="#888"/>`;
  body += `<text x="${PAD.l - 4}" y="${PAD.t + 4}" text-anchor="end" font-size="9" fill="#444">${f(vmax)}</text>`;
  series.forEach((s, si) => {
    if (s.pts.length === 0) return;
    const lo = Math.min(...s.pts.map((p) => p.shift));
    const hi = Math.max(...s.pts.map((p) => p.shift));
    const xs = hi - lo || 1;
    const coords = s.pts.map((p) => {
      const x = PAD.l + (s.pts.length === 1 ? plotW / 2 : (plotW * (p.shift - lo)) / xs);
      const y = PAD.t + plotH * (1 - (p.v - vmin) / vspan);
      return { x, y, p };
    });
    const color = COLORS[si % COLORS.length];
    body += `<polyline class="line" data-kind="${s.kind}" fill="none" stroke="${color}" stroke-width="2" points="${coords
      .map((c) => `${f(c.x)},${f(c.y)}`)
      .join(' ')}"/>`;
    for (const c of coords) {
      body += `<circle class="pt" cx="${f(c.x)}" cy="${f(c.y)}" r="3" fill="${color}"><title>${escapeSvg(
        `${s.kind} ${c.p.shift}: ${f(c.p.v)}`,
      )}</title></circle>`;
    }
    body += `<text x="${PAD.l + 60 * si}" y="${H - 8}" font-size="9" fill="${color}">${escapeSvg(s.kind)} (${f(lo)}..${f(hi)})</text>`;
  });
  return frame(title, body);
}
