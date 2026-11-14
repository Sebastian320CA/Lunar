import type { EphemerisService, LunarSite, Result, SkyEventType, TimeController, UtcString, Unsubscribe } from '@lunar/contracts';
import { validateUtc } from '@lunar/security';

/** Mes sinódico lunar (día lunar) en días solares medios: 29.53059. */
export const SYNODIC_MONTH_DAYS = 29.53059;
const DAY_MS = 86_400_000;
const TICK_MS = 100;
/** Ventana de búsqueda de eventos: un mes sinódico más 1 día de margen. */
const SEARCH_WINDOW_MS = (SYNODIC_MONTH_DAYS + 1) * DAY_MS;

export type JumpKind = 'sunrise' | 'sunset' | 'earthrise';

export interface TimeClock {
  now(): number;
  /** Programa `cb` cada `ms` milisegundos; devuelve la función que lo cancela. */
  every(ms: number, cb: () => void): () => void;
}

export const systemClock: TimeClock = {
  now: () => Date.now(),
  every: (ms, cb) => {
    const h = setInterval(cb, ms);
    return () => clearInterval(h);
  },
};

export interface LunarTimeController extends TimeController {
  /** Avanza (o retrocede si n < 0) `n` días lunares. */
  stepLunarDays(n: number): Result<UtcString>;
  /** Salta al siguiente evento posterior a la hora actual. */
  jumpToNext(site: LunarSite, kind: JumpKind): Promise<Result<UtcString>>;
}

function toUtc(ms: number): UtcString {
  return new Date(Math.round(ms / 1000) * 1000).toISOString().replace('.000Z', 'Z');
}

export function createTimeController(
  initialUtc: UtcString,
  ephemeris: Pick<EphemerisService, 'findEvents'>,
  clock: TimeClock = systemClock,
): LunarTimeController {
  const init = validateUtc(initialUtc);
  if (!init.ok) throw new Error(init.error);

  let currentMs = Date.parse(init.value);
  const listeners = new Set<(utc: UtcString) => void>();
  let stopLoop: (() => void) | null = null;

  const notify = (): void => {
    const utc = toUtc(currentMs);
    for (const cb of [...listeners]) cb(utc);
  };

  const apply = (ms: number): Result<UtcString> => {
    if (!Number.isFinite(ms)) return { ok: false, error: 'Fecha fuera de rango.' };
    const utc = toUtc(ms);
    const v = validateUtc(utc);
    if (!v.ok) return v;
    currentMs = Date.parse(v.value);
    notify();
    return { ok: true, value: v.value };
  };

  return {
    getUtc: () => toUtc(currentMs),
    setUtc(utc) {
      const v = validateUtc(utc);
      if (!v.ok) throw new Error(v.error);
      apply(Date.parse(v.value));
    },
    onChange(cb): Unsubscribe {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    play(speed) {
      if (!Number.isFinite(speed) || speed === 0) throw new Error('La velocidad debe ser un número distinto de cero.');
      this.pause();
      let last = clock.now();
      stopLoop = clock.every(TICK_MS, () => {
        const now = clock.now();
        const dt = now - last;
        last = now;
        if (!apply(currentMs + dt * speed).ok) this.pause();
      });
    },
    pause() {
      if (stopLoop !== null) {
        stopLoop();
        stopLoop = null;
      }
    },
    stepLunarDays(n) {
      if (!Number.isFinite(n)) return { ok: false, error: 'El número de días lunares debe ser finito.' };
      return apply(currentMs + n * SYNODIC_MONTH_DAYS * DAY_MS);
    },
    async jumpToNext(site, kind) {
      const type: SkyEventType = kind;
      const startMs = currentMs + 1000;
      let events;
      try {
        events = await ephemeris.findEvents(site, toUtc(startMs), toUtc(startMs + SEARCH_WINDOW_MS));
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : 'No se pudo buscar el evento.' };
      }
      const hit = events.find((ev) => ev.type === type && Date.parse(ev.utc) > currentMs);
      if (hit === undefined) return { ok: false, error: 'No hay ese evento en el próximo mes lunar.' };
      return apply(Date.parse(hit.utc));
    },
  };
}
