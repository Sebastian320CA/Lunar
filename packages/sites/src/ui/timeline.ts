import { validateUtc } from '@lunar/security';
import type { LunarTimeController } from '../timeController';
import { SYNODIC_MONTH_DAYS } from '../timeController';

export interface TimelineHandle {
  destroy(): void;
}

const DAY_MS = 86_400_000;
const WINDOW_MS = SYNODIC_MONTH_DAYS * DAY_MS;
const SCRUB_STEPS = 1000;
const PLAY_SPEED = 3600; // 1 s real = 1 h simulada

/** Línea de tiempo: entrada UTC validada, scrubber (un día lunar), play/pausa y botones de día lunar. */
export function mountTimeline(container: HTMLElement, time: LunarTimeController): TimelineHandle {
  const doc = container.ownerDocument;
  const root = doc.createElement('div');
  root.className = 'timeline';

  const form = doc.createElement('form');
  form.noValidate = true;
  const label = doc.createElement('label');
  label.htmlFor = 'timeline-utc';
  label.textContent = 'Fecha y hora UTC (AAAA-MM-DDTHH:MM:SSZ)';
  const utcInput = doc.createElement('input');
  utcInput.id = 'timeline-utc';
  utcInput.type = 'text';
  const apply = doc.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Ir';
  const error = doc.createElement('p');
  error.id = 'timeline-error';
  error.setAttribute('role', 'alert');
  utcInput.setAttribute('aria-describedby', error.id);
  form.append(label, utcInput, apply, error);

  const scrubber = doc.createElement('input');
  scrubber.type = 'range';
  scrubber.min = '0';
  scrubber.max = String(SCRUB_STEPS);
  scrubber.step = '1';
  scrubber.setAttribute('aria-label', 'Posición dentro del día lunar');

  const playBtn = doc.createElement('button');
  playBtn.type = 'button';
  const prevBtn = doc.createElement('button');
  prevBtn.type = 'button';
  prevBtn.textContent = '« Día lunar';
  const nextBtn = doc.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Día lunar »';

  root.append(form, scrubber, prevBtn, playBtn, nextBtn);
  container.appendChild(root);

  let playing = false;
  let windowStart = Date.parse(time.getUtc());

  const setPlayLabel = (): void => {
    playBtn.textContent = playing ? 'Pausa' : 'Reproducir';
    playBtn.setAttribute('aria-pressed', String(playing));
  };

  const refresh = (utc: string): void => {
    utcInput.value = utc;
    const ms = Date.parse(utc);
    if (ms < windowStart || ms > windowStart + WINDOW_MS) windowStart = ms;
    scrubber.value = String(Math.round(((ms - windowStart) / WINDOW_MS) * SCRUB_STEPS));
  };

  const showError = (msg: string): void => {
    error.textContent = msg;
    utcInput.setAttribute('aria-invalid', String(msg !== ''));
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = validateUtc(utcInput.value.trim());
    if (!v.ok) {
      showError(v.error);
      return;
    }
    showError('');
    time.setUtc(v.value);
  });

  scrubber.addEventListener('input', () => {
    showError('');
    time.setUtc(new Date(windowStart + (Number(scrubber.value) / SCRUB_STEPS) * WINDOW_MS).toISOString().replace('.000Z', 'Z'));
  });

  playBtn.addEventListener('click', () => {
    if (playing) time.pause();
    else time.play(PLAY_SPEED);
    playing = !playing;
    setPlayLabel();
  });
  const step = (n: number): void => {
    const r = time.stepLunarDays(n);
    showError(r.ok ? '' : r.error);
  };
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  const unsub = time.onChange(refresh);
  refresh(time.getUtc());
  setPlayLabel();

  return {
    destroy() {
      unsub();
      if (playing) time.pause();
      root.remove();
    },
  };
}
