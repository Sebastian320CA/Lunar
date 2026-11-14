import { registerPanelTab } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';

/** El paquete @lunar/edu se carga con import() dinamico al abrir la pestana. */
export const eduModule: WebModule = {
  id: 'edu',
  setup(ctx: WebContext): void {
    registerPanelTab({
      id: 'edu',
      titleKey: 'edu.title',
      mount(container) {
        let stale = false;
        let destroy: (() => void) | undefined;
        import('@lunar/edu').then(
          (edu) => {
            if (stale) return;
            destroy = edu.mountTriviaView(container, { lang: ctx.services.i18n?.t('edu.lang') === 'en' ? 'en' : 'es' }).destroy;
          },
          (err: unknown) => {
            if (!stale) container.textContent = err instanceof Error ? err.message : String(err);
          },
        );
        return () => {
          stale = true;
          destroy?.();
          container.textContent = '';
        };
      },
    });
  },
};

export default eduModule;
