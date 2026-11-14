import type { EphemerisService, LunarSite, SkyState } from '@lunar/contracts';

const STORAGE_KEY = 'lunar-games.explorer.best';

/**
 * Game balance parameters. These are EDITABLE EXAMPLE values for gameplay,
 * not mission data (no real rover power budget is implied).
 */
export interface ExplorerParams {
  /** Maximum energy of the character (arbitrary units). */
  maxEnergy: number;
  /** Units per second recharged while the Sun is above the horizon. */
  sunChargePerS: number;
  /** Extra units per second while the Earth is visible (direct comms). */
  earthChargePerS: number;
  /** Units per second always consumed (electronics, heaters). */
  idleDrainPerS: number;
  /** Extra units per second consumed while moving. */
  moveDrainPerS: number;
  /** Tiles per second while moving. */
  speedTilesPerS: number;
  /** Points awarded per sample collected. */
  samplePoints: number;
}

export const DEFAULT_PARAMS: ExplorerParams = {
  maxEnergy: 100,
  sunChargePerS: 6,
  earthChargePerS: 2,
  idleDrainPerS: 1,
  moveDrainPerS: 3,
  speedTilesPerS: 4,
  samplePoints: 10,
};

export interface ExplorerState {
  x: number;
  energy: number;
  score: number;
  /** Samples still to be collected, as tile positions. */
  samples: number[];
  alive: boolean;
}

export const WORLD_TILES = 40;

export function createState(params: ExplorerParams = DEFAULT_PARAMS, samples: number[] = [8, 15, 23, 31, 38]): ExplorerState {
  return { x: 0, energy: params.maxEnergy / 2, score: 0, samples: [...samples], alive: true };
}

/** The Sun counts as visible only above the terrain horizon (no atmosphere, so no refraction). */
export function sunVisible(sky: SkyState): boolean {
  return sky.sun.aboveTerrainHorizon && sky.sun.elevationDeg > 0;
}

export function earthVisible(sky: SkyState): boolean {
  return sky.earth.aboveTerrainHorizon && sky.earth.elevationDeg > 0;
}

/** Net energy change per second for the given sky and movement. */
export function energyRate(sky: SkyState, moving: boolean, p: ExplorerParams = DEFAULT_PARAMS): number {
  let rate = -p.idleDrainPerS;
  if (moving) rate -= p.moveDrainPerS;
  if (sunVisible(sky)) rate += p.sunChargePerS;
  if (earthVisible(sky)) rate += p.earthChargePerS;
  return rate;
}

/**
 * Pure simulation step. `dir` is -1, 0 or 1. Moving stops when energy is 0.
 * The character is dead (game over) when energy reaches 0 while the net rate is not positive.
 */
export function stepExplorer(
  s: ExplorerState,
  sky: SkyState,
  dtS: number,
  dir: -1 | 0 | 1,
  p: ExplorerParams = DEFAULT_PARAMS,
): ExplorerState {
  if (!s.alive) return s;
  const moving = dir !== 0 && s.energy > 0;
  const energy = Math.min(p.maxEnergy, Math.max(0, s.energy + energyRate(sky, moving, p) * dtS));
  let x = s.x;
  if (moving) x = Math.min(WORLD_TILES, Math.max(0, x + dir * p.speedTilesPerS * dtS));
  const remaining = s.samples.filter((t) => Math.abs(t - x) >= 0.5);
  const collected = s.samples.length - remaining.length;
  const alive = energy > 0 || energyRate(sky, false, p) > 0;
  return { x, energy, score: s.score + collected * p.samplePoints, samples: remaining, alive };
}

export function loadBestScore(): number {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    const n = raw === null || raw === undefined ? 0 : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(score: number): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, String(Math.round(score)));
  } catch {
    /* storage unavailable: score is kept in memory only */
  }
}

/** Text for the "what you learned" screen. */
export const LEARNED_LINES: readonly string[] = [
  'Solar power only works while the Sun is above the local horizon (terrain included).',
  'Lunar nights are long: a lander needs stored energy or must stop and wait for the Sun.',
  'Direct radio contact with Earth needs the Earth above the horizon from the site.',
  'The Moon has no atmosphere, so the Sun and Earth appear with no refraction.',
  'Numbers in this game are editable examples, not real mission data.',
];

