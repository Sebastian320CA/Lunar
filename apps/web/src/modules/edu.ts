import { registerPanelTab } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';

type EduMode = 'trivia' | 'class' | 'calculator';
const MODES: readonly EduMode[] = ['trivia', 'class', 'calculator'];
const FALLBACK: Record<EduMode, string> = { trivia: 'Trivia', class: 'Modo clase', calculator: 'Modo calculadora' };

/** El paquete @lunar/edu se carga con import() dinamico al abrir la pestana. */
export const eduModule: WebModule = {
  id: 'edu',
  setup(ctx: WebContext): void {
    const t = (key: string, fallback: string): string => {
      const v = ctx.services.i18n?.t(key);
      return v && v !== key ? v : fallback;
    };
    const lang = (): 'es' | 'en' => (t('edu.lang', 'es') === 'en' ? 'en' : 'es');

    registerPanelTab({
      id: 'edu',
      titleKey: 'edu.title',
      mount(container) {
        let stale = false;
        let destroy: (() => void) | undefined;
        const bar = document.createElement('div');
        bar.className = 'ln-segmented';
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', t('edu.title', 'Trivia'));
        const host = document.createElement('div');
        host.className = 'ln-edu-host';
        container.append(bar, host);
        const buttons = new Map<EduMode, HTMLButtonElement>();

        const show = (mode: EduMode): void => {
          destroy?.();
          destroy = undefined;
          host.textContent = '';
          for (const [m, b] of buttons) b.setAttribute('aria-pressed', String(m === mode));
          import('@lunar/edu').then(
            (edu) => {
              if (stale) return;
              const seed = Math.floor(Math.random() * 1e9) + 1;
              if (mode === 'trivia') {
                destroy = edu.mountTriviaView(host, { lang: lang(), trivia: edu.createTrivia(undefined, seed) }).destroy;
              } else if (mode === 'calculator') {
                const h = edu.mountCalculatorMode(host, { lang: lang(), trivia: edu.createTrivia(undefined, seed) });
                h.el.tabIndex = 0;
                h.el.focus();
                destroy = h.destroy;
              } else {
                const api = edu.createClassSession({ name: t('edu.className', 'Clase: sitios de alunizaje') });
                const teacherHost = document.createElement('div');
                const projectorHost = document.createElement('div');
                projectorHost.className = 'ln-edu-projector';
                host.append(teacherHost, projectorHost);
                const projector = edu.mountProjectorView(projectorHost, api);
                const teacher = edu.mountTeacherPanel(teacherHost, api, { onChange: () => projector.refresh() });
                destroy = () => {
                  teacher.destroy();
                  projector.destroy();
                };
              }
            },
            (err: unknown) => {
              if (!stale) host.textContent = err instanceof Error ? err.message : String(err);
            },
          );
        };

        for (const m of MODES) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = t(`edu.mode.${m}`, FALLBACK[m]);
          b.addEventListener('click', () => show(m));
          buttons.set(m, b);
          bar.append(b);
        }
        show('trivia');

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
