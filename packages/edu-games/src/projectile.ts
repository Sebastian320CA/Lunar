import { GRAVITY_EARTH, GRAVITY_MOON, positionAt, range, flightTime, maxHeight } from './physics';

const STORAGE_KEY = 'lunar-games.projectile.best';

export interface ShotResult {
  targetHit: boolean;
  rangeM: number;
  score: number;
}

/** Score of a shot: 100 if the target is hit, minus 1 per metre of miss (min 0). */
export function scoreShot(rangeM: number, targetM: number, toleranceM: number): ShotResult {
  const miss = Math.abs(rangeM - targetM);
  const targetHit = miss <= toleranceM;
  const score = targetHit ? 100 : Math.max(0, Math.round(100 - miss));
  return { targetHit, rangeM, score };
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
  'On the Moon gravity is 1.62 m/s2, about 1/6 of Earth (9.80665 m/s2).',
  'With the same speed and angle, a projectile flies about 6 times farther and stays up about 6 times longer.',
  'The Moon has no atmosphere, so there is no air drag: the path is a parabola.',
  'The best angle for maximum range without drag is 45 degrees on both worlds.',
];

export interface ProjectileGameHandle {
  destroy(): void;
}

export interface ProjectileGameOptions {
  compareEarth?: boolean;
}

const W = 640;
const H = 320;
const SCALE = 0.5; // pixels per metre
const MARGIN = 30;

/** Mounts the game in `container`. Keys: arrows adjust, Space/Enter fire, E toggles Earth, L shows learning screen. */
export function mountProjectileGame(
  container: HTMLElement,
  options: ProjectileGameOptions = {},
): ProjectileGameHandle {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'Projectile launcher game');
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let speed = 40;
  let angle = 45;
  let compareEarth = options.compareEarth ?? false;
  let targetM = 200;
  let t = 0;
  let flying = false;
  let showLearned = false;
  let best = loadBestScore();
  let last: ShotResult | null = null;
  let raf = 0;
  let prev = 0;

  const newTarget = (): void => {
    targetM = Math.round(range(speed, 45, GRAVITY_MOON) * (0.4 + Math.random() * 0.6)) + 40;
  };

  const fire = (): void => {
    if (flying) return;
    t = 0;
    flying = true;
    last = null;
  };

  const land = (): void => {
    flying = false;
    const r = range(speed, angle, GRAVITY_MOON);
    last = scoreShot(r, targetM, 8);
    if (last.score > best) {
      best = last.score;
      saveBestScore(best);
    }
    if (last.targetHit) newTarget();
  };

  const onKey = (e: KeyboardEvent): void => {
    switch (e.key) {
      case 'ArrowUp':
        angle = Math.min(90, angle + 1);
        break;
      case 'ArrowDown':
        angle = Math.max(1, angle - 1);
        break;
      case 'ArrowRight':
        speed = Math.min(120, speed + 1);
        break;
      case 'ArrowLeft':
        speed = Math.max(5, speed - 1);
        break;
      case ' ':
      case 'Enter':
        fire();
        break;
      case 'e':
      case 'E':
        compareEarth = !compareEarth;
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
  canvas.addEventListener('keydown', onKey);

  const drawPath = (g: number, color: string, upTo: number): void => {
    if (!ctx) return;
    const total = flightTime(speed, angle, g);
    ctx.strokeStyle = color;
    ctx.beginPath();
    for (let s = 0; s <= Math.min(upTo, total); s += total / 80) {
      const p = positionAt(speed, angle, g, s);
      const px = MARGIN + p.x * SCALE;
      const py = H - MARGIN - p.y * SCALE;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  };

  const draw = (): void => {
    if (!ctx) return;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(0, H - MARGIN, W, MARGIN);
    ctx.fillStyle = '#d9534f';
    ctx.fillRect(MARGIN + targetM * SCALE - 4, H - MARGIN - 10, 8, 10);
    drawPath(GRAVITY_MOON, '#f5f5f5', flying ? t : Infinity);
    if (compareEarth) drawPath(GRAVITY_EARTH, '#4aa3ff', flying ? t : Infinity);
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText(
      `Angle ${angle}\u00b0  Speed ${speed} m/s  Target ${targetM} m  Best ${best}` +
        `  Moon range ${range(speed, angle, GRAVITY_MOON).toFixed(1)} m` +
        `  Apex ${maxHeight(speed, angle, GRAVITY_MOON).toFixed(1)} m`,
      8,
      16,
    );
    ctx.fillText('Arrows: aim/speed  Space: fire  E: Earth compare  L: what you learned', 8, 32);
    if (last) ctx.fillText(`Range ${last.rangeM.toFixed(1)} m  Score ${last.score}${last.targetHit ? ' HIT!' : ''}`, 8, 48);
    if (showLearned) {
      ctx.fillStyle = 'rgba(0,0,0,0.85)';
      ctx.fillRect(20, 60, W - 40, H - 100);
      ctx.fillStyle = '#ffffff';
      LEARNED_LINES.forEach((line, i) => ctx.fillText(line, 30, 85 + i * 24));
    }
  };

  const frame = (now: number): void => {
    const dt = prev ? Math.min(0.1, (now - prev) / 1000) : 0;
    prev = now;
    if (flying) {
      t += dt * 4; // time-lapse so a lunar flight is watchable
      if (t >= flightTime(speed, angle, GRAVITY_MOON)) land();
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    destroy(): void {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('keydown', onKey);
      canvas.remove();
    },
  };
}
