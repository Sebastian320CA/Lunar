import { registerPanelTab } from '@lunar/contracts';
import { computeSiteMetrics, createSkyTab } from '@lunar/sky';
import type { WebContext, WebModule } from './context';

export const skyModule: WebModule = {
  id: 'sky',
  setup(ctx: WebContext): void {
    // Los servicios se resuelven al usarlos, no al montar: el orden de registro no importa.
    ctx.services.metrics = (site, startUtc, endUtc, stepMin) => {
      const ephemeris = ctx.services.ephemeris;
      const terrain = ctx.services.terrain;
      if (!ephemeris) return Promise.reject(new Error('Servicio de efemérides no disponible.'));
      if (!terrain) return Promise.reject(new Error('Servicio de terreno no disponible.'));
      return computeSiteMetrics({ ephemeris, terrain }, site, startUtc, endUtc, stepMin);
    };
    const need = <T>(v: T | undefined, name: string): T => {
      if (v === undefined) throw new Error(`Servicio de ${name} no disponible.`);
      return v;
    };
    registerPanelTab(
      createSkyTab({
        getSky: (site, utc) => Promise.resolve().then(() => need(ctx.services.ephemeris, 'efemérides').getSky(site, utc)),
        findEvents: (site, s, e) => Promise.resolve().then(() => need(ctx.services.ephemeris, 'efemérides').findEvents(site, s, e)),
        getHorizon: (site) => Promise.resolve().then(() => need(ctx.services.terrain, 'terreno').getHorizon(site)),
        getMetrics: (site, s, e, step) => Promise.resolve().then(() => need(ctx.services.metrics, 'métricas')(site, s, e, step)),
        time: () => ctx.services.time,
        ephemerisMeta: () => ctx.services.ephemerisMeta,
        t: (key) => ctx.services.i18n?.t(key) ?? key,
        lang: () => ctx.services.i18n?.getLanguage?.() ?? 'es',
      }),
    );
  },
};

export default skyModule;
