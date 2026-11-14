import '@lunar/ui/src/design/tokens.css';
import { registerSummaryTab } from '@lunar/ui';
import type { WebContext, WebModule } from './context';

export const uiModule: WebModule = {
  id: 'ui',
  setup(ctx: WebContext): void {
    // Traducción diferida: se resuelve al renderizar, no al registrar.
    registerSummaryTab({
      t: (key: string) => ctx.services.i18n?.t(key) ?? key,
    } as Parameters<typeof registerSummaryTab>[0]);
  },
};

export default uiModule;
