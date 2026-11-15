import './app.css';
import { getPanelTabs } from '@lunar/contracts';
import type {
  HorizonProfile,
  I18nApi,
  LunarSite,
  Program,
  ReportData,
  ReportSection,
  SceneMode,
  SiteMetrics,
  SkyEvent,
  SkyState,
} from '@lunar/contracts';
import { validateUtc } from '@lunar/security';
import { validateCustomSite } from '@lunar/sites';
import { renderSkyDiagram } from '@lunar/sky';
import { DISCLAIMER, LOGO_SVG, createMenu, getTheme, mountAbout, openSitePanel, setTheme } from '@lunar/ui';
import type { SitePanelHandle } from '@lunar/ui';
import type { WebContext } from '../modules/context';
import { FALLBACK } from './strings';
import { setIcon } from './icons';

export interface ShellHandle {
  readonly element: HTMLElement;
  /** Selects a site (marker click or list item): focuses it in the scene and shows its card. */
  selectSite(siteId: string): void;
  /** Opens the analysis panel of the selected site, optionally on a given tab. */
  openPanel(tabId?: string): void;
  destroy(): void;
}

export interface ShellOptions {
  /** Delivers the generated report; defaults to a Blob download. */
  onReport?: (bytes: Uint8Array, filename: string) => void;
  /** Manifest with asset credits for the About dialog. */
  manifest?: unknown;
}

