import { createContext, type WebContext, type WebModule } from './modules/context';
import { showErrorScreen } from './shell/errorScreen';
import { mountShell } from './shell';

type Loader = () => Promise<{ default: WebModule }>;

/**
 * Modulos en orden de dependencia. `sites` crea el TimeController que lee `scene3d`,
 * por eso va antes; el resto de servicios se resuelven de forma perezosa.
 */
const MODULES: ReadonlyArray<readonly [string, Loader]> = [
  ['i18n', () => import('./modules/i18n')],
  ['ui', () => import('./modules/ui')],
  ['ephemeris', () => import('./modules/ephemeris')],
  ['terrain', () => import('./modules/terrain')],
  ['sites', () => import('./modules/sites')],
  ['scene3d', () => import('./modules/scene3d')],
  ['sky', () => import('./modules/sky')],
  ['energy', () => import('./modules/energy')],
  ['compare', () => import('./modules/compare')],
  ['solarView', () => import('./modules/solar-view')],
  ['export', () => import('./modules/export')],
  ['edu', () => import('./modules/edu')],
  ['edu-games', () => import('./modules/edu-games')],
];

/** Contenedor de errores fuera de #app: el Shell vacia #app al montarse. */
function errorHost(): HTMLElement {
  let host = document.getElementById('module-errors');
  if (!host) {
    host = document.createElement('div');
    host.id = 'module-errors';
    host.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:1000;max-width:24rem;';
    document.body.append(host);
  }
  return host;
}

async function loadModule(ctx: WebContext, name: string, load: Loader): Promise<void> {
  const host = errorHost();
  let slot = host.querySelector<HTMLElement>(`[data-module="${name}"]`);
  try {
    const mod = await load();
    await mod.default.setup(ctx);
    slot?.remove();
  } catch (error) {
    if (!slot) {
      slot = document.createElement('div');
      slot.dataset.module = name;
      host.append(slot);
    }
    const target = slot;
    showErrorScreen(target, {
      module: name,
      error,
      onRetry: () => {
        void loadModule(ctx, name, load);
      },
    });
  }
}

async function loadManifest(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as unknown) : {};
  } catch {
    return {};
  }
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) throw new Error('Falta el elemento #app.');
  const ctx = createContext({ demo: __LUNAR_DEMO__ });
  for (const [name, load] of MODULES) {
    await loadModule(ctx, name, load);
  }
  const manifest = await loadManifest(ctx.assetUrl('manifest.json'));
  mountShell(root, ctx, { manifest });
}

bootstrap().catch((error: unknown) => {
  const root = document.getElementById('app') ?? document.body;
  showErrorScreen(root, { module: 'shell', error, onRetry: () => location.reload() });
});
