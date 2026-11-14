import type {
  HorizonProfile,
  LunarSite,
  PanelContext,
  PanelTab,
  SiteMetrics,
  SkyEvent,
  SkyState,
  TimeController,
} from '@lunar/contracts';
import { formatRemaining, nextSetEvent } from './countdown';
import { renderSkyDiagram } from './diagram';
import { uncertaintyText } from './metrics';

export const SKY_TAB_ID = 'sol-tierra';
const SVG_NS = 'http://www.w3.org/2000/svg';
const WINDOW_MS = 40 * 24 * 3600 * 1000;
const METRICS_DAYS = 30;

export interface SkyTabDeps {
  /** Resolved on each use so registration order does not matter. */
  getSky(site: LunarSite, utc: string): Promise<SkyState>;
  getHorizon(site: LunarSite): Promise<HorizonProfile>;
  findEvents(site: LunarSite, startUtc: string, endUtc: string): Promise<SkyEvent[]>;
  getMetrics(site: LunarSite, startUtc: string, endUtc: string, stepMin: number): Promise<SiteMetrics>;
  /** Optional live time; when absent the tab uses `ctx.utc` only. */
  time?: () => Pick<TimeController, 'getUtc' | 'onChange'> | undefined;
  /** Returns `{ approximate: true }` when the ephemeris is approximate. */
  ephemerisMeta?: () => { source: string; approximate: boolean; note: string } | undefined;
  /** Optional translator; the key itself (or the fallback) is used when absent or missing. */
  t?: (key: string) => string;
  /** Language used for the uncertainty text. */
  lang?: () => string;
}

function insertSvg(host: HTMLElement, svg: string): void {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  host.textContent = '';
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return;
  const el = document.createElementNS(SVG_NS, 'svg');
  for (const a of Array.from(root.attributes)) el.setAttribute(a.name, a.value);
  for (const child of Array.from(root.childNodes)) el.appendChild(document.importNode(child, true));
  host.appendChild(el);
}

function isoPlus(utc: string, ms: number): string | undefined {
  const t = Date.parse(utc);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t + ms).toISOString().replace(/\.\d+Z$/, 'Z');
}

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const pct = (n: number): string => `${Math.round(n * 100)} %`;

export function createSkyTab(deps: SkyTabDeps): PanelTab {
  /** Translate with fallback: i18n returns the key itself when missing. */
  const tr = (key: string, fallback: string): string => {
    const v = deps.t?.(key);
    return v && v !== key ? v : fallback;
  };
  return {
    id: SKY_TAB_ID,
    titleKey: 'sky.tab',
    mount(container: HTMLElement, ctx: PanelContext): () => void {
      let disposed = false;
      let events: SkyEvent[] = [];
      let currentUtc = ctx.utc;
      let run = 0;

      const root = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = tr('sky.tab', 'Sol y Tierra');
      root.appendChild(heading);

      const approx = document.createElement('p');
      approx.setAttribute('data-approximate', '');
      const meta = deps.ephemerisMeta?.();
      if (meta?.approximate) {
        approx.textContent = tr('sky.approximate', 'Datos aproximados');
        root.appendChild(approx);
      }

      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      root.appendChild(status);
      const plain = document.createElement('p');
      root.appendChild(plain);
      const countdown = document.createElement('p');
      countdown.setAttribute('data-countdown', '');
      root.appendChild(countdown);
      const diagramHost = document.createElement('div');
      root.appendChild(diagramHost);

      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = tr('sky.technical', 'Detalle técnico');
      details.appendChild(summary);
      const tech = document.createElement('div');
      details.appendChild(tech);
      root.appendChild(details);
      container.appendChild(root);

      const addLine = (host: HTMLElement, text: string): void => {
        const p = document.createElement('p');
        p.textContent = text;
        host.appendChild(p);
      };

      const updateCountdown = (utc: string): void => {
        const ev = nextSetEvent(events, utc);
        if (!ev) {
          countdown.textContent = '--';
          return;
        }
        const label =
          ev.type === 'sunset' ? tr('sky.sunsetIn', 'Puesta del Sol en') : tr('sky.earthsetIn', 'Puesta de la Tierra en');
        countdown.textContent = `${label} ${formatRemaining(Date.parse(ev.utc) - Date.parse(utc))}`;
      };

      const load = async (): Promise<void> => {
        const id = ++run;
        status.textContent = tr('sky.loading', 'Calculando...');
        try {
          const end = isoPlus(ctx.utc, WINDOW_MS);
          const mEnd = isoPlus(ctx.utc, METRICS_DAYS * 24 * 3600 * 1000);
          if (!end || !mEnd) throw new Error('utc');
          const [sky, horizon, evs, m] = await Promise.all([
            deps.getSky(ctx.site, ctx.utc),
            deps.getHorizon(ctx.site),
            deps.findEvents(ctx.site, ctx.utc, end),
            deps.getMetrics(ctx.site, ctx.utc, mEnd, 60),
          ]);
          if (disposed || id !== run) return;
          events = evs;
          status.textContent = '';
          plain.textContent = sky.sun.aboveTerrainHorizon
            ? tr('sky.sunUp', 'El Sol está sobre el horizonte.')
            : tr('sky.sunDown', 'El Sol está bajo el horizonte.');
          plain.textContent += ' ' +
            (sky.earth.aboveTerrainHorizon
              ? tr('sky.earthUp', 'La Tierra es visible.')
              : tr('sky.earthDown', 'La Tierra no es visible.'));
          insertSvg(diagramHost, renderSkyDiagram({ horizon, sky, size: 480 }));
          tech.textContent = '';
          addLine(tech, `Sol: az ${f1(sky.sun.azimuthDeg)}°, el ${f1(sky.sun.elevationDeg)}°`);
          addLine(tech, `Tierra: az ${f1(sky.earth.azimuthDeg)}°, el ${f1(sky.earth.elevationDeg)}°`);
          addLine(tech, `Elevación máxima del Sol: ${f1(m.maxSunElevationDeg)}°`);
          addLine(tech, `Fracción iluminada: ${pct(m.sunlitFraction)}`);
          addLine(tech, `Luz continua más larga: ${f1(m.longestLightHours)} h`);
          addLine(tech, `Oscuridad continua más larga: ${f1(m.longestDarkHours)} h`);
          addLine(tech, `Tierra visible: ${pct(m.earthVisibleFraction)}`);
          addLine(tech, `Ventana de comunicación más larga: ${f1(m.longestCommsWindowHours)} h`);
          addLine(tech, `Corte de comunicación más largo: ${f1(m.longestCommsGapHours)} h`);
          addLine(tech, uncertaintyText(m.demResolutionM, deps.lang?.() ?? 'es'));
          if (meta) addLine(tech, `${meta.source}${meta.note ? `: ${meta.note}` : ''}`);
          updateCountdown(currentUtc);
        } catch (e) {
          if (disposed || id !== run) return;
          status.textContent = e instanceof Error ? e.message : String(e);
        }
      };

      const time = deps.time?.();
      const unsub = time?.onChange((u) => {
        currentUtc = u;
        updateCountdown(u);
      });
      if (time) currentUtc = time.getUtc();
      void load();

      return () => {
        disposed = true;
        unsub?.();
        root.remove();
      };
    },
  };
}
