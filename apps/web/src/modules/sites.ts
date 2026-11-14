import type { LunarSite } from '@lunar/contracts';
import { createTimeController, loadSites } from '@lunar/sites';
import type { WebContext, WebModule } from './context';

export const sitesModule: WebModule = {
  id: 'sites',
  async setup(ctx: WebContext): Promise<void> {
    const loaded = await loadSites(ctx);
    if (!loaded.ok) throw new Error(loaded.error);
    const sites: LunarSite[] = [...loaded.value];

    ctx.services.sites = {
      list: () => [...sites],
      add(site) {
        if (sites.some((s) => s.id === site.id)) {
          const i = sites.findIndex((s) => s.id === site.id);
          sites[i] = site;
        } else {
          sites.push(site);
        }
      },
    };

    // La efeméride se registra en otro módulo; se resuelve al usarla, no al montar.
    ctx.services.time = createTimeController(new Date().toISOString().replace(/\.\d+Z$/, 'Z'), {
      findEvents(site, startUtc, endUtc) {
        const eph = ctx.services.ephemeris;
        if (!eph) return Promise.reject(new Error('Servicio de efemérides no disponible.'));
        return eph.findEvents(site, startUtc, endUtc);
      },
    });
  },
};

export default sitesModule;
