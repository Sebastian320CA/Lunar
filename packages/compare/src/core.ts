import type { LunarSite, Result, SiteMetrics } from '@lunar/contracts';

export const MAX_SCENARIOS = 3;
/** Radio medio lunar en km (IAU, 1737.4). Usado solo para convertir km a grados de latitud. */
const MOON_RADIUS_KM = 1737.4;
const DAY_MS = 86_400_000;

export interface Scenario {
  siteId: string;
  /** UTC ISO 8601. */
  utcStart: string;
  /** UTC ISO 8601. */
  utcEnd: string;
}

export type ScenarioMetricsFn = (scenario: Scenario) => Promise<SiteMetrics>;
export type SiteMetricsFn = (site: LunarSite, utcStart: string, utcEnd: string) => Promise<SiteMetrics>;

/** Agrega un escenario sin mutar la lista. Maximo 3. */
export function addScenario(list: readonly Scenario[], scenario: Scenario): Result<Scenario[]> {
  if (list.length >= MAX_SCENARIOS) {
    return { ok: false, error: `Maximo ${MAX_SCENARIOS} escenarios` };
  }
  return { ok: true, value: [...list, { ...scenario }] };
}

export interface ComparisonRow {
  scenario: Scenario;
  metrics: SiteMetrics;
}

export interface Comparison {
  /** Lado a lado: mismo orden en que se agregaron los escenarios. */
  sideBySide: ComparisonRow[];
  /** Secuencial: ordenado por utcStart ascendente (estable). */
  sequential: ComparisonRow[];
}

export async function compareMetrics(
  scenarios: readonly Scenario[],
  metricsFn: ScenarioMetricsFn,
): Promise<Comparison> {
  const sideBySide: ComparisonRow[] = [];
  for (const scenario of scenarios) {
    sideBySide.push({ scenario, metrics: await metricsFn(scenario) });
  }
  const sequential = sideBySide
    .map((row, i) => ({ row, i }))
    .sort((a, b) => Date.parse(a.row.scenario.utcStart) - Date.parse(b.row.scenario.utcStart) || a.i - b.i)
    .map((x) => x.row);
  return { sideBySide, sequential };
}

export interface ViabilityWeights {
  sunlit: number;
  longestLight: number;
  earthVisible: number;
  commsWindow: number;
  /** Penaliza huecos de comunicacion largos. */
  commsGap: number;
  /** Penaliza noches largas. */
  longestDark: number;
}

/** Pesos por defecto, visibles y ajustables por el usuario. */
export const DEFAULT_WEIGHTS: Readonly<ViabilityWeights> = Object.freeze({
  sunlit: 3,
  longestLight: 1,
  earthVisible: 3,
  commsWindow: 1,
  commsGap: 1,
  longestDark: 1,
});

export interface ViabilityBreakdownItem {
  key: keyof ViabilityWeights;
  /** Valor normalizado 0..1 (1 = mejor). */
  normalized: number;
  weight: number;
  /** Aporte al indice, 0..100. */
  contribution: number;
}

export interface ViabilityResult {
  /** 0..100. */
  score: number;
  breakdown: ViabilityBreakdownItem[];
}

const clamp01 = (x: number): number => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);

/**
 * Indice transparente: promedio ponderado de componentes normalizados a 0..1.
 * Las horas se normalizan contra la duracion del intervalo (`intervalHours`, por defecto 720 h).
 * Pesos negativos o no finitos se tratan como 0; si todos son 0 el indice es 0.
 */
export function viabilityIndex(
  metrics: SiteMetrics,
  weights: Partial<ViabilityWeights> = {},
  intervalHours = 720,
): ViabilityResult {
  const w: ViabilityWeights = { ...DEFAULT_WEIGHTS, ...weights };
  const span = intervalHours > 0 ? intervalHours : 720;
  const norm: Record<keyof ViabilityWeights, number> = {
    sunlit: clamp01(metrics.sunlitFraction),
    longestLight: clamp01(metrics.longestLightHours / span),
    earthVisible: clamp01(metrics.earthVisibleFraction),
    commsWindow: clamp01(metrics.longestCommsWindowHours / span),
    commsGap: 1 - clamp01(metrics.longestCommsGapHours / span),
    longestDark: 1 - clamp01(metrics.longestDarkHours / span),
  };
  const keys = Object.keys(norm) as (keyof ViabilityWeights)[];
  const eff = (k: keyof ViabilityWeights): number => (Number.isFinite(w[k]) && w[k] > 0 ? w[k] : 0);
  const total = keys.reduce((s, k) => s + eff(k), 0);
  const breakdown = keys.map((key) => ({
    key,
    normalized: norm[key],
    weight: eff(key),
    contribution: total > 0 ? (100 * eff(key) * norm[key]) / total : 0,
  }));
  const score = breakdown.reduce((s, b) => s + b.contribution, 0);
  return { score, breakdown };
}

export interface SensitivityEntry {
  kind: 'base' | 'km' | 'days';
  /** Desplazamiento aplicado (0 para base). */
  shift: number;
  site: LunarSite;
  utcStart: string;
  utcEnd: string;
  metrics: SiteMetrics;
}

function shiftSite(site: LunarSite, km: number): LunarSite {
  const dLat = (km / MOON_RADIUS_KM) * (180 / Math.PI);
  const latDeg = Math.max(-90, Math.min(90, site.latDeg + dLat));
  return { ...site, latDeg, id: `${site.id}@${km}km`, verified: false };
}

function shiftUtc(utc: string, days: number): string {
  return new Date(Date.parse(utc) + days * DAY_MS).toISOString();
}

/**
 * Vista "por que cambia tanto": calcula la base, luego cada desplazamiento en km
 * (hacia el norte; negativo = sur) y luego cada desplazamiento en dias, en el orden recibido.
 */
export async function sensitivity(
  site: LunarSite,
  shiftsKm: readonly number[],
  shiftsDays: readonly number[],
  metricsFn: SiteMetricsFn,
  interval: { utcStart: string; utcEnd: string },
): Promise<SensitivityEntry[]> {
  const { utcStart, utcEnd } = interval;
  const out: SensitivityEntry[] = [];
  out.push({ kind: 'base', shift: 0, site, utcStart, utcEnd, metrics: await metricsFn(site, utcStart, utcEnd) });
  for (const km of shiftsKm) {
    const s = shiftSite(site, km);
    out.push({ kind: 'km', shift: km, site: s, utcStart, utcEnd, metrics: await metricsFn(s, utcStart, utcEnd) });
  }
  for (const d of shiftsDays) {
    const a = shiftUtc(utcStart, d);
    const b = shiftUtc(utcEnd, d);
    out.push({ kind: 'days', shift: d, site, utcStart: a, utcEnd: b, metrics: await metricsFn(site, a, b) });
  }
  return out;
}
