import { registerPanelTab } from '@lunar/contracts';
import type { PanelContext } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';

type GameId = 'projectile' | 'blocks' | 'explorer';
const GAMES: readonly GameId[] = ['projectile', 'blocks', 'explorer'];
const LABELS: Record<GameId, string> = {
  projectile: 'Proyectil',
  blocks: 'Carga',
  explorer: 'Explorador',
};

interface Handle {
  destroy(): void;
}

/** Cada juego se carga con import() dinamico solo al elegirlo. */
async function mountGame(id: GameId, host: HTMLElement, ctx: WebContext, pc: PanelContext): Promise<Handle> {
  // Los servicios se resuelven al usarlos, no al montar.
  switch (id) {
    case 'projectile': {
      const { projectileGame } = await import('@lunar/edu-games');
      return projectileGame.mount(host, { compareEarth: true });
    }
    case 'blocks': {
      const { blocksGame } = await import('@lunar/edu-games');
      return blocksGame.mount(host);
    }
    case 'explorer': {
      const ephemeris = ctx.services.ephemeris;
      if (!ephemeris) throw new Error('Servicio de efemérides no disponible.');
      const { explorerGame } = await import('@lunar/edu-games');
      return explorerGame.mount(host, { ephemeris, site: pc.site, startUtc: pc.utc });
    }
  }
}

export const eduGamesModule: WebModule = {
  id: 'edu-games',
  setup(ctx: WebContext): void {
    registerPanelTab({
      id: 'edu-games',
      titleKey: 'games.title',
      mount(container, pc) {
        const bar = document.createElement('div');
        const host = document.createElement('div');
        container.append(bar, host);
        let current: Handle | undefined;
        let stale = { v: false };

        const select = (id: GameId): void => {
          stale.v = true;
          const mine = (stale = { v: false });
          current?.destroy();
          current = undefined;
          host.textContent = '';
          mountGame(id, host, ctx, pc).then(
            (h) => {
              if (mine.v) h.destroy();
              else current = h;
            },
            (err: unknown) => {
              if (!mine.v) host.textContent = err instanceof Error ? err.message : String(err);
            },
          );
        };

        for (const id of GAMES) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = ctx.services.i18n?.t(`games.${id}`) ?? LABELS[id];
          b.addEventListener('click', () => select(id));
          bar.append(b);
        }
        return () => {
          stale.v = true;
          current?.destroy();
          container.textContent = '';
        };
      },
    });
  },
};

export default eduGamesModule;
