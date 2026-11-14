import type { ClassSessionApi } from '../classMode';

export interface ProjectorHandle {
  readonly el: HTMLElement;
  /** Re-reads the ranking and the question text. */
  refresh(): void;
  setText(text: string): void;
  destroy(): void;
}

/** Large-text view for a projector: current text plus ranking. textContent only. */
export function mountProjectorView(container: HTMLElement, api: ClassSessionApi): ProjectorHandle {
  const doc = container.ownerDocument;
  const el = doc.createElement('section');
  el.className = 'edu-projector';
  el.setAttribute('aria-label', 'Projector');
  el.style.fontSize = '2.5rem';
  el.style.lineHeight = '1.3';
  const title = doc.createElement('h1');
  title.textContent = api.session.name;
  const text = doc.createElement('p');
  text.className = 'edu-projector-text';
  const list = doc.createElement('ol');
  list.className = 'edu-ranking';
  el.append(title, text, list);
  container.appendChild(el);

  const refresh = (): void => {
    list.replaceChildren();
    for (const r of api.ranking()) {
      const li = doc.createElement('li');
      li.textContent = `${r.name}: ${r.total}`;
      list.appendChild(li);
    }
  };
  refresh();
  return {
    el,
    refresh,
    setText(t) {
      text.textContent = t;
    },
    destroy() {
      el.remove();
    },
  };
}
