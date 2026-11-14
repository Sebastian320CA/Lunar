import { getPanelTabs } from '@lunar/contracts';
import type { I18nApi, LunarSite, SceneApi, ScreenAnchor } from '@lunar/contracts';

export interface SitePanelOptions {
  anchor: ScreenAnchor;
  site: LunarSite;
  utc: string;
  i18n: I18nApi;
}

export interface SitePanelHandle {
  readonly element: HTMLElement;
  close(): void;
}

const ANIM_MS = 260;
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Resolves the anchor of a site via an injected SceneApi; null when not visible. */
export function anchorFor(scene: Pick<SceneApi, 'getSiteScreenAnchor'>, siteId: string): ScreenAnchor | null {
  return scene.getSiteScreenAnchor(siteId);
}

/** Opens the site panel, animating in 3D from the anchor. */
export function openSitePanel(opts: SitePanelOptions): SitePanelHandle {
  const { anchor, site, utc, i18n } = opts;
  const previousFocus = document.activeElement as HTMLElement | null;
  const reduced = prefersReducedMotion();

  const backdrop = document.createElement('div');
  backdrop.className = 'ln-panel-backdrop';
  Object.assign(backdrop.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.55)', perspective: '1200px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    opacity: reduced ? '1' : '0', transition: reduced ? 'none' : `opacity ${ANIM_MS}ms ease`,
  });

  const dialog = document.createElement('div');
  dialog.className = 'ln-panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', site.name);
  dialog.tabIndex = -1;
  Object.assign(dialog.style, {
    background: 'var(--ln-color-surface, #111)', color: 'var(--ln-color-text, #eee)',
    width: 'min(720px, 92vw)', maxHeight: '86vh', overflow: 'auto', padding: '16px', borderRadius: '12px',
    transformOrigin: `${anchor.xPx}px ${anchor.yPx}px`,
  });
  const hidden = 'rotateX(60deg) scale(0.05)';
  dialog.style.transform = reduced ? 'none' : hidden;
  dialog.style.transition = reduced ? 'none' : `transform ${ANIM_MS}ms ease`;

  const header = document.createElement('div');
  const title = document.createElement('h2');
  title.textContent = site.name;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.textContent = i18n.t('panel.close');
  closeBtn.setAttribute('aria-label', i18n.t('panel.close'));
  header.append(title, closeBtn);

  const tabList = document.createElement('div');
  tabList.setAttribute('role', 'tablist');
  const body = document.createElement('div');
  body.setAttribute('role', 'tabpanel');
  dialog.append(header, tabList, body);
  backdrop.append(dialog);

  let unmountTab: (() => void) | null = null;
  const buttons: HTMLButtonElement[] = [];
  const select = (idx: number): void => {
    unmountTab?.();
    unmountTab = null;
    body.textContent = '';
    const tabs = getPanelTabs();
    buttons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === idx));
      b.tabIndex = i === idx ? 0 : -1;
    });
    const tab = tabs[idx];
    if (tab) unmountTab = tab.mount(body, { site, utc });
  };
  getPanelTabs().forEach((tab, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.dataset['tabId'] = tab.id;
    b.textContent = i18n.t(tab.titleKey);
    b.addEventListener('click', () => select(i));
    buttons.push(b);
    tabList.append(b);
  });
  select(0);

  let closed = false;
  const finish = (): void => {
    unmountTab?.();
    unmountTab = null;
    backdrop.remove();
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    if (reduced) {
      finish();
      return;
    }
    backdrop.style.opacity = '0';
    dialog.style.transform = hidden;
    setTimeout(finish, ANIM_MS);
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.tabIndex >= 0);
    if (items.length === 0) {
      e.preventDefault();
      dialog.focus();
      return;
    }
    const first = items[0] as HTMLElement;
    const last = items[items.length - 1] as HTMLElement;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !dialog.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !dialog.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  }
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey, true);

  document.body.append(backdrop);
  closeBtn.focus();
  if (!reduced) {
    requestAnimationFrame(() => {
      backdrop.style.opacity = '1';
      dialog.style.transform = 'rotateX(0deg) scale(1)';
    });
  }
  return { element: dialog, close };
}
