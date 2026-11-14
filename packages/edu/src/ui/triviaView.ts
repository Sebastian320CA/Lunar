import { createTrivia } from '../engine';
import type { Lang, Trivia } from '../engine';

export interface TriviaViewOptions {
  trivia?: Trivia;
  lang?: Lang;
  /** Called with the points earned after each answer. */
  onAnswer?: (correct: boolean, points: number) => void;
}

export interface TriviaViewHandle {
  readonly el: HTMLElement;
  destroy(): void;
}

/**
 * Keyboard accessible trivia view. Keys 1-9 pick an option, Enter or Space moves on.
 * All text goes through textContent.
 */
export function mountTriviaView(container: HTMLElement, opts: TriviaViewOptions = {}): TriviaViewHandle {
  const trivia = opts.trivia ?? createTrivia();
  const lang: Lang = opts.lang ?? 'es';
  const doc = container.ownerDocument;

  const el = doc.createElement('section');
  el.className = 'edu-trivia';
  el.tabIndex = 0;
  el.setAttribute('aria-label', 'Trivia');
  const status = doc.createElement('p');
  status.setAttribute('role', 'status');
  status.className = 'edu-status';
  const prompt = doc.createElement('h2');
  prompt.className = 'edu-prompt';
  const list = doc.createElement('ol');
  list.className = 'edu-options';
  const feedback = doc.createElement('p');
  feedback.setAttribute('aria-live', 'polite');
  feedback.className = 'edu-feedback';
  const nextBtn = doc.createElement('button');
  nextBtn.type = 'button';
  nextBtn.className = 'edu-next';
  el.append(status, prompt, list, feedback, nextBtn);
  container.appendChild(el);

  const render = (): void => {
    const s = trivia.state();
    const q = s.current;
    list.replaceChildren();
    status.textContent = `${s.score} pts | ${s.answered}`;
    if (s.phase === 'done' || !q) {
      prompt.textContent = lang === 'es' ? 'No quedan preguntas' : 'No more questions';
      feedback.textContent = '';
      nextBtn.hidden = true;
      return;
    }
    prompt.textContent = q.prompt[lang];
    q.options[lang].forEach((text, i) => {
      const li = doc.createElement('li');
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'edu-option';
      b.dataset['index'] = String(i);
      b.textContent = `${i + 1}. ${text}`;
      b.disabled = s.phase !== 'question';
      if (s.phase === 'explanation' && i === q.answer) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => choose(i));
      li.appendChild(b);
      list.appendChild(li);
    });
    if (s.phase === 'explanation') {
      const ok = s.lastCorrect === true;
      const head = ok ? (lang === 'es' ? 'Correcto' : 'Correct') : lang === 'es' ? 'Incorrecto' : 'Wrong';
      feedback.textContent = `${head}. ${q.explanation[lang]} (${q.source})`;
      nextBtn.textContent = lang === 'es' ? 'Siguiente (Enter)' : 'Next (Enter)';
      nextBtn.hidden = false;
    } else {
      feedback.textContent = '';
      nextBtn.hidden = true;
    }
  };

  function choose(i: number): void {
    const s = trivia.state();
    const res = trivia.answer(i);
    if (res) opts.onAnswer?.(res.correct, res.correct && s.current ? s.current.difficulty : 0);
    render();
    nextBtn.hidden ? el.focus() : nextBtn.focus();
  }

  const advance = (): void => {
    trivia.next();
    render();
    el.querySelector<HTMLElement>('.edu-option')?.focus();
  };

  nextBtn.addEventListener('click', advance);
  const onKey = (e: KeyboardEvent): void => {
    const phase = trivia.state().phase;
    if (phase === 'question' && /^[1-9]$/.test(e.key)) {
      const q = trivia.state().current;
      const idx = Number(e.key) - 1;
      if (q && idx < q.options[lang].length) {
        e.preventDefault();
        choose(idx);
      }
    } else if (phase === 'explanation' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      advance();
    }
  };
  el.addEventListener('keydown', onKey);

  trivia.next();
  render();

  return {
    el,
    destroy() {
      el.removeEventListener('keydown', onKey);
      el.remove();
    },
  };
}
