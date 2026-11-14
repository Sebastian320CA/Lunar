import { createTrivia } from '../engine';
import type { Lang, Trivia } from '../engine';

export interface CalculatorModeOptions {
  trivia?: Trivia;
  lang?: Lang;
}

export interface CalculatorHandle {
  readonly el: HTMLElement;
  /** Current screen text (what a small display would show). */
  screen(): string;
  destroy(): void;
}

/**
 * Calculator mode (assumption: text-only, keyboard-only, small screen, no 3D).
 * One <pre> screen; keys 1-9 answer, Enter continues. No canvas, no buttons, no WebGL.
 */
export function mountCalculatorMode(container: HTMLElement, opts: CalculatorModeOptions = {}): CalculatorHandle {
  const trivia = opts.trivia ?? createTrivia();
  const lang: Lang = opts.lang ?? 'es';
  const doc = container.ownerDocument;
  const el = doc.createElement('pre');
  el.className = 'edu-calculator';
  el.tabIndex = 0;
  el.setAttribute('role', 'application');
  el.setAttribute('aria-label', 'Trivia (calculator mode)');
  el.setAttribute('aria-live', 'polite');
  el.style.maxWidth = '24em';
  el.style.whiteSpace = 'pre-wrap';
  container.appendChild(el);

  let text = '';
  const render = (): void => {
    const s = trivia.state();
    const q = s.current;
    if (s.phase === 'done' || !q) {
      text = `${lang === 'es' ? 'Fin' : 'End'}. ${s.score} pts`;
    } else if (s.phase === 'question') {
      text = [q.prompt[lang], ...q.options[lang].map((o, i) => `${i + 1}) ${o}`)].join('\n');
    } else {
      const head = s.lastCorrect ? 'OK' : 'X';
      text = `${head} ${q.explanation[lang]}\n[${q.source}]\n${s.score} pts. Enter`;
    }
    el.textContent = text;
  };
  const onKey = (e: KeyboardEvent): void => {
    const s = trivia.state();
    if (s.phase === 'question' && /^[1-9]$/.test(e.key) && s.current) {
      const i = Number(e.key) - 1;
      if (i < s.current.options[lang].length) {
        e.preventDefault();
        trivia.answer(i);
        render();
      }
    } else if (s.phase === 'explanation' && e.key === 'Enter') {
      e.preventDefault();
      trivia.next();
      render();
    }
  };
  el.addEventListener('keydown', onKey);
  trivia.next();
  render();
  return {
    el,
    screen: () => text,
    destroy() {
      el.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