/** Idiomas con nombre nativo (los 13 de @lunar/i18n). */
export const LANGUAGES: ReadonlyArray<readonly [string, string]> = [
  ['es', 'Español'],
  ['en', 'English'],
  ['pt', 'Português'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
  ['tr', 'Türkçe'],
  ['ru', 'Русский'],
  ['ar', 'العربية'],
  ['hi', 'हिन्दी'],
  ['zh', '中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];

const PROGRAMS: readonly Program[] = ['apollo', 'clps', 'commercial', 'international', 'custom'];
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SYNODIC_MS = 29.53059 * DAY_MS;
const SLIDER_STEPS = 1000;
const SPEEDS: ReadonlyArray<readonly [number, string]> = [
  [60, 'shell.speed.min'],
  [3600, 'shell.speed.hour'],
  [6 * 3600, 'shell.speed.6h'],
  [86400, 'shell.speed.day'],
];

/** Iconos de los botones del menu (viewBox 0 0 100 100), trazados propios. */
const ICONS: Record<string, string> = {
  compare: 'M14 86V52h16v34zM42 86V28h16v58zM70 86V40h16v46zM8 92h84v4H8z',
  export: 'M24 8h38l18 18v66H24zM58 12v18h18M50 44v30M36 62l14 14 14-14',
  learn: 'M50 16 6 36l44 20 44-20zM20 44v22c0 8 14 14 30 14s30-6 30-14V44L50 58zM88 38v28',
  games: 'M30 30h40c14 0 22 12 22 28s-6 26-14 26c-6 0-10-8-14-12H36c-4 4-8 12-14 12-8 0-14-10-14-26s8-28 22-28zM24 52h16M32 44v16M64 50a4 4 0 1 0 0.1 0M74 60a4 4 0 1 0 0.1 0',
  about: 'M50 8a42 42 0 1 0 0.1 0zM46 40h8v34h-8zM46 24h8v8h-8z',
};

export function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

function el<K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement | null,
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.appendChild(node);
  return node;
}

function button(parent: HTMLElement | null, className: string, text?: string): HTMLButtonElement {
  const b = el(parent, 'button', className, text);
  b.type = 'button';
  return b;
}

/** Inserta un SVG generado por los paquetes (cadena) sin innerHTML: se parsea como XML y se importa. */
function insertSvg(host: HTMLElement, svg: string): void {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return;
  host.appendChild(document.importNode(root, true));
}

function fmtDeg(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}°`;
}

function fmtCoord(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(3)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** UTC ISO -> valor de <input type="datetime-local"> (interpretado como UTC). */
function toLocalInput(utc: string): string {
  return utc.slice(0, 16);
}

/** Traductor: usa i18n si existe y cae al texto de respaldo (español) si falta la clave. */
function makeT(get: () => I18nApi | undefined): (key: string) => string {
  return (key) => {
    const v = get()?.t(key);
    return v && v !== key ? v : (FALLBACK[key] ?? key);
  };
}

export interface ReportExtras {
  /** Idioma de las etiquetas del PDF (las fuentes estandar solo codifican alfabeto latino). */
  lang?: 'es' | 'en';
  endUtc?: string;
  sky?: SkyState;
  horizon?: HorizonProfile;
  events?: SkyEvent[];
  ephemerisNote?: string;
}

const REPORT_LABELS: Record<'es' | 'en', Record<string, string>> = {
  es: {
    metrics: 'Metricas del intervalo',
    metric: 'Metrica',
    value: 'Valor',
    maxSunElevationDeg: 'Elevacion maxima del Sol (grados)',
    sunlitFraction: 'Fraccion iluminada (0-1)',
    longestLightHours: 'Luz continua mas larga (h)',
    longestDarkHours: 'Oscuridad continua mas larga (h)',
    earthVisibleFraction: 'Tierra visible (0-1)',
    longestCommsWindowHours: 'Ventana de comunicacion mas larga (h)',
    longestCommsGapHours: 'Corte de comunicacion mas largo (h)',
    demResolutionM: 'Resolucion del terreno (m)',
    sky: 'Cielo local en la fecha',
    events: 'Proximos eventos',
    event: 'Evento',
    utc: 'UTC',
    sunrise: 'Salida del Sol',
    sunset: 'Puesta del Sol',
    earthrise: 'Salida de la Tierra',
    earthset: 'Puesta de la Tierra',
    now: 'Estado actual',
    body: 'Cuerpo',
    az: 'Azimut (grados)',
    elev: 'Elevacion (grados)',
    visible: 'Sobre el horizonte',
    sun: 'Sol',
    earth: 'Tierra',
    yes: 'si',
    no: 'no',
  },
  en: {
    metrics: 'Interval metrics',
    metric: 'Metric',
    value: 'Value',
    maxSunElevationDeg: 'Maximum Sun elevation (degrees)',
    sunlitFraction: 'Sunlit fraction (0-1)',
    longestLightHours: 'Longest continuous light (h)',
    longestDarkHours: 'Longest continuous darkness (h)',
    earthVisibleFraction: 'Earth visible (0-1)',
    longestCommsWindowHours: 'Longest communication window (h)',
    longestCommsGapHours: 'Longest communication gap (h)',
    demResolutionM: 'Terrain resolution (m)',
    sky: 'Local sky at the date',
    events: 'Upcoming events',
    event: 'Event',
    utc: 'UTC',
    sunrise: 'Sunrise',
    sunset: 'Sunset',
    earthrise: 'Earthrise',
    earthset: 'Earthset',
    now: 'Current state',
    body: 'Body',
    az: 'Azimuth (degrees)',
    elev: 'Elevation (degrees)',
    visible: 'Above horizon',
    sun: 'Sun',
    earth: 'Earth',
    yes: 'yes',
    no: 'no',
  },
};

const METRIC_KEYS = [
  'maxSunElevationDeg',
  'sunlitFraction',
  'longestLightHours',
  'longestDarkHours',
  'earthVisibleFraction',
  'longestCommsWindowHours',
  'longestCommsGapHours',
  'demResolutionM',
] as const;

const round = (n: number, d = 3): number => Math.round(n * 10 ** d) / 10 ** d;

/** Arma los datos del PDF: parametros del sitio, metricas, cielo actual, diagrama y eventos. */
export function buildReport(
  site: LunarSite,
  utc: string,
  m: SiteMetrics | undefined,
  extras: ReportExtras = {},
): ReportData {
  const L = REPORT_LABELS[extras.lang ?? 'es'];
  const label = (k: string): string => L[k] ?? k;
  const sections: ReportSection[] = [];
  if (m) {
    sections.push({
      title: extras.endUtc ? `${label('metrics')}: ${utc} - ${extras.endUtc}` : label('metrics'),
      table: { headers: [label('metric'), label('value')], rows: METRIC_KEYS.map((k) => [label(k), round(m[k])]) },
    });
  }
  if (extras.sky) {
    const s = extras.sky;
    sections.push({
      title: `${label('now')} (${s.utc})`,
      table: {
        headers: [label('body'), label('az'), label('elev'), label('visible')],
        rows: [
          [label('sun'), round(s.sun.azimuthDeg, 1), round(s.sun.elevationDeg, 2), label(s.sun.aboveTerrainHorizon ? 'yes' : 'no')],
          [label('earth'), round(s.earth.azimuthDeg, 1), round(s.earth.elevationDeg, 2), label(s.earth.aboveTerrainHorizon ? 'yes' : 'no')],
        ],
      },
    });
    if (extras.horizon) {
      sections.push({
        title: label('sky'),
        svg: renderSkyDiagram({ horizon: extras.horizon, sky: s, size: 480, sunLabel: label('sun'), earthLabel: label('earth') }),
      });
    }
  }
  if (extras.events && extras.events.length > 0) {
    sections.push({
      title: label('events'),
      table: { headers: [label('event'), label('utc')], rows: extras.events.slice(0, 12).map((e) => [label(e.type), e.utc]) },
    });
  }
  const sources = [site.source];
  if (extras.ephemerisNote) sources.push(extras.ephemerisNote);
  return {
    title: `${site.name} - ${utc}`.slice(0, 200),
    scenarios: [{ id: site.id, label: site.name }],
    params: [
      { name: 'latDeg', value: site.latDeg, unit: '°' },
      { name: 'lonDeg', value: site.lonDeg, unit: '°' },
    ],
    sections,
    sources,
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
  const t = makeT(() => svc.i18n);
  const cleanups: Array<() => void> = [];
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number): void => {
    const h = setTimeout(() => {
      timers.delete(h);
      fn();
    }, ms);
    timers.add(h);
  };

  // Elementos con texto traducible: se vuelven a etiquetar al cambiar de idioma.
  const labels: Array<() => void> = [];
  const tx = <E extends HTMLElement>(node: E, key: string, attr?: string): E => {
    const apply = (): void => {
      if (attr) node.setAttribute(attr, t(key));
      else node.textContent = t(key);
    };
    apply();
    labels.push(apply);
    return node;
  };

  // La escena (si ya existe) se conserva: el Shell vacia #app y la vuelve a colocar en el escenario.
  const existingScene = document.getElementById('scene');
  root.replaceChildren();
  root.classList.add('ln-shell');
  if (getTheme() === 'system') setTheme('dark');

  // ---------- Barra superior ----------
  const header = el(root, 'header', 'ln-topbar');
  const sideToggle = button(header, 'ln-icon-btn ln-side-toggle');
  setIcon(sideToggle, 'menu');
  tx(sideToggle, 'shell.toggleSidebar', 'aria-label');
  const brand = el(header, 'div', 'ln-brand');
  const logo = el(brand, 'span', 'ln-logo');
  logo.setAttribute('aria-hidden', 'true');
  const svgDoc = new DOMParser().parseFromString(LOGO_SVG, 'image/svg+xml');
  if (svgDoc.documentElement.nodeName === 'svg') logo.appendChild(document.importNode(svgDoc.documentElement, true));
  const brandText = el(brand, 'div', 'ln-brand-text');
  tx(el(brandText, 'h1', 'ln-title'), 'shell.title');
  tx(el(brandText, 'p', 'ln-subtitle'), 'shell.subtitle');

  const modes = el(header, 'div', 'ln-modes');
  modes.setAttribute('role', 'group');
  tx(modes, 'shell.viewMode', 'aria-label');
  type ViewId = 'free' | 'site' | 'landing' | 'earth';
  const modeButtons = new Map<ViewId, HTMLButtonElement>();
  for (const [mode, key] of [
    ['free', 'shell.mode.free'],
    ['site', 'shell.mode.site'],
    ['landing', 'shell.mode.landing'],
    ['earth', 'shell.mode.earth'],
  ] as const) {
    const b = tx(button(modes, 'ln-mode-btn'), key);
    b.dataset['mode'] = mode;
    b.setAttribute('aria-pressed', 'false');
    modeButtons.set(mode, b);
  }

  const tools = el(header, 'div', 'ln-tools');
  const dataBadge = el(tools, 'span', 'ln-badge');
  const langLabel = el(tools, 'label', 'ln-lang');
  tx(el(langLabel, 'span', 'ln-visually-hidden'), 'shell.language');
  const langSel = el(langLabel, 'select');
  for (const [code, name] of LANGUAGES) {
    const o = el(langSel, 'option', undefined, name);
    o.value = code;
  }
  const themeBtn = button(tools, 'ln-icon-btn');
  const helpBtn = tx(button(tools, 'ln-icon-btn', '?'), 'shell.help', 'aria-label');

  // ---------- Escenario ----------
  const main = el(root, 'main', 'ln-stage');
  const scene = existingScene ?? el(null, 'div');
  scene.id = 'scene';
  scene.classList.add('ln-scene');
  scene.removeAttribute('style');
  main.appendChild(scene);
  if (!svc.scene && !scene.textContent) {
    tx(el(scene, 'p', 'ln-scene-empty'), 'shell.noScene');
  }

  // Barra lateral: sitios.
  const side = el(main, 'aside', 'ln-side');
  side.id = 'ln-side';
  sideToggle.setAttribute('aria-controls', side.id);
  const sideHead = el(side, 'div', 'ln-side-head');
  tx(el(sideHead, 'h2', undefined), 'shell.sites');
  const siteCount = el(sideHead, 'span', 'ln-count');
  const search = el(side, 'input', 'ln-search');
  search.type = 'search';
  tx(search, 'shell.search', 'placeholder');
  tx(search, 'shell.search', 'aria-label');
  const list = el(side, 'ul', 'ln-site-list');
  const customBox = el(side, 'details', 'ln-custom');
  tx(el(customBox, 'summary'), 'shell.custom.title');
  const customForm = el(customBox, 'form', 'ln-form');
  customForm.noValidate = true;
  const customFields = (['name', 'lat', 'lon'] as const).map((key) => {
    const wrap = el(customForm, 'label', 'ln-field');
    tx(el(wrap, 'span'), `shell.custom.${key}`);
    const input = el(wrap, 'input');
    input.name = key;
    input.type = 'text';
    input.autocomplete = 'off';
    if (key !== 'name') input.inputMode = 'decimal';
    const err = el(wrap, 'small', 'ln-error');
    err.setAttribute('role', 'alert');
    return { key, input, err };
  });
  const customSubmit = tx(el(customForm, 'button', 'ln-btn ln-btn--primary'), 'shell.custom.submit');
  customSubmit.type = 'submit';

  // Menu (dock a la derecha).
  const dock = el(main, 'nav', 'ln-dock');
  tx(dock, 'menu.title', 'aria-label');

  // HUD inferior: tarjeta del sitio y linea de tiempo.
  const hud = el(main, 'div', 'ln-hud');
  const card = el(hud, 'section', 'ln-card');
  card.setAttribute('aria-live', 'polite');
  const cardEmpty = tx(el(card, 'p', 'ln-card-empty'), 'shell.pickSite');
  const cardBody = el(card, 'div', 'ln-card-body');
  cardBody.hidden = true;
  const cardTitle = el(cardBody, 'h2', 'ln-card-title');
  const cardMeta = el(cardBody, 'p', 'ln-card-meta');
  const skyRow = el(cardBody, 'div', 'ln-sky');
  const sunChip = el(skyRow, 'span', 'ln-chip ln-chip--sun');
  const earthChip = el(skyRow, 'span', 'ln-chip ln-chip--earth');
  const cardActions = el(cardBody, 'div', 'ln-actions');
  const openBtn = tx(button(cardActions, 'ln-btn ln-btn--primary'), 'shell.openPanel');
  const landBtn = tx(button(cardActions, 'ln-btn'), 'shell.landHere');
  const globeBtn = tx(button(cardActions, 'ln-btn'), 'shell.viewGlobe');

  const timeline = el(hud, 'section', 'ln-timeline');
  tx(timeline, 'shell.timeline', 'aria-label');
  const tRow = el(timeline, 'div', 'ln-time-row');
  const prevDay = tx(button(tRow, 'ln-btn ln-btn--icon'), 'shell.prevLunarDay', 'aria-label');
  setIcon(prevDay, 'prev');
  const playBtn = button(tRow, 'ln-btn ln-btn--play');
  const nextDay = tx(button(tRow, 'ln-btn ln-btn--icon'), 'shell.nextLunarDay', 'aria-label');
  setIcon(nextDay, 'next');
  prevDay.title = t('shell.prevLunarDay');
  nextDay.title = t('shell.nextLunarDay');
  const speedSel = el(tRow, 'select', 'ln-speed');
  tx(speedSel, 'shell.speed', 'aria-label');
  for (const [v, key] of SPEEDS) tx(el(speedSel, 'option'), key).value = String(v);
  speedSel.value = '3600';
  const utcOut = el(tRow, 'output', 'ln-utc');
  const nowBtn = tx(button(tRow, 'ln-btn'), 'shell.now');
  const slider = el(timeline, 'input', 'ln-slider');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(SLIDER_STEPS);
  slider.step = '1';
  tx(slider, 'shell.timeline', 'aria-label');
  const tRow2 = el(timeline, 'div', 'ln-time-row ln-time-row--secondary');
  const dateForm = el(tRow2, 'form', 'ln-date-form');
  dateForm.noValidate = true;
  const dateInput = el(dateForm, 'input', 'ln-date');
  dateInput.type = 'datetime-local';
  dateInput.step = '60';
  tx(dateInput, 'shell.dateUtc', 'aria-label');
  const goBtn = tx(el(dateForm, 'button', 'ln-btn'), 'shell.go');
  goBtn.type = 'submit';
  const jumps = el(tRow2, 'div', 'ln-jumps');
  const jumpButtons = (['sunrise', 'sunset', 'earthrise'] as const).map((kind) => {
    const b = tx(button(jumps, 'ln-btn ln-btn--ghost'), `shell.jump.${kind}`);
    b.dataset['kind'] = kind;
    return b;
  });
  const timeMsg = el(timeline, 'p', 'ln-time-msg');
  timeMsg.setAttribute('role', 'status');

  // Avisos breves.
  const toasts = el(main, 'div', 'ln-toasts');
  toasts.setAttribute('aria-live', 'polite');
  const toast = (text: string, kind: 'info' | 'error' = 'info'): void => {
    const n = el(toasts, 'div', `ln-toast ln-toast--${kind}`, text);
    later(() => n.remove(), 4500);
  };

  // Intro.
  let intro: HTMLElement | undefined;
  if (svc.scene && (svc.scene.getMode?.() ?? 'intro') === 'intro') {
    intro = el(main, 'div', 'ln-intro');
    tx(el(intro, 'p', 'ln-intro-kicker'), 'shell.intro.kicker');
    tx(el(intro, 'h2', 'ln-intro-title'), 'shell.title');
    tx(el(intro, 'p', 'ln-intro-text'), 'shell.intro.text');
    const start = tx(button(intro, 'ln-btn ln-btn--primary ln-btn--lg'), 'shell.intro.start');
    start.addEventListener('click', () => endIntro());
  }
  let introDone = !intro;
  function endIntro(): void {
    if (introDone) return;
    introDone = true;
    intro?.classList.add('ln-intro--hide');
    later(() => intro?.remove(), 600);
    if (svc.scene?.getMode?.() === 'intro') svc.scene.setMode('free');
  }
  if (intro) later(endIntro, 6500);

  // Pie: siempre visible.
  const footer = el(root, 'footer', 'ln-footer');
  const footerText = el(footer, 'span');
  const syncFooter = (): void => {
    const v = svc.i18n?.t('common.disclaimer');
    footerText.textContent = v && v !== 'common.disclaimer' ? v : DISCLAIMER;
  };
  syncFooter();
  labels.push(syncFooter);

  // ---------- Estado ----------
  let selected: LunarSite | undefined;
  let panel: SitePanelHandle | undefined;
  const allSites = (): LunarSite[] => svc.sites?.list() ?? [];
  const currentUtc = (): string => svc.time?.getUtc() ?? iso(Date.now());

  // ---------- Idioma y tema ----------
  const currentLang = (): string => svc.i18n?.getLanguage?.() ?? 'es';
  const syncLangSelect = (): void => {
    const lang = currentLang();
    langSel.value = LANGUAGES.some(([c]) => c === lang) ? lang : 'en';
    document.documentElement.lang = lang;
    document.documentElement.dir = svc.i18n?.dir?.() ?? 'ltr';
  };
  // Preferencias locales (sin red): idioma y tema. localStorage puede no estar disponible.
  const store = {
    get(k: string): string | null {
      try {
        return window.localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set(k: string, v: string): void {
      try {
        window.localStorage.setItem(k, v);
      } catch {
        /* sin almacenamiento: la preferencia dura la sesion */
      }
    },
  };
  const savedLang = store.get('ln-lang');
  const savedTheme = store.get('ln-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);
  syncLangSelect();
  langSel.addEventListener('change', () => {
    store.set('ln-lang', langSel.value);
    svc.i18n?.setLanguage(langSel.value);
  });

  const syncTheme = (): void => {
    const dark = getTheme() !== 'light';
    setIcon(themeBtn, dark ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', t(dark ? 'shell.themeLight' : 'shell.themeDark'));
    themeBtn.title = themeBtn.getAttribute('aria-label') ?? '';
  };
  syncTheme();
  labels.push(syncTheme);
  themeBtn.addEventListener('click', () => {
    const next = getTheme() === 'light' ? 'dark' : 'light';
    setTheme(next);
    store.set('ln-theme', next);
    syncTheme();
  });

  const syncBadge = (): void => {
    const meta = svc.ephemerisMeta;
    dataBadge.textContent = !meta ? t('shell.data.none') : meta.approximate ? t('shell.data.approx') : t('shell.data.spice');
    dataBadge.dataset['approx'] = String(!meta || meta.approximate);
    dataBadge.title = meta?.note ?? '';
  };
  syncBadge();
  labels.push(syncBadge);

  // ---------- Lista de sitios ----------
  const listButtons = new Map<string, HTMLButtonElement>();
  const renderList = (): void => {
    list.replaceChildren();
    listButtons.clear();
    const q = search.value.trim().toLowerCase();
    const sites = allSites();
    siteCount.textContent = String(sites.length);
    let shown = 0;
    for (const program of PROGRAMS) {
      const group = sites.filter((s) => s.program === program && (q === '' || s.name.toLowerCase().includes(q)));
      if (group.length === 0) continue;
      const li = el(list, 'li', 'ln-group');
      el(li, 'h3', `ln-group-title ln-prog--${program}`, t(`shell.program.${program}`));
      const ul = el(li, 'ul');
      for (const s of group) {
        const item = el(ul, 'li');
        const b = button(item, 'ln-site');
        b.dataset['siteId'] = s.id;
        b.setAttribute('aria-pressed', String(selected?.id === s.id));
        el(b, 'span', `ln-dot ln-prog--${s.program}`).setAttribute('aria-hidden', 'true');
        el(b, 'span', 'ln-site-name', s.name);
        if (!s.verified) el(b, 'span', 'ln-tag', t('shell.unverified'));
        b.addEventListener('click', () => selectSite(s.id, true));
        listButtons.set(s.id, b);
        shown++;
      }
    }
    if (shown === 0) el(list, 'li', 'ln-empty', t('shell.noSites'));
  };
  search.addEventListener('input', renderList);
  labels.push(renderList);

  // ---------- Tarjeta del sitio y cielo en vivo ----------
  let skyRun = 0;
  let skyTimer: ReturnType<typeof setTimeout> | undefined;
  const renderSky = async (): Promise<void> => {
    const site = selected;
    const eph = svc.ephemeris;
    if (!site || !eph) {
      sunChip.textContent = '';
      earthChip.textContent = '';
      return;
    }
    const id = ++skyRun;
    try {
      const sky = await eph.getSky(site, currentUtc());
      if (id !== skyRun) return;
      sunChip.textContent = `${t(sky.sun.aboveTerrainHorizon ? 'shell.sunUp' : 'shell.sunDown')} ${fmtDeg(sky.sun.elevationDeg)}`;
      sunChip.dataset['up'] = String(sky.sun.aboveTerrainHorizon);
      earthChip.textContent = `${t(sky.earth.aboveTerrainHorizon ? 'shell.earthUp' : 'shell.earthDown')} ${fmtDeg(sky.earth.elevationDeg)}`;
      earthChip.dataset['up'] = String(sky.earth.aboveTerrainHorizon);
    } catch (e) {
      if (id !== skyRun) return;
      sunChip.textContent = e instanceof Error ? e.message : String(e);
      earthChip.textContent = '';
    }
  };
  const scheduleSky = (): void => {
    if (skyTimer !== undefined) return;
    skyTimer = setTimeout(() => {
      skyTimer = undefined;
      void renderSky();
    }, 200);
  };
  const renderCard = (): void => {
    const site = selected;
    cardEmpty.hidden = !!site;
    cardBody.hidden = !site;
    if (!site) return;
    cardTitle.textContent = site.name;
    cardMeta.textContent = `${t(`shell.program.${site.program}`)} · ${fmtCoord(site.latDeg, site.lonDeg)}${site.verified ? '' : ` · ${t('shell.unverified')}`}`;
    landBtn.disabled = !svc.scene?.landAt;
    globeBtn.disabled = !svc.scene;
    void renderSky();
  };
  labels.push(renderCard);

  function selectSite(siteId: string, focusScene: boolean): void {
    const site = allSites().find((s) => s.id === siteId);
    if (!site) return;
    selected = site;
    for (const [id, b] of listButtons) b.setAttribute('aria-pressed', String(id === siteId));
    if (focusScene) {
      endIntro();
      if (svc.scene?.focusSite) svc.scene.focusSite(siteId);
      else svc.scene?.focusMoonOn(site.latDeg, site.lonDeg);
    }
    svc.scene?.setSelectedSite?.(siteId);
    renderCard();
    if (window.matchMedia?.('(max-width: 760px)').matches) root.classList.remove('ln-side-open');
  }

  const openPanel = (tabId?: string): void => {
    const site = selected ?? allSites()[0];
    if (!site || !svc.i18n) {
      toast(t('shell.pickSiteFirst'), 'error');
      return;
    }
    if (!selected) selectSite(site.id, true);
    panel?.close();
    const anchor = svc.scene?.getSiteScreenAnchor(site.id) ?? { xPx: window.innerWidth / 2, yPx: window.innerHeight / 2 };
    panel = openSitePanel({ anchor, site, utc: currentUtc(), i18n: { setLanguage: (l) => svc.i18n?.setLanguage(l), t, onChange: (cb) => svc.i18n?.onChange(cb) ?? (() => undefined) } });
    panel.element.classList.add('ln-site-panel');
    if (tabId) panel.element.querySelector<HTMLButtonElement>(`[data-tab-id="${tabId}"]`)?.click();
  };

  openBtn.addEventListener('click', () => openPanel());
  landBtn.addEventListener('click', () => {
    if (selected) svc.scene?.landAt?.(selected.id);
  });
  globeBtn.addEventListener('click', () => {
    if (selected) svc.scene?.focusSite?.(selected.id);
  });

  const sites = allSites();
  svc.scene?.setSiteMarkers(sites);
  if (svc.scene) {
    cleanups.push(
      svc.scene.onSiteSelected((id) => {
        endIntro();
        selectSite(id, false);
      }),
    );
  }

  // Sitio personalizado.
  const customErr: Record<'name' | 'lat' | 'lon', string> = {
    name: 'shell.custom.errName',
    lat: 'shell.custom.errLat',
    lon: 'shell.custom.errLon',
  };
  let customCounter = 0;
  customForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const values = Object.fromEntries(customFields.map((f) => [f.key, f.input.value])) as Record<'name' | 'lat' | 'lon', string>;
    const res = validateCustomSite(values);
    for (const f of customFields) {
      const bad = !res.ok && res.errors[f.key] !== undefined;
      f.err.textContent = bad ? t(customErr[f.key]) : '';
      f.input.setAttribute('aria-invalid', String(bad));
    }
    if (!res.ok || !svc.sites) return;
    customCounter++;
    const site: LunarSite = { ...res.value, id: `custom-${customCounter}`, source: t('shell.custom.source') };
    svc.sites.add(site);
    svc.scene?.setSiteMarkers(allSites());
    renderList();
    selectSite(site.id, true);
    customForm.reset();
    toast(t('shell.custom.added'));
  });

  // ---------- Linea de tiempo ----------
  let playing = false;
  let windowStart = Date.parse(currentUtc()) - SYNODIC_MS / 2;
  const showUtc = (utc: string): void => {
    utcOut.textContent = utc.replace('T', ' ').replace('Z', ' UTC');
    if (document.activeElement !== dateInput) dateInput.value = toLocalInput(utc);
    const ms = Date.parse(utc);
    if (ms < windowStart || ms > windowStart + SYNODIC_MS) windowStart = ms - SYNODIC_MS / 2;
    if (document.activeElement !== slider) slider.value = String(Math.round(((ms - windowStart) / SYNODIC_MS) * SLIDER_STEPS));
    scheduleSky();
  };
  showUtc(currentUtc());
  if (svc.time) cleanups.push(svc.time.onChange(showUtc));
  const setUtc = (ms: number): void => {
    if (!svc.time) return;
    const v = validateUtc(iso(ms));
    if (!v.ok) {
      timeMsg.textContent = t('shell.utcInvalid');
      return;
    }
    timeMsg.textContent = '';
    svc.time.setUtc(v.value);
  };
  slider.addEventListener('input', () => setUtc(windowStart + (Number(slider.value) / SLIDER_STEPS) * SYNODIC_MS));
  const syncPlay = (): void => {
    setIcon(playBtn, playing ? 'pause' : 'play');
    playBtn.setAttribute('aria-label', t(playing ? 'shell.pause' : 'shell.play'));
    playBtn.setAttribute('aria-pressed', String(playing));
    playBtn.title = playBtn.getAttribute('aria-label') ?? '';
  };
  syncPlay();
  labels.push(syncPlay);
  playBtn.addEventListener('click', () => {
    if (!svc.time) return;
    playing = !playing;
    if (playing) svc.time.play(Number(speedSel.value));
    else svc.time.pause();
    syncPlay();
  });
  speedSel.addEventListener('change', () => {
    if (playing) svc.time?.play(Number(speedSel.value));
  });
  nowBtn.addEventListener('click', () => setUtc(Math.round(Date.now() / 1000) * 1000));
  const stepDay = (n: number): void => {
    if (!svc.time) return;
    if (svc.time.stepLunarDays) {
      const r = svc.time.stepLunarDays(n);
      timeMsg.textContent = r.ok ? '' : r.error;
    } else setUtc(Date.parse(currentUtc()) + n * SYNODIC_MS);
  };
  prevDay.addEventListener('click', () => stepDay(-1));
  nextDay.addEventListener('click', () => stepDay(1));
  dateForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const raw = dateInput.value.trim();
    const v = validateUtc(raw.length === 16 ? `${raw}:00Z` : `${raw.slice(0, 19)}Z`);
    if (!v.ok) {
      timeMsg.textContent = t('shell.utcInvalid');
      return;
    }
    timeMsg.textContent = '';
    svc.time?.setUtc(v.value);
    dateInput.blur();
  });
  for (const b of jumpButtons) {
    b.addEventListener('click', () => {
      const kind = b.dataset['kind'] as 'sunrise' | 'sunset' | 'earthrise';
      if (!selected) {
        timeMsg.textContent = t('shell.pickSiteFirst');
        return;
      }
      if (!svc.time?.jumpToNext) return;
      timeMsg.textContent = t('shell.searching');
      b.disabled = true;
      svc.time
        .jumpToNext(selected, kind)
        .then((r) => {
          timeMsg.textContent = r.ok ? '' : t('shell.noEvent');
        })
        .catch(() => {
          timeMsg.textContent = t('shell.noEvent');
        })
        .finally(() => {
          b.disabled = false;
        });
    });
  }

  // ---------- Modos de la escena ----------
  const syncModes = (mode: SceneMode): void => {
    const earth = svc.scene?.getFocusBody?.() === 'earth' && (mode === 'free' || mode === 'map');
    for (const [m, b] of modeButtons) {
      const on = m === 'earth' ? earth : !earth && (m === mode || (m === 'free' && mode === 'map'));
      b.setAttribute('aria-pressed', String(on));
    }
  };
  if (svc.scene?.onModeChange) cleanups.push(svc.scene.onModeChange(syncModes));
  syncModes(svc.scene?.getMode?.() ?? 'free');
  for (const [mode, b] of modeButtons) {
    b.disabled = !svc.scene;
    b.addEventListener('click', () => {
      const s = svc.scene;
      if (!s) return;
      endIntro();
      if (mode === 'earth') {
        if (s.viewEarth) s.viewEarth();
        else s.focusEarthOn(0, 0);
      } else if (mode === 'free') {
        if (s.viewMoon) s.viewMoon();
        else s.setMode('free');
      } else {
        const site = selected ?? allSites()[0];
        if (!site) return;
        if (!selected) selectSite(site.id, false);
        if (mode === 'landing') s.landAt?.(site.id);
        else if (s.focusSite) s.focusSite(site.id);
      }
    });
  }

  // ---------- Dialogos (Aprender, Juegos, Acerca de, Ayuda) ----------
  let dialog: { el: HTMLElement; dispose?: () => void; prevFocus: Element | null } | undefined;
  const closeDialog = (): void => {
    if (!dialog) return;
    const d = dialog;
    dialog = undefined;
    d.dispose?.();
    d.el.remove();
    if (d.prevFocus instanceof HTMLElement) d.prevFocus.focus();
  };
  const openDialog = (titleKey: string, fill: (body: HTMLElement) => void | (() => void)): void => {
    closeDialog();
    const prevFocus = document.activeElement;
    const backdrop = el(document.body, 'div', 'ln-modal-backdrop');
    const box = el(backdrop, 'div', 'ln-modal');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const head = el(box, 'div', 'ln-modal-head');
    const h = el(head, 'h2', undefined, t(titleKey));
    h.id = 'ln-modal-title';
    box.setAttribute('aria-labelledby', h.id);
    const close = button(head, 'ln-icon-btn');
    setIcon(close, 'close');
    close.setAttribute('aria-label', t('shell.close'));
    const body = el(box, 'div', 'ln-modal-body');
    const dispose = fill(body);
    dialog = { el: backdrop, prevFocus, ...(dispose ? { dispose } : {}) };
    close.addEventListener('click', closeDialog);
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) closeDialog();
    });
    close.focus();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && dialog) {
      e.preventDefault();
      closeDialog();
    }
  };
  document.addEventListener('keydown', onKey);
  cleanups.push(() => document.removeEventListener('keydown', onKey));

  const openTabDialog = (tabId: string, titleKey: string): void => {
    const tab = getPanelTabs().find((x) => x.id === tabId);
    openDialog(titleKey, (body) => {
      const site = selected ?? allSites()[0];
      if (!tab || !site) {
        body.textContent = t('shell.unavailable');
        return;
      }
      return tab.mount(body, { site, utc: currentUtc() });
    });
  };

  const doExport = async (): Promise<void> => {
    const site = selected ?? allSites()[0];
    if (!site || !svc.exportReport) {
      toast(t('shell.unavailable'), 'error');
      return;
    }
    toast(t('shell.exporting'));
    const start = currentUtc();
    const end = iso(Date.parse(start) + SYNODIC_MS);
    const [m, sky, horizon, events] = await Promise.all([
      svc.metrics?.(site, start, end, 60).catch(() => undefined),
      svc.ephemeris?.getSky(site, start).catch(() => undefined),
      svc.terrain?.getHorizon(site).catch(() => undefined),
      svc.ephemeris?.findEvents(site, start, end).catch(() => undefined),
    ]);
    const lang = currentLang() === 'es' ? 'es' : 'en';
    const bytes = await svc.exportReport(
      buildReport(site, start, m, {
        lang,
        endUtc: end,
        ...(sky ? { sky } : {}),
        ...(horizon ? { horizon } : {}),
        ...(events ? { events } : {}),
        ...(svc.ephemerisMeta ? { ephemerisNote: svc.ephemerisMeta.note } : {}),
      }),
    );
    (opts.onReport ?? defaultDownload)(bytes, `lunar-${site.id}.pdf`);
    toast(t('shell.exportDone'));
  };

  const menuI18n: I18nApi = {
    setLanguage: (l) => svc.i18n?.setLanguage(l),
    t,
    onChange: (cb) => svc.i18n?.onChange(cb) ?? (() => undefined),
  };
  const menu = createMenu(
    dock,
    [
      { id: 'compare', labelKey: 'shell.menu.compare', shapePath: ICONS['compare'] ?? '', onSelect: () => openPanel('comparar') },
      {
        id: 'export',
        labelKey: 'shell.menu.export',
        shapePath: ICONS['export'] ?? '',
        onSelect: () =>
          void doExport().catch((e: unknown) => toast(`${t('shell.exportError')}: ${e instanceof Error ? e.message : String(e)}`, 'error')),
      },
      { id: 'learn', labelKey: 'shell.menu.learn', shapePath: ICONS['learn'] ?? '', onSelect: () => openTabDialog('edu', 'shell.menu.learn') },
      { id: 'games', labelKey: 'shell.menu.games', shapePath: ICONS['games'] ?? '', onSelect: () => openTabDialog('edu-games', 'shell.menu.games') },
      {
        id: 'about',
        labelKey: 'shell.menu.about',
        shapePath: ICONS['about'] ?? '',
        onSelect: () => openDialog('shell.menu.about', (body) => mountAbout(body, opts.manifest ?? {}, t)),
      },
    ],
    menuI18n,
  );

  helpBtn.addEventListener('click', () =>
    openDialog('shell.help', (body) => {
      const ul = el(body, 'ul', 'ln-help');
      for (const k of ['select', 'panel', 'time', 'modes', 'custom', 'export']) el(ul, 'li', undefined, t(`shell.helpText.${k}`));
    }),
  );

  sideToggle.addEventListener('click', () => root.classList.toggle('ln-side-open'));
  if (!window.matchMedia?.('(max-width: 760px)').matches) root.classList.add('ln-side-open');

  // Atajos de teclado (fuera de campos de texto y dialogos).
  const onShortcut = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (dialog || document.querySelector('.ln-panel-backdrop')) return;
    if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON|CANVAS)$/.test(target.tagName)) return;
    if (e.key === ' ') {
      e.preventDefault();
      playBtn.click();
    } else if (e.key === '+' || e.key === '=') svc.scene?.zoom?.(-6);
    else if (e.key === '-') svc.scene?.zoom?.(6);
  };
  document.addEventListener('keydown', onShortcut);
  cleanups.push(() => document.removeEventListener('keydown', onShortcut));

  // Re-etiquetado al cambiar de idioma.
  if (svc.i18n) {
    cleanups.push(
      svc.i18n.onChange(() => {
        syncLangSelect();
        for (const f of labels) f();
        prevDay.title = t('shell.prevLunarDay');
        nextDay.title = t('shell.nextLunarDay');
      }),
    );
  }

  // El idioma guardado se aplica al final, ya suscritos los re-etiquetados.
  if (savedLang && LANGUAGES.some(([c]) => c === savedLang) && savedLang !== currentLang()) svc.i18n?.setLanguage(savedLang);
  renderList();
  renderCard();

  return {
    element: root,
    selectSite: (id) => selectSite(id, true),
    openPanel,
    destroy() {
      for (const c of cleanups) c();
      for (const h of timers) clearTimeout(h);
      if (skyTimer !== undefined) clearTimeout(skyTimer);
      if (playing) svc.time?.pause();
      menu.destroy();
      panel?.close();
      closeDialog();
      root.replaceChildren();
    },
  };
}
