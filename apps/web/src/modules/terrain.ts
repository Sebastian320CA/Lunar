import type { HorizonProfile, LunarSite } from '@lunar/contracts';
import { createTerrainService, sphericalHorizon, validateProfile } from '@lunar/terrain';
import type { WebContext, WebModule } from './context';

async function loadProfile(ctx: WebContext, site: LunarSite): Promise<HorizonProfile> {
  const url = ctx.dataUrl(`terrain/${site.id}.json`);
  if (url) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const profile = (await res.json()) as HorizonProfile;
        if (validateProfile(profile) === null) return profile;
      }
    } catch {
      // Sin perfil utilizable: se usa el horizonte esferico.
    }
  }
  return sphericalHorizon(0);
}

export const terrainModule: WebModule = {
  id: 'terrain',
  setup(ctx: WebContext): void {
    ctx.services.terrain = createTerrainService((site) => loadProfile(ctx, site));
  },
};

export default terrainModule;
