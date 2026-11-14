import type { HorizonProfile, SkyState } from '@lunar/contracts';
import { sanitizeText } from '@lunar/security';

export interface SkyDiagramInput {
  horizon: HorizonProfile;
  sky: SkyState;
  /** Lado del cuadrado en pixeles. */
  size: number;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Texto seguro: pasa por sanitizeText y se escapa para XML. */
function text(x: string): string {
  const r = sanitizeText(x, 200);
  return esc(r.ok ? r.value : '');
}

function num(n: number): string {
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toString() : '0';
}

/**
 * Diagrama del cielo local (SVG como cadena). Eje X: azimut 0..360 (N a N), eje Y: elevacion -10..90.
 * Todo texto pasa por `sanitizeText`; los numeros se formatean, nunca se interpolan cadenas externas.
 */
export function renderSkyDiagram(input: SkyDiagramInput): string {
  const size = Number.isFinite(input.size) && input.size > 0 ? Math.min(input.size, 4000) : 400;
  const w = size;
  const h = size / 2;
  const pad = size * 0.06;
  const minEl = -10;
  const maxEl = 90;
  const px = (az: number): number => pad + (((az % 360) + 360) % 360) / 360 * (w - 2 * pad);
  const py = (el: number): number => {
    const c = Math.max(minEl, Math.min(maxEl, el));
    return h - pad - ((c - minEl) / (maxEl - minEl)) * (h - 2 * pad);
  };
  const { horizon, sky } = input;
  const step = horizon.azimuthStepDeg > 0 ? horizon.azimuthStepDeg : 1;

  const pts: string[] = [`${num(px(0))},${num(h - pad)}`];
  horizon.elevationDeg.forEach((el, i) => {
    pts.push(`${num(pad + ((i * step) / 360) * (w - 2 * pad))},${num(py(el))}`);
  });
  pts.push(`${num(w - pad)},${num(h - pad)}`);

  const cardinals: Array<[string, number]> = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  const cardText = cardinals
    .map(([l, az]) => `<text data-cardinal="${l}" x="${num(px(az))}" y="${num(h - pad / 4)}" text-anchor="middle" font-size="${num(pad * 0.7)}">${text(l)}</text>`)
    .join('');

  const r = size * 0.025;
  const sun = `<circle data-body="sun" cx="${num(px(sky.sun.azimuthDeg))}" cy="${num(py(sky.sun.elevationDeg))}" r="${num(r)}" fill="#f5b700" stroke="#000" opacity="${sky.sun.aboveTerrainHorizon ? 1 : 0.4}"/>`;
  const earth = `<circle data-body="earth" cx="${num(px(sky.earth.azimuthDeg))}" cy="${num(py(sky.earth.elevationDeg))}" r="${num(r)}" fill="#2a6fdb" stroke="#000" opacity="${sky.earth.aboveTerrainHorizon ? 1 : 0.4}"/>`;
  const labels =
    `<text x="${num(px(sky.sun.azimuthDeg) + r * 1.5)}" y="${num(py(sky.sun.elevationDeg))}" font-size="${num(pad * 0.7)}">${text('Sun')}</text>` +
    `<text x="${num(px(sky.earth.azimuthDeg) + r * 1.5)}" y="${num(py(sky.earth.elevationDeg))}" font-size="${num(pad * 0.7)}">${text('Earth')}</text>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="0 0 ${num(w)} ${num(h)}" role="img" aria-label="${text('Sky diagram')}">` +
    `<rect width="${num(w)}" height="${num(h)}" fill="#0b0d17"/>` +
    `<line x1="${num(pad)}" y1="${num(py(0))}" x2="${num(w - pad)}" y2="${num(py(0))}" stroke="#667" stroke-dasharray="4 4"/>` +
    `<polygon data-role="terrain" points="${pts.join(' ')}" fill="#555" stroke="#aaa"/>` +
    sun +
    earth +
    labels +
    cardText +
    `</svg>`
  );
}
