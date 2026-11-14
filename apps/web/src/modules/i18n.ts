import { createLoadedI18n } from '@lunar/i18n';
import type { WebContext, WebModule } from './context';

export const i18nModule: WebModule = {
  id: 'i18n',
  setup(ctx: WebContext): void {
    // The scene is registered by another module; resolve it when the language changes.
    ctx.services.i18n = createLoadedI18n(() => ctx.services.scene);
  },
};

export default i18nModule;
