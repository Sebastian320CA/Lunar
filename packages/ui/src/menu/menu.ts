import type { I18nApi } from '@lunar/contracts';

/**
 * Main menu with an Earth background. Buttons are SVG shapes with pseudo-3D relief.
 * Natural Earth contours (public domain, https://www.naturalearthdata.com) are PENDING:
 * run tools/i18n-data/fetch_natural_earth.py and pass the simplified path as `shapePath`.
 * Without it, a rounded-shape button is used.
 */
export interface MenuItem {
  id: string;
  /** i18n key of the label. */
  labelKey: string;
  /** Optional SVG path `d` (viewBox 0 0 100 100), e.g. a simplified continent outline. */
  shapePath?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
}

export interface MenuHandle {
  element: HTMLElement;
  setDisabled(id: string, disabled: boolean): void;
  destroy(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const ROUNDED_SHAPE = 'M20 8 H80 Q92 8 92 20 V80 Q92 92 80 92 H20 Q8 92 8 80 V20 Q8 8 20 8 Z';

const STYLE_ID = 'ln-menu-style';
const CSS = `
.ln-menu{display:flex;flex-wrap:wrap;gap:var(--ln-space-3,16px);justify-content:center;padding:var(--ln-space-4,24px);
  background:radial-gradient(circle at 50% 120%,#1d4f91 0,#0b1d3a 45%,#02040a 75%)}
.ln-menu__btn{all:unset;box-sizing:border-box;display:inline-flex;flex-direction:column;align-items:center;cursor:pointer;
  width:140px;color:var(--ln-color-text,#fff);font-family:var(--ln-font-family,system-ui,sans-serif);text-align:center;
  transition:transform .15s,filter .15s}
.ln-menu__btn svg{width:120px;height:120px;filter:drop-shadow(0 6px 4px rgba(0,0,0,.55))}
.ln-menu__shape{fill:#2e7d5b;stroke:#9be3bd;stroke-width:2}
.ln-menu__btn:hover{transform:translateY(-3px) perspective(300px) rotateX(6deg);filter:brightness(1.15)}
.ln-menu__btn:focus-visible{outline:3px solid #ffd54a;outline-offset:3px;border-radius:12px}
.ln-menu__btn:active,.ln-menu__btn[data-pressed="true"]{transform:translateY(2px) scale(.97);filter:brightness(.9)}
.ln-menu__btn[aria-disabled="true"]{cursor:not-allowed;opacity:.45;filter:grayscale(1);transform:none}
`;

function ensureStyle(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  // La CSP (style-src 'self') bloquea <style> inline; las hojas construibles estan permitidas.
  const win = doc.defaultView;
  if (win && typeof win.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in doc) {
    try {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(CSS);
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
      const marker = doc.createElement('meta');
      marker.id = STYLE_ID;
      doc.head.appendChild(marker);
      return;
    } catch {
      /* usa el respaldo con <style> */
    }
  }
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

export function createMenu(container: HTMLElement, items: readonly MenuItem[], i18n: I18nApi): MenuHandle {
  const doc = container.ownerDocument;
  ensureStyle(doc);

  const nav = doc.createElement('nav');
  const list = doc.createElement('div');
  list.setAttribute('role', 'group');
  nav.appendChild(list);
  list.className = 'ln-menu';

  const buttons = new Map<string, { btn: HTMLElement; label: HTMLElement; item: MenuItem }>();

  const isDisabled = (btn: HTMLElement): boolean => btn.getAttribute('aria-disabled') === 'true';
  const activate = (item: MenuItem, btn: HTMLElement): void => {
    if (isDisabled(btn)) return;
    item.onSelect(item.id);
  };

  for (const item of items) {
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'ln-menu__btn';
    btn.dataset['id'] = item.id;

    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const path = doc.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'ln-menu__shape');
    path.setAttribute('d', item.shapePath ?? ROUNDED_SHAPE);
    svg.appendChild(path);

    const label = doc.createElement('span');
    label.textContent = i18n.t(item.labelKey);
    btn.setAttribute('aria-label', label.textContent);

    btn.append(svg, label);
    if (item.disabled) btn.setAttribute('aria-disabled', 'true');

    btn.addEventListener('click', () => activate(item, btn));
    btn.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault(); // avoid a second native click
        btn.dataset['pressed'] = 'true';
        activate(item, btn);
      }
    });
    btn.addEventListener('keyup', () => {
      delete btn.dataset['pressed'];
    });

    list.appendChild(btn);
    buttons.set(item.id, { btn, label, item });
  }

  const relabel = (): void => {
    for (const { btn, label, item } of buttons.values()) {
      const text = i18n.t(item.labelKey);
      label.textContent = text;
      btn.setAttribute('aria-label', text);
    }
  };
  const unsubscribe = i18n.onChange(relabel);

  container.appendChild(nav);

  return {
    element: nav,
    setDisabled(id, disabled) {
      const entry = buttons.get(id);
      if (!entry) return;
      if (disabled) entry.btn.setAttribute('aria-disabled', 'true');
      else entry.btn.removeAttribute('aria-disabled');
    },
    destroy() {
      unsubscribe();
      nav.remove();
    },
  };
}
