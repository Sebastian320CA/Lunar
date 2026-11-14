import { APOLLO_SITE_IDS } from '@lunar/contracts';
import type { LunarSite, Program, Result } from '@lunar/contracts';
import { sanitizeName, sanitizeText, validateLat, validateLon } from '@lunar/security';

const PROGRAMS: readonly Program[] = ['apollo', 'clps', 'commercial', 'international', 'custom'];
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_SITES = 500;

type Fail = { ok: false; error: string };
const fail = (error: string): Fail => ({ ok: false, error });

function parseOne(raw: unknown, index: number): Result<LunarSite> {
  const at = `sitio ${index}`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(`${at}: debe ser un objeto.`);
  const r = raw as Record<string, unknown>;

  const id = r['id'];
  if (typeof id !== 'string' || !ID_PATTERN.test(id)) return fail(`${at}: id inválido.`);
  const program = r['program'];
  if (typeof program !== 'string' || !PROGRAMS.includes(program as Program)) {
    return fail(`${id}: programa inválido.`);
  }
  if (program === 'apollo' && !(APOLLO_SITE_IDS as readonly string[]).includes(id)) {
    return fail(`${id}: id Apollo no permitido.`);
  }
  const name = sanitizeName(r['name']);
  if (!name.ok || name.value === '') return fail(`${id}: nombre inválido.`);
  const source = sanitizeText(r['source'], 512);
  if (!source.ok || source.value === '') return fail(`${id}: fuente inválida.`);
  const lat = validateLat(r['latDeg']);
  if (!lat.ok) return fail(`${id}: ${lat.error}`);
  const lon = validateLon(r['lonDeg']);
  if (!lon.ok) return fail(`${id}: ${lon.error}`);
  if (lon.value !== r['lonDeg']) {
    return fail(`${id}: la longitud debe estar en forma canónica (-180, 180].`);
  }
  if (typeof r['verified'] !== 'boolean') return fail(`${id}: 'verified' debe ser booleano.`);

  const site: LunarSite = {
    id,
    name: name.value,
    program: program as Program,
    latDeg: lat.value,
    lonDeg: lon.value,
    source: source.value,
    verified: r['verified'],
  };
  const elev = r['elevM'];
  if (elev !== undefined) {
    if (typeof elev !== 'number' || !Number.isFinite(elev)) return fail(`${id}: elevM inválido.`);
    site.elevM = elev;
  }
  return { ok: true, value: site };
}

/** Valida el contenido de sites.json (arreglo de sitios). Nunca lanza. */
export function parseSites(json: unknown): Result<LunarSite[]> {
  if (!Array.isArray(json)) return fail('El catálogo debe ser un arreglo.');
  if (json.length > MAX_SITES) return fail('El catálogo excede el máximo de sitios.');
  const out: LunarSite[] = [];
  const seen = new Set<string>();
  for (const [i, raw] of json.entries()) {
    const one = parseOne(raw, i);
    if (!one.ok) return one;
    if (seen.has(one.value.id)) return fail(`${one.value.id}: id duplicado.`);
    seen.add(one.value.id);
    out.push(one.value);
  }
  return { ok: true, value: out };
}

export interface SitesLoadContext {
  dataUrl: (relativePath: string) => string | undefined;
}

/** Carga data/sites/sites.json mediante `ctx.dataUrl` (archivo local, sin red externa). */
export async function loadSites(
  ctx: SitesLoadContext,
  fetchFn: (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>> = (u) => fetch(u),
): Promise<Result<LunarSite[]>> {
  try {
    const url = ctx.dataUrl('sites/sites.json');
    if (!url) return fail('No se encontró data/sites/sites.json.');
    const res = await fetchFn(url);
    if (!res.ok) return fail(`No se pudo leer sites.json (HTTP ${res.status}).`);
    return parseSites(await res.json());
  } catch {
    return fail('No se pudo cargar el catálogo de sitios.');
  }
}
