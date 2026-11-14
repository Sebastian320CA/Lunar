import { getPanelTabs } from '@lunar/contracts';
import type { I18nApi, LunarSite, ReportData, SiteMetrics } from '@lunar/contracts';
import { DISCLAIMER, LOGO_SVG, createMenu, mountAbout, openSitePanel } from '@lunar/ui';
import type { SitePanelHandle } from '@lunar/ui';
import type { WebContext } from '../modules/context';

export interface ShellHandle {
  readonly element: HTMLElement;
  /** Opens the panel for a site (marker click or list item). */
  selectSite(siteId: string): void;
  destroy(): void;
}

export interface ShellOptions {
  /** Delivers the generated report; defaults to a Blob download. */
  onReport?: (bytes: Uint8Array, filename: string) => void;
  /** Manifest with asset credits for the About dialog. */
  manifest?: unknown;
}

const FALLBACK: Record<string, string> = {
  'shell.title': 'Lunar Navigator',
  'shell.language': 'Idioma',
  'shell.sites': 'Sitios',
  'shell.timeline': 'Línea de tiempo',
  'shell.play': 'Reproducir',
  'shell.pause': 'Pausar',
  'shell.approx': 'Datos aproximados',
  'menu.export': 'Exportar',
  'menu.trivia': 'Trivia',
  'menu.games': 'Juegos',
  'menu.about': 'Acerca de',
  'shell.close': 'Cerrar',
  'shell.noI18n': 'Traducciones no disponibles',
  'edu.title': 'Trivia',
};

const LANGS: readonly string[] = ['es', 'en'];
const HOUR_MS = 3600_000;

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** Minimal i18n used when the i18n module is absent; also fills in missing keys. */
function makeT(i18n: I18nApi | undefined): (key: string) => string {
  return (key) => {
    const v = i18n?.t(key);
    return v && v !== key ? v : (FALLBACK[key] ?? key);
  };
}

function el<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  parent.appendChild(node);
  return node;
}

export function buildReport(site: LunarSite, utc: string, m: SiteMetrics | undefined): ReportData {
  const rows: Array<Array<string | number>> = m
    ? [
        ['maxSunElevationDeg', m.maxSunElevationDeg],
        ['sunlitFraction', m.sunlitFraction],
        ['longestLightHours', m.longestLightHours],
        ['longestDarkHours', m.longestDarkHours],
        ['earthVisibleFraction', m.earthVisibleFraction],
        ['longestCommsWindowHours', m.longestCommsWindowHours],
        ['longestCommsGapHours', m.longestCommsGapHours],
        ['demResolutionM', m.demResolutionM],
      ]
    : [];
  return {
    title: `${site.name} - ${utc}`.slice(0, 200),
    scenarios: [{ id: site.id, label: site.name }],
    params: [
      { name: 'latDeg', value: site.latDeg, unit: '°' },
      { name: 'lonDeg', value: site.lonDeg, unit: '°' },
    ],
    sections: rows.length ? [{ title: 'Metrics', table: { headers: ['metric', 'value'], rows } }] : [],
    sources: [site.source],
  };
}

