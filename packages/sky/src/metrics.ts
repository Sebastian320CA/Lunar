import type { EphemerisService, Language, LunarSite, SiteMetrics, SkyState, TerrainService } from '@lunar/contracts';
import { validateUtc } from '@lunar/security';

export interface MetricsDeps {
  ephemeris: EphemerisService;
  terrain: TerrainService;
}

/** Racha mas larga de muestras consecutivas que cumplen `pred`, en numero de muestras. */
function longestRun(series: readonly SkyState[], pred: (s: SkyState) => boolean): number {
  let best = 0;
  let cur = 0;
  for (const s of series) {
    if (pred(s)) {
      cur += 1;
      if (cur > best) best = cur;
    } else {
      cur = 0;
    }
  }
  return best;
}

function fraction(series: readonly SkyState[], pred: (s: SkyState) => boolean): number {
  if (series.length === 0) return 0;
  let n = 0;
  for (const s of series) if (pred(s)) n += 1;
  return n / series.length;
}

/**
 * Calcula las metricas de un sitio a partir de `getSeries` y del perfil de horizonte.
 * Rechaza con Error si el intervalo o el paso no son validos.
 */
export async function computeSiteMetrics(
  deps: MetricsDeps,
  site: LunarSite,
  startUtc: string,
  endUtc: string,
  stepMin: number,
): Promise<SiteMetrics> {
  const start = validateUtc(startUtc);
  if (!start.ok) throw new Error(`startUtc: ${start.error}`);
  const end = validateUtc(endUtc);
  if (!end.ok) throw new Error(`endUtc: ${end.error}`);
  if (end.value < start.value) throw new Error('endUtc: no puede ser anterior a startUtc.');
  if (!Number.isFinite(stepMin) || stepMin <= 0) throw new Error('stepMin: debe ser un numero mayor que 0.');

  const [series, horizon] = await Promise.all([
    deps.ephemeris.getSeries(site, start.value, end.value, stepMin),
    deps.terrain.getHorizon(site),
  ]);

  const hoursPerSample = stepMin / 60;
  const lit = (s: SkyState): boolean => s.sun.aboveTerrainHorizon;
  const comms = (s: SkyState): boolean => s.directCommsAvailable;

  let maxSun = series.length === 0 ? 0 : -90;
  for (const s of series) if (s.sun.elevationDeg > maxSun) maxSun = s.sun.elevationDeg;

  return {
    maxSunElevationDeg: Math.min(90, Math.max(-90, maxSun)),
    sunlitFraction: fraction(series, lit),
    longestLightHours: longestRun(series, lit) * hoursPerSample,
    longestDarkHours: longestRun(series, (s) => !lit(s)) * hoursPerSample,
    earthVisibleFraction: fraction(series, (s) => s.earth.aboveTerrainHorizon),
    longestCommsWindowHours: longestRun(series, comms) * hoursPerSample,
    longestCommsGapHours: longestRun(series, (s) => !comms(s)) * hoursPerSample,
    demResolutionM: horizon.demResolutionM,
  };
}

/** Texto de incertidumbre ligado a la resolucion del DEM. 'es' o 'en' (otro idioma usa 'en'). */
export function uncertaintyText(demResolutionM: number, lang: Language): string {
  const valid = Number.isFinite(demResolutionM) && demResolutionM > 0;
  const res = valid ? String(Math.round(demResolutionM * 10) / 10) : '?';
  // Centinela del horizonte esferico de respaldo (radio lunar, sin DEM): ver docs/INTEGRACION.md.
  if (valid && demResolutionM >= 1_000_000) {
    return lang.toLowerCase().startsWith('es')
      ? 'Sin modelo de terreno (DEM PENDIENTE): se usa un horizonte esférico ideal a 0°. Montañas y cráteres cercanos pueden adelantar la puesta o retrasar la salida del Sol y de la Tierra.'
      : 'No terrain model (DEM PENDING): an ideal spherical horizon at 0° is used. Nearby mountains and craters can make the Sun and Earth set earlier or rise later.';
  }
  if (lang.toLowerCase().startsWith('es')) {
    return valid
      ? `El horizonte se calcula con un modelo de terreno de ${res} m por pixel. Rasgos menores que eso no se ven, así que las horas de luz y de comunicación son aproximadas.`
      : 'La resolución del modelo de terreno es desconocida; las horas de luz y de comunicación son aproximadas.';
  }
  return valid
    ? `The horizon is computed from a terrain model of ${res} m per pixel. Features smaller than that are not captured, so light and communication hours are approximate.`
    : 'The terrain model resolution is unknown; light and communication hours are approximate.';
}
