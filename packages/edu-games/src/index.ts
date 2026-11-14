import type { EphemerisService, LunarSite } from '@lunar/contracts';
import { mountBlocksGame } from './blocks.js';
import type { BlocksGameHandle } from './blocks.js';
import { mountExplorerGame } from './explorer.js';
import type { ExplorerGameHandle, ExplorerParams } from './explorer.js';
import { mountProjectileGame } from './projectile.js';
import type { ProjectileGameHandle, ProjectileGameOptions } from './projectile.js';

/** Independent entry point of each minigame. */
export const projectileGame = {
  id: 'projectile',
  mount: (container: HTMLElement, options?: ProjectileGameOptions): ProjectileGameHandle =>
    mountProjectileGame(container, options),
};

export const blocksGame = {
  id: 'blocks',
  mount: (container: HTMLElement): BlocksGameHandle => mountBlocksGame(container),
};

export interface ExplorerMountOptions {
  ephemeris: EphemerisService;
  site: LunarSite;
  startUtc: string;
  simMinPerS?: number;
  params?: ExplorerParams;
}

export const explorerGame = {
  id: 'explorer',
  mount: (container: HTMLElement, options: ExplorerMountOptions): ExplorerGameHandle =>
    mountExplorerGame(container, options),
};

export type { ProjectileGameHandle, ProjectileGameOptions, BlocksGameHandle, ExplorerGameHandle, ExplorerParams };
