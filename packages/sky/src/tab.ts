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

      const LABELS: Record<SkyEvent['type'], () => string> = {
        sunset: () => tr('sky.sunsetIn', 'Puesta del Sol en'),
        sunrise: () => tr('sky.sunriseIn', 'Salida del Sol en'),
        earthset: () => tr('sky.earthsetIn', 'Puesta de la Tierra en'),
        earthrise: () => tr('sky.earthriseIn', 'Salida de la Tierra en'),
      };
      /** Proximo evento de `body` (salida o puesta) posterior a `utc`. */
      const nextOf = (body: 'sun' | 'earth', utc: string): SkyEvent | null => {
        const now = Date.parse(utc);
        let best: SkyEvent | null = null;
        for (const e of events) {
          if (!e.type.startsWith(body)) continue;
          const ms = Date.parse(e.utc);
          if (ms > now && (best === null || ms < Date.parse(best.utc))) best = e;
        }
        return best;
      };
      const updateCountdown = (utc: string): void => {
        // La puesta mas cercana sigue disponible en `data-countdown` (compatibilidad); se agregan las salidas.
        const lines: string[] = [];
        for (const body of ['sun', 'earth'] as const) {
          const ev = nextOf(body, utc);
          if (ev) lines.push(`${LABELS[ev.type]()} ${formatRemaining(Date.parse(ev.utc) - Date.parse(utc))}`);
        }
        countdown.textContent = lines.length > 0 ? lines.join(' · ') : '--';
      };

      const load = async (): Promise<void> => {
        const id = ++run;
        status.textContent = tr('sky.loading', 'Calculando...');
        try {
          const at = currentUtc;
          const end = isoPlus(at, WINDOW_MS);
          const mEnd = isoPlus(at, METRICS_DAYS * 24 * 3600 * 1000);
          if (!end || !mEnd) throw new Error('utc');
          const [sky, horizon, evs, m] = await Promise.all([
            deps.getSky(ctx.site, at),
            deps.getHorizon(ctx.site),
            deps.findEvents(ctx.site, at, end),
            deps.getMetrics(ctx.site, at, mEnd, 60),
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
          insertSvg(
            diagramHost,
            renderSkyDiagram({ horizon, sky, size: 480, sunLabel: tr('scene.sun', 'Sol'), earthLabel: tr('scene.earth', 'Tierra') }),
          );
          tech.textContent = '';
          addLine(tech, `${tr('scene.sun', 'Sol')}: az ${f1(sky.sun.azimuthDeg)}°, el ${f1(sky.sun.elevationDeg)}°`);
          addLine(tech, `${tr('scene.earth', 'Tierra')}: az ${f1(sky.earth.azimuthDeg)}°, el ${f1(sky.earth.elevationDeg)}°`);
          addLine(tech, `${tr('sky.windowNote', 'Próximos 30 días')}:`);
          addLine(tech, `${tr('sky.maxSunEl', 'Elevación máxima del Sol')}: ${f1(m.maxSunElevationDeg)}°`);
          addLine(tech, `${tr('sky.sunlit', 'Fracción iluminada')}: ${pct(m.sunlitFraction)}`);
          addLine(tech, `${tr('sky.longestLight', 'Luz continua más larga')}: ${f1(m.longestLightHours)} h`);
          addLine(tech, `${tr('sky.longestDark', 'Oscuridad continua más larga')}: ${f1(m.longestDarkHours)} h`);
          addLine(tech, `${tr('sky.earthVisible', 'Tierra visible')}: ${pct(m.earthVisibleFraction)}`);
          addLine(tech, `${tr('sky.commsWindow', 'Ventana de comunicación más larga')}: ${f1(m.longestCommsWindowHours)} h`);
          addLine(tech, `${tr('sky.commsGap', 'Corte de comunicación más largo')}: ${f1(m.longestCommsGapHours)} h`);
          addLine(tech, uncertaintyText(m.demResolutionM, deps.lang?.() ?? 'es'));
          if (meta) addLine(tech, `${meta.source}${meta.note ? `: ${meta.note}` : ''}`);
          updateCountdown(currentUtc);
        } catch (e) {
          if (disposed || id !== run) return;
          status.textContent = e instanceof Error ? e.message : String(e);
        }
      };

      const time = deps.time?.();
      let loadedAt = currentUtc;
      let reload: ReturnType<typeof setTimeout> | undefined;
      const unsub = time?.onChange((u) => {
        currentUtc = u;
        updateCountdown(u);
        // Recalcula el cielo si la hora se movio mas de 10 minutos (con espera para no saturar).
        if (Math.abs(Date.parse(u) - Date.parse(loadedAt)) > 10 * 60_000) {
          if (reload !== undefined) clearTimeout(reload);
          reload = setTimeout(() => {
            reload = undefined;
            loadedAt = currentUtc;
            void load();
          }, 400);
        }
      });
      if (time) currentUtc = time.getUtc();
      loadedAt = currentUtc;
      void load();

      return () => {
        disposed = true;
        if (reload !== undefined) clearTimeout(reload);
        unsub?.();
        root.remove();
      };
    },
  };
}
