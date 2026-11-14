import type { HorizonProfile, LunarSite, TerrainService } from '@lunar/contracts';
import {
  AnalyticSource,
  BinarySource,
  createEphemerisService,
  getEphemerisMeta,
  HybridSource,
  sunDirectionMoonFixed,
  type VectorSource,
} from '@lunar/ephemeris';
import type { WebContext, WebModule } from './context';

/** Carga ephemeris.json + ephemeris.bin (verifica tamano y sha256). Cualquier fallo devuelve null. */
async function loadBinary(ctx: WebContext): Promise<VectorSource | null> {
  const headerUrl = ctx.dataUrl('ephemeris/ephemeris.json');
  const binUrl = ctx.dataUrl('ephemeris/ephemeris.bin');
  if (!headerUrl || !binUrl) return null;
  try {
    const [h, b] = await Promise.all([fetch(headerUrl), fetch(binUrl)]);
    if (!h.ok || !b.ok) return null;
    return await BinarySource.create(await h.json(), await b.arrayBuffer());
  } catch {
    return null;
  }
}

export const ephemerisModule: WebModule = {
  id: 'ephemeris',
  async setup(ctx: WebContext): Promise<void> {
    const binary = await loadBinary(ctx);
    // Binario SPICE dentro de 2025-2030 y Meeus fuera de esa ventana; solo Meeus si falta el binario.
    const source: VectorSource = binary ? new HybridSource(binary, new AnalyticSource()) : new AnalyticSource();
    // El servicio de terreno puede registrarse despues: se consulta en cada llamada.
    const terrain: TerrainService = {
      getHorizon: (site: LunarSite): Promise<HorizonProfile> => {
        const t = ctx.services.terrain;
        if (!t) {
          return Promise.resolve({
            azimuthStepDeg: 1,
            elevationDeg: new Array<number>(360).fill(0),
            demResolutionM: 1,
            demSource: 'flat horizon (terrain service unavailable)',
          });
        }
        return t.getHorizon(site);
      },
    };
    ctx.services.ephemeris = createEphemerisService(source, terrain);
    ctx.services.sunDirection = (utc) => sunDirectionMoonFixed(source, utc);
    const out = new Float64Array(6);
    ctx.services.earthDirection = (utc) => {
      const ms = Date.parse(utc);
      if (!Number.isFinite(ms)) throw new RangeError(`UTC invalida: ${utc}`);
      source.sunEarth(ms, out);
      const x = out[3] as number;
      const y = out[4] as number;
      const z = out[5] as number;
      const n = Math.hypot(x, y, z);
      return { x: x / n, y: y / n, z: z / n };
    };
    ctx.services.ephemerisMeta = getEphemerisMeta(source);
  },
};

export default ephemerisModule;
