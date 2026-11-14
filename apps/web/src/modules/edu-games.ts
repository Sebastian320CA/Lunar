import { registerPanelTab } from '@lunar/contracts';
import type { PanelContext } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';
import { icon, type IconName } from '../shell/icons';

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

/** Botones en pantalla (raton o tactil) que envian al lienzo las mismas teclas que el teclado. */
const CONTROLS: Record<GameId, ReadonlyArray<readonly [string, IconName | string]>> = {
  projectile: [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowUp', 'up'], ['ArrowDown', 'down'], [' ', 'fire'], ['e', 'E'], ['l', 'L']],
  blocks: [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['ArrowDown', 'down'], ['x', 'rotate'], [' ', 'drop'], ['r', 'R'], ['l', 'L']],
  explorer: [['ArrowLeft', 'left'], ['ArrowRight', 'right'], ['r', 'R'], ['l', 'L']],
};

function mountControls(host: HTMLElement, id: GameId, target: () => HTMLElement | null): void {
  const row = document.createElement('div');
  row.className = 'ln-game-controls';
  for (const [key, label] of CONTROLS[id]) {
    const b = document.createElement('button');
    b.type = 'button';
    if (label.length > 1) b.append(icon(label as IconName));
    else b.textContent = label;
    b.setAttribute('aria-label', key === ' ' ? 'Space' : key);
    const send = (type: 'keydown' | 'keyup'): void => {
      target()?.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, cancelable: true }));
    };
    let held = false;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      held = true;
      send('keydown');
    });
    const release = (): void => {
      if (!held) return;
      held = false;
      send('keyup');
    };
    b.addEventListener('pointerup', release);
    b.addEventListener('pointerleave', release);
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        send('keydown');
        send('keyup');
      }
    });
    row.append(b);
  }
  host.append(row);
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
        bar.className = 'ln-segmented';
        bar.setAttribute('role', 'group');
        const host = document.createElement('div');
        host.className = 'ln-game-host';
        const buttons = new Map<GameId, HTMLButtonElement>();
        container.append(bar, host);
        let current: Handle | undefined;
        let stale = { v: false };

        const select = (id: GameId): void => {
          stale.v = true;
          const mine = (stale = { v: false });
          current?.destroy();
          current = undefined;
          host.textContent = '';
          for (const [g, b] of buttons) b.setAttribute('aria-pressed', String(g === id));
          mountGame(id, host, ctx, pc).then(
            (h) => {
              if (mine.v) {
                h.destroy();
                return;
              }
              current = h;
              mountControls(host, id, () => host.querySelector<HTMLElement>('canvas'));
              // El juego escucha el teclado: se enfoca su lienzo (o el primer elemento enfocable).
              const target = host.querySelector<HTMLElement>('canvas, [tabindex]');
              if (target) {
                if (target.tabIndex < 0) target.tabIndex = 0;
                target.focus({ preventScroll: true });
              }
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
          buttons.set(id, b);
          bar.append(b);
        }
        select('projectile');
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
