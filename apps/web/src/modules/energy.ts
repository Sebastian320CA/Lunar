import { registerPanelTab } from '@lunar/contracts';
import { createEnergyTab } from '@lunar/energy';
import type { WebContext, WebModule } from './context';

export const energyModule: WebModule = {
  id: 'energy',
  setup(ctx: WebContext): void {
    // Los servicios se resuelven al usarlos, no al montar: el orden de registro no importa.
    registerPanelTab(
      createEnergyTab({
        getSeries(site, startUtc, endUtc, stepMin) {
          const eph = ctx.services.ephemeris;
          if (!eph) return Promise.reject(new Error('Servicio de efemérides no disponible.'));
          return eph.getSeries(site, startUtc, endUtc, stepMin);
        },
        solarView: () => {
          const factory = ctx.services.solarView;
          if (!factory) throw new Error('Vista 3D del panel no disponible.');
          return factory();
        },
        t: (key) => ctx.services.i18n?.t(key) ?? key,
      }),
    );
  },
};

export default energyModule;
