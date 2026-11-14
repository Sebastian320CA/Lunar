import type {
  EphemerisService,
  HorizonProfile,
  LunarSite,
  SkyEvent,
  SkyEventType,
  SkyState,
  TerrainService,
} from '@lunar/contracts';
import { ANALYTIC_NOTE, AnalyticSource } from './analytic.js';
import { BinarySource } from './binary.js';
import { EARTH_RADIUS_KM, SUN_RADIUS_KM, angularRadiusDeg, toAzEl } from './geometry.js';
import type { VectorSource } from './source.js';

/**
 * Servicio de efemerides.
 * - Elevacion reportada (`elevationDeg`): centro del disco. `aboveTerrainHorizon` y los eventos
 *   (salida/puesta) usan el BORDE SUPERIOR: elevacion del centro + radio angular aparente. Sin refraccion.
 * - `directCommsAvailable` = la Tierra (borde superior) sobre el horizonte del terreno.
 * - Horizonte inyectable: funcion `horizonElevationAt(azimuthDeg)` o un `TerrainService` (perfil por sitio).
 * - UTC se valida con un validador local equivalente a `validateUtc` de @lunar/security
 *   (el paquete no declara esa dependencia; PENDIENTE: sustituir al agregarla).
 */

/** Funcion de horizonte: elevacion del terreno (grados) para un azimut (grados). */
export type HorizonFn = (azimuthDeg: number) => number;

const SCAN_STEP_MS = 10 * 60000;
const BISECT_ITERATIONS = 40;
const MAX_SERIES_POINTS = 1_000_000;

const UTC_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

function parseUtc(input: unknown, name: string): number {
  if (typeof input === 'string' && input.length <= 64) {
    const m = UTC_RE.exec(input);
    if (m !== null) {
      const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [
        number, number, number, number, number, number,
      ];
      const ms = Date.UTC(y, mo - 1, d, h, mi, s);
      const back = new Date(ms);
      if (
        y >= 1 && h <= 23 && mi <= 59 && s <= 59 &&
        back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d
      ) {
        return ms;
      }
    }
  }
  throw new Error(`${name}: invalid UTC ISO 8601 string (expected YYYY-MM-DDThh:mm:ssZ)`);
}

