import type { HorizonProfile, LunarSite, TerrainService } from '@lunar/contracts';
import {
  AnalyticSource,
  BinarySource,
  createEphemerisService,
  getEphemerisMeta,
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
    const source = (await loadBinary(ctx)) ?? new AnalyticSource();
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
    ctx.services.ephemerisMeta = getEphemerisMeta(source);
  },
};

export default ephemerisModule;