function defaultDownload(bytes: Uint8Array, filename: string): void {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function mountShell(root: HTMLElement, ctx: WebContext, opts: ShellOptions = {}): ShellHandle {
  const svc = ctx.services;
  const t = makeT(svc.i18n);
  const cleanups: Array<() => void> = [];
  root.replaceChildren();
  root.classList.add('ln-shell');
  Object.assign(root.style, { display: 'grid', gridTemplateRows: 'auto 1fr auto', height: '100vh' });

  // Header
  const header = el(root, 'header', undefined, 'ln-shell-header');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px' });
  const logo = el(header, 'span', undefined, 'ln-logo');
  logo.setAttribute('aria-hidden', 'true');
  const svgDoc = new DOMParser().parseFromString(LOGO_SVG, 'image/svg+xml');
  if (svgDoc.documentElement.nodeName === 'svg') logo.appendChild(document.importNode(svgDoc.documentElement, true));
  const title = el(header, 'h1', t('shell.title'));
  title.style.margin = '0';
  el(header, 'span', t('shell.approx'), 'ln-approx');

  const langLabel = el(header, 'label', t('shell.language'));
  langLabel.style.marginLeft = 'auto';
  const langSel = el(langLabel, 'select');
  for (const l of LANGS) {
    const o = el(langSel, 'option', l.toUpperCase());
    o.value = l;
  }
  langSel.addEventListener('change', () => svc.i18n?.setLanguage(langSel.value));

  const menuHost = el(header, 'div', undefined, 'ln-menu-host');

  // Main
  const main = el(root, 'main', undefined, 'ln-shell-main');
  Object.assign(main.style, { display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: '0' });
  const side = el(main, 'aside', undefined, 'ln-side');
  side.style.overflow = 'auto';
  el(side, 'h2', t('shell.sites'));
  const list = el(side, 'ul', undefined, 'ln-site-list');
  Object.assign(list.style, { listStyle: 'none', padding: '0', margin: '0' });

  const timeline = el(side, 'section', undefined, 'ln-timeline');
  el(timeline, 'h2', t('shell.timeline'));
  const slider = el(timeline, 'input');
  slider.type = 'range';
  slider.min = '-720';
  slider.max = '720';
  slider.step = '1';
  slider.value = '0';
  slider.setAttribute('aria-label', t('shell.timeline'));
  const utcOut = el(timeline, 'output');
  const playBtn = el(timeline, 'button', t('shell.play'));
  playBtn.type = 'button';

  let scene = document.getElementById('scene');
  if (!scene || !root.contains(scene)) {
    scene = el(main, 'div');
    scene.id = 'scene';
  }
  scene.style.position = 'relative';
  const panelHost = el(main, 'div', undefined, 'ln-panel-host');
  panelHost.style.position = 'relative';

  // Footer: always visible
  const footer = el(root, 'footer', DISCLAIMER, 'ln-footer');
  Object.assign(footer.style, { position: 'sticky', bottom: '0', padding: '6px 12px', textAlign: 'center' });

  // Sites
  let selected: LunarSite | undefined;
  let panel: SitePanelHandle | undefined;
  const sites = svc.sites?.list() ?? [];
  const currentUtc = (): string => svc.time?.getUtc() ?? iso(Date.now());
  const baseMs = Date.parse(currentUtc());

  const selectSite = (siteId: string): void => {
    const site = (svc.sites?.list() ?? []).find((s) => s.id === siteId);
    if (!site || !svc.i18n) return;
    selected = site;
    panel?.close();
    const anchor = (svc.scene && svc.scene.getSiteScreenAnchor(siteId)) ?? {
      xPx: window.innerWidth / 2,
      yPx: window.innerHeight / 2,
    };
    panel = openSitePanel({ anchor, site, utc: currentUtc(), i18n: svc.i18n });
  };

  if (sites.length === 0) {
    el(list, 'li', '—');
  }
  for (const s of sites) {
    const li = el(list, 'li');
    const b = el(li, 'button', s.name);
    b.type = 'button';
    b.dataset.siteId = s.id;
    b.addEventListener('click', () => selectSite(s.id));
  }
  svc.scene?.setSiteMarkers(sites);
  if (svc.scene) cleanups.push(svc.scene.onSiteSelected(selectSite));

  // Timeline
  const showUtc = (utc: string): void => {
    utcOut.textContent = utc;
  };
  showUtc(currentUtc());
  slider.addEventListener('input', () => svc.time?.setUtc(iso(baseMs + Number(slider.value) * HOUR_MS)));
  if (svc.time) cleanups.push(svc.time.onChange(showUtc));
  let playing = false;
  playBtn.addEventListener('click', () => {
    if (!svc.time) return;
    playing = !playing;
    if (playing) svc.time.play(3600);
    else svc.time.pause();
    playBtn.textContent = t(playing ? 'shell.pause' : 'shell.play');
  });

  // Dialog for tabs and About
  let dialog: HTMLElement | undefined;
  const closeDialog = (): void => {
    dialog?.remove();
    dialog = undefined;
  };
  const openDialog = (fill: (body: HTMLElement) => void | (() => void)): void => {
    closeDialog();
    const box = el(panelHost, 'div', undefined, 'ln-dialog');
    box.setAttribute('role', 'dialog');
    Object.assign(box.style, { position: 'fixed', inset: '10% 10%', overflow: 'auto', padding: '16px', background: 'var(--ln-color-surface, #111)', color: 'var(--ln-color-text, #eee)', zIndex: '10' });
    const body = document.createElement('div');
    const dispose = fill(body);
    const close = el(box, 'button', t('shell.close'));
    close.type = 'button';
    box.appendChild(body);
    close.addEventListener('click', () => {
      if (dispose) dispose();
      closeDialog();
    });
    dialog = box;
  };
  const openTab = (tabId: string): void => {
    const tab = getPanelTabs().find((x) => x.id === tabId);
    openDialog((body) => {
      if (!tab) {
        body.textContent = t('shell.noI18n');
        return;
      }
      const site = selected ?? sites[0];
      if (!site) {
        body.textContent = '—';
        return;
      }
      return tab.mount(body, { site, utc: currentUtc() });
    });
  };

  const doExport = async (): Promise<void> => {
    const site = selected ?? sites[0];
    if (!site || !svc.exportReport) return;
    const start = currentUtc();
    let m: SiteMetrics | undefined;
    try {
      m = await svc.metrics?.(site, start, iso(Date.parse(start) + 24 * HOUR_MS), 60);
    } catch {
      m = undefined;
    }
    const bytes = await svc.exportReport(buildReport(site, start, m));
    (opts.onReport ?? defaultDownload)(bytes, `lunar-${site.id}.pdf`);
  };

  // Main menu
  const menuI18n: I18nApi = {
    setLanguage: (l) => svc.i18n?.setLanguage(l),
    t,
    onChange: (cb) => svc.i18n?.onChange(cb) ?? (() => undefined),
  };
  const menu = createMenu(
    menuHost,
    [
      { id: 'export', labelKey: 'menu.export', onSelect: () => void doExport().catch(() => undefined) },
      { id: 'trivia', labelKey: 'menu.trivia', onSelect: () => openTab('edu') },
      { id: 'games', labelKey: 'menu.games', onSelect: () => openTab('edu-games') },
      { id: 'about', labelKey: 'menu.about', onSelect: () => openDialog((body) => mountAbout(body, opts.manifest ?? {})) },
    ],
    menuI18n,
  );

  return {
    element: root,
    selectSite,
    destroy() {
      for (const c of cleanups) c();
      menu.destroy();
      panel?.close();
      closeDialog();
      root.replaceChildren();
    },
  };
}
