import type { SkyEvent, TimeController, Unsubscribe } from '@lunar/contracts';

/** Primer evento de puesta (sunset o earthset) estrictamente posterior a `utc`, o `null`. */
export function nextSetEvent(events: readonly SkyEvent[], utc: string): SkyEvent | null {
  const now = Date.parse(utc);
  if (!Number.isFinite(now)) return null;
  let best: SkyEvent | null = null;
  let bestMs = Infinity;
  for (const e of events) {
    if (e.type !== 'sunset' && e.type !== 'earthset') continue;
    const ms = Date.parse(e.utc);
    if (!Number.isFinite(ms) || ms <= now || ms >= bestMs) continue;
    best = e;
    bestMs = ms;
  }
  return best;
}

/** Formatea una duracion en milisegundos como `Hh MMm SSs` (o `Dd ...` si pasa de un dia). */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d > 0 ? `${d}d ` : ''}${h}h ${p(m)}m ${p(s)}s`;
}

/** Elemento minimo necesario: solo se escribe `textContent`. */
export interface CountdownTarget {
  textContent: string | null;
}

/** Texto de la cuenta regresiva para `utc`; sin evento futuro devuelve `emptyText`. */
export function countdownText(events: readonly SkyEvent[], utc: string, emptyText = '--'): string {
  const ev = nextSetEvent(events, utc);
  if (!ev) return emptyText;
  const label = ev.type === 'sunset' ? 'Sunset' : 'Earthset';
  return `${label} in ${formatRemaining(Date.parse(ev.utc) - Date.parse(utc))}`;
}

/** Cuenta regresiva en vivo: se actualiza con cada cambio de tiempo. Devuelve la funcion de cancelacion. */
export function createCountdown(
  el: CountdownTarget,
  getEvents: () => readonly SkyEvent[],
  time: Pick<TimeController, 'getUtc' | 'onChange'>,
): Unsubscribe {
  const update = (utc: string): void => {
    el.textContent = countdownText(getEvents(), utc);
  };
  update(time.getUtc());
  return time.onChange(update);
}
