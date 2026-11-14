import { registerPanelTab } from '@lunar/contracts';
import { createCompareTab } from '@lunar/compare';
import type { WebContext, WebModule } from './context';

export const compareModule: WebModule = {
  id: 'compare',
  setup(ctx: WebContext): void {
    // Los servicios se resuelven al usarlos, no al montar: el orden de registro no importa.
    registerPanelTab(
      createCompareTab({
        metrics(site, startUtc, endUtc, stepMin) {
          const fn = ctx.services.metrics;
          if (!fn) return Promise.reject(new Error('Servicio de metricas no disponible.'));
          return fn(site, startUtc, endUtc, stepMin);
        },
        sites: () => ctx.services.sites?.list() ?? [],
        t: (key) => ctx.services.i18n?.t(key) ?? key,
      }),
    );
  },
};

export default compareModule;
