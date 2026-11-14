import type { BodyState, EnergyResult, SolarPanelViewApi } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';

/**
 * Devuelve de inmediato una vista que carga el código de Three.js bajo demanda.
 * Las llamadas previas a la carga se aplican al terminar: mount y el último update.
 */
function createLazyView(): SolarPanelViewApi {
  let inner: SolarPanelViewApi | undefined;
  let disposed = false;
  let container: HTMLElement | undefined;
  let last: { result: EnergyResult; sun: BodyState } | undefined;
  let started = false;

  const load = (): void => {
    if (started) return;
    started = true;
    import('@lunar/solar-view')
      .then(({ createSolarPanelView }) => {
        if (disposed) return;
        inner = createSolarPanelView();
        if (container) inner.mount(container);
        if (last) inner.update(last.result, last.sun);
      })
      .catch((err: unknown) => {
        console.error('[solar-view] no se pudo cargar la vista 3D del panel', err);
      });
  };

  return {
    mount(el) {
      if (disposed) return;
      container = el;
      if (inner) inner.mount(el);
      else load();
    },
    update(result, sun) {
      if (disposed) return;
      last = { result, sun };
      inner?.update(result, sun);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      inner?.dispose();
      inner = undefined;
      container = undefined;
      last = undefined;
    },
  };
}

export const solarViewModule: WebModule = {
  id: 'solarView',
  setup(ctx: WebContext): void {
    ctx.services.solarView = createLazyView;
  },
};

export default solarViewModule;