export interface ExplorerGameHandle {
  destroy(): void;
}

export interface ExplorerGameOptions {
  ephemeris: EphemerisService;
  site: LunarSite;
  /** Start of the simulated time, ISO 8601 UTC. */
  startUtc: string;
  /** Simulated minutes that pass per real second (editable example). */
  simMinPerS?: number;
  params?: ExplorerParams;
}

const W = 640;
const H = 320;

/** Mounts the game. Keys: arrows move, R restart, L learning screen. */
export function mountExplorerGame(container: HTMLElement, options: ExplorerGameOptions): ExplorerGameHandle {
  const params = options.params ?? DEFAULT_PARAMS;
  const simMinPerS = options.simMinPerS ?? 60;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Light-powered explorer game');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let state = createState(params);
  let best = loadBestScore();
  let simMs = Date.parse(options.startUtc);
  let sky: SkyState | null = null;
  let pending = false;
  let dir: -1 | 0 | 1 = 0;
  let showLearned = false;
  let raf = 0;
  let prev = 0;
  let destroyed = false;

  const refreshSky = (): void => {
    if (pending) return;
    pending = true;
    options.ephemeris
      .getSky(options.site, new Date(simMs).toISOString())
      .then((s) => {
        sky = s;
      })
      .catch(() => {
        /* keep the previous sky */
      })
      .finally(() => {
        pending = false;
      });
  };

  const onKeyDown = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowLeft':
        dir = -1;
        break;
      case 'ArrowRight':
        dir = 1;
        break;
      case 'r':
      case 'R':
        state = createState(params);
        break;
      case 'l':
      case 'L':
        showLearned = !showLearned;
        break;
      default:
        return;
    }
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    if ((e.key === 'ArrowLeft' && dir === -1) || (e.key === 'ArrowRight' && dir === 1)) dir = 0;
  };
  canvas.addEventListener('keydown', onKeyDown);
  canvas.addEventListener('keyup', onKeyUp);

  const draw = (): void => {
    if (!ctx) return;
    const sunUp = sky ? sunVisible(sky) : false;
    ctx.fillStyle = sunUp ? '#1b2233' : '#05070d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, H - 60, W, 60);
    const tile = W / WORLD_TILES;
    ctx.fillStyle = '#f0c040';
    for (const t of state.samples) ctx.fillRect(t * tile, H - 72, 8, 12);
    ctx.fillStyle = state.alive ? '#7fd1ff' : '#a04040';
    ctx.fillRect(state.x * tile, H - 84, 14, 24);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `Energy ${state.energy.toFixed(0)}/${params.maxEnergy}  Score ${state.score}  Best ${best}` +
        `  Sun ${sky ? (sunUp ? 'up' : 'down') : '?'}  Earth ${sky ? (earthVisible(sky) ? 'visible' : 'hidden') : '?'}`,
      8,
      16,
    );
    ctx.fillText('Arrows: move  R: restart  L: what you learned', 8, 32);
    if (!state.alive) ctx.fillText('Out of energy in the dark. Press R to restart.', 8, 48);
    else if (state.samples.length === 0) ctx.fillText('All samples collected! Press R to play again.', 8, 48);
    if (showLearned) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(20, 60, W - 40, H - 100);
      ctx.fillStyle = '#ffffff';
      LEARNED_LINES.forEach((line, i) => ctx.fillText(line, 30, 85 + i * 24));
    }
  };

  const frame = (now: number): void => {
    if (destroyed) return;
    const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
    prev = now;
    simMs += dt * simMinPerS * 60000;
    refreshSky();
    if (sky && state.alive && state.samples.length > 0) {
      state = stepExplorer(state, sky, dt, dir, params);
      if (state.score > best) {
        best = state.score;
        saveBestScore(best);
      }
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy(): void {
      destroyed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('keydown', onKeyDown);
      canvas.removeEventListener('keyup', onKeyUp);
      canvas.remove();
    },
  };
}