function formatUtc(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function checkSite(site: LunarSite): void {
  if (
    typeof site !== 'object' || site === null ||
    !Number.isFinite(site.latDeg) || Math.abs(site.latDeg) > 90 ||
    !Number.isFinite(site.lonDeg) || Math.abs(site.lonDeg) > 180
  ) {
    throw new Error('site: invalid latDeg/lonDeg');
  }
}

/** Interpola (lineal, circular) un perfil de horizonte en el azimut dado. */
export function horizonFromProfile(profile: HorizonProfile): HorizonFn {
  const n = profile.elevationDeg.length;
  const step = profile.azimuthStepDeg;
  if (!(n >= 1) || !(step > 0) || Math.abs(n * step - 360) > 1e-6) {
    throw new Error('horizon profile: length must equal 360 / azimuthStepDeg');
  }
  const el = Float64Array.from(profile.elevationDeg);
  return (az: number): number => {
    const pos = (((az % 360) + 360) % 360) / step;
    const i = Math.floor(pos);
    const f = pos - i;
    const a = el[i % n] as number;
    const b = el[(i + 1) % n] as number;
    return a + (b - a) * f;
  };
}

const FLAT_HORIZON: HorizonFn = () => 0;

/** Valores calculados para un instante; escritos en un buffer reutilizable. */
interface Scratch {
  v: Float64Array; // sun xyz, earth xyz
  ae: Float64Array; // az, el
  /** [sunAz, sunEl, sunUpper, earthAz, earthEl, earthUpper] */
  r: Float64Array;
}

function newScratch(): Scratch {
  return { v: new Float64Array(6), ae: new Float64Array(2), r: new Float64Array(6) };
}

function compute(source: VectorSource, site: LunarSite, ms: number, s: Scratch): void {
  const { v, ae, r } = s;
  source.sunEarth(ms, v);
  const [sx, sy, sz, ex, ey, ez] = v as unknown as [number, number, number, number, number, number];
  toAzEl(sx, sy, sz, site.latDeg, site.lonDeg, ae);
  r[0] = ae[0] as number;
  r[1] = ae[1] as number;
  r[2] = r[1] + angularRadiusDeg(SUN_RADIUS_KM, Math.hypot(sx, sy, sz));
  toAzEl(ex, ey, ez, site.latDeg, site.lonDeg, ae);
  r[3] = ae[0] as number;
  r[4] = ae[1] as number;
  r[5] = r[4] + angularRadiusDeg(EARTH_RADIUS_KM, Math.hypot(ex, ey, ez));
}

/** Margen del borde superior sobre el horizonte (grados). >= 0 significa visible. */
function margin(r: Float64Array, body: 'sun' | 'earth', h: HorizonFn): number {
  return body === 'sun' ? (r[2] as number) - h(r[0] as number) : (r[5] as number) - h(r[3] as number);
}

function toSky(utcMs: number, r: Float64Array, h: HorizonFn): SkyState {
  const sunUp = margin(r, 'sun', h) >= 0;
  const earthUp = margin(r, 'earth', h) >= 0;
  return {
    utc: formatUtc(utcMs),
    sun: { azimuthDeg: r[0] as number, elevationDeg: r[1] as number, aboveTerrainHorizon: sunUp },
    earth: { azimuthDeg: r[3] as number, elevationDeg: r[4] as number, aboveTerrainHorizon: earthUp },
    directCommsAvailable: earthUp,
  };
}

function isTerrainService(x: unknown): x is TerrainService {
  return typeof x === 'object' && x !== null && typeof (x as TerrainService).getHorizon === 'function';
}

/**
 * Crea el servicio. `horizon` puede ser una funcion `horizonElevationAt(az)` (por defecto 0),
 * o un `TerrainService` inyectado (perfil por sitio, en cache).
 */
export function createEphemerisService(
  source: VectorSource,
  horizon?: HorizonFn | TerrainService,
): EphemerisService {
  const cache = new Map<string, Promise<HorizonFn>>();

  async function horizonFor(site: LunarSite): Promise<HorizonFn> {
    if (horizon === undefined) return FLAT_HORIZON;
    if (!isTerrainService(horizon)) return horizon;
    let p = cache.get(site.id);
    if (p === undefined) {
      p = horizon.getHorizon(site).then(horizonFromProfile);
      cache.set(site.id, p);
      p.catch(() => cache.delete(site.id));
    }
    return p;
  }

  const sample = (site: LunarSite, ms: number, s: Scratch): void => {
    try {
      compute(source, site, ms, s);
    } catch (e) {
      if (e instanceof RangeError) throw new Error(`utc: outside ephemeris coverage (${e.message})`);
      throw e;
    }
  };

  return {
    async getSky(site, utc) {
      checkSite(site);
      const ms = parseUtc(utc, 'utc');
      const h = await horizonFor(site);
      const s = newScratch();
      sample(site, ms, s);
      return toSky(ms, s.r, h);
    },

    async getSeries(site, startUtc, endUtc, stepMin) {
      checkSite(site);
      const a = parseUtc(startUtc, 'startUtc');
      const b = parseUtc(endUtc, 'endUtc');
      if (b < a) throw new Error('endUtc: must not be before startUtc');
      if (!Number.isFinite(stepMin) || stepMin <= 0) throw new Error('stepMin: must be a positive number');
      const stepMs = stepMin * 60000;
      const count = Math.floor((b - a) / stepMs) + 1;
      if (count > MAX_SERIES_POINTS) throw new Error('stepMin: too many points requested');
      const h = await horizonFor(site);
      const s = newScratch();
      const out: SkyState[] = new Array<SkyState>(count);
      for (let i = 0; i < count; i++) {
        const t = a + i * stepMs;
        sample(site, t, s);
        out[i] = toSky(t, s.r, h);
      }
      return out;
    },

    async findEvents(site, startUtc, endUtc) {
      checkSite(site);
      const a = parseUtc(startUtc, 'startUtc');
      const b = parseUtc(endUtc, 'endUtc');
      if (b < a) throw new Error('endUtc: must not be before startUtc');
      const h = await horizonFor(site);
      const s = newScratch();
      const bodies = ['sun', 'earth'] as const;
      const events: { ms: number; type: SkyEventType }[] = [];

      const m0 = (body: 'sun' | 'earth', t: number): number => {
        sample(site, t, s);
        return margin(s.r, body, h);
      };

      for (const body of bodies) {
        let tPrev = a;
        let upPrev = m0(body, a) >= 0;
        while (tPrev < b) {
          const tNext = Math.min(tPrev + SCAN_STEP_MS, b);
          const upNext = m0(body, tNext) >= 0;
          if (upNext !== upPrev) {
            // Biseccion: lo mantiene el estado previo, hi el estado nuevo.
            let lo = tPrev;
            let hi = tNext;
            for (let k = 0; k < BISECT_ITERATIONS && hi - lo > 1; k++) {
              const mid = Math.floor((lo + hi) / 2);
              if (m0(body, mid) >= 0 === upPrev) lo = mid;
              else hi = mid;
            }
            const ms = Math.round(hi / 1000) * 1000;
            if (ms >= a && ms < b) {
              events.push({ ms, type: (body === 'sun' ? (upNext ? 'sunrise' : 'sunset') : upNext ? 'earthrise' : 'earthset') });
            }
          }
          tPrev = tNext;
          upPrev = upNext;
        }
      }
      events.sort((x, y) => x.ms - y.ms);
      return events.map((e): SkyEvent => ({ type: e.type, utc: formatUtc(e.ms) }));
    },
  };
}

/** Metadatos de la fuente de efemerides, para mostrar en la UI. */
export interface EphemerisMeta {
  /** 'spice' = binario generado con SPICE (DE440); 'analytic' = Meeus aproximado. */
  source: 'spice' | 'analytic';
  approximate: boolean;
  note: string;
}

export const SPICE_NOTE =
  'Efemerides precalculadas con SPICE (DE440s, marco Luna fija Mean Earth) e interpolacion de Lagrange de 4 puntos. ' +
  'PENDIENTE: error frente a Horizons hasta ejecutar compare_horizons.py.';

/** Indica si `source` es la fuente binaria (SPICE) o la analitica aproximada. */
export function getEphemerisMeta(source: VectorSource): EphemerisMeta {
  if (source instanceof BinarySource) return { source: 'spice', approximate: false, note: SPICE_NOTE };
  const note = source instanceof AnalyticSource ? source.note : ANALYTIC_NOTE;
  return { source: 'analytic', approximate: true, note };
}
