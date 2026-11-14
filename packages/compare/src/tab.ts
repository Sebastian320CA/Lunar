import type { LunarSite, PanelContext, PanelTab, SiteMetrics } from '@lunar/contracts';
import { barChartSvg, sensitivityLineSvg, type MetricKey } from './charts.js';
import {
  DEFAULT_WEIGHTS,
  addScenario,
  compareMetrics,
  sensitivity,
  viabilityIndex,
  type Scenario,
  type ViabilityWeights,
} from './core.js';

export const COMPARE_TAB_ID = 'comparar';

export interface CompareTabDeps {
  /** Resolved on each use so registration order does not matter. */
  metrics(site: LunarSite, startUtc: string, endUtc: string, stepMin: number): Promise<SiteMetrics>;
  /** Catalogue of sites available for the picker. */
  sites(): LunarSite[];
  /** Optional translator; the key itself is used when absent. */
  t?: (key: string) => string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const STEP_MIN = 60;
const DAY_MS = 86_400_000;

const WEIGHT_LABELS: Record<keyof ViabilityWeights, string> = {
  sunlit: 'Fraccion iluminada',
  longestLight: 'Luz continua mas larga',
  earthVisible: 'Tierra visible',
  commsWindow: 'Ventana de comunicacion mas larga',
  commsGap: 'Hueco de comunicacion (penaliza)',
  longestDark: 'Noche mas larga (penaliza)',
};

const CHART_METRICS: { key: MetricKey; title: string }[] = [
  { key: 'sunlitFraction', title: 'Fraccion iluminada (0..1)' },
  { key: 'earthVisibleFraction', title: 'Tierra visible (0..1)' },
  { key: 'longestDarkHours', title: 'Noche mas larga (h)' },
  { key: 'longestCommsGapHours', title: 'Hueco de comunicacion (h)' },
];

function insertSvg(host: HTMLElement, svg: string): void {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) return;
  const el = document.createElementNS(SVG_NS, 'svg');
  for (const a of Array.from(root.attributes)) el.setAttribute(a.name, a.value);
  for (const child of Array.from(root.childNodes)) el.appendChild(document.importNode(child, true));
  host.appendChild(el);
}

function parseUtc(raw: string): string | undefined {
  const t = Date.parse(raw.trim());
  return Number.isFinite(t) && /Z$/.test(raw.trim()) ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : undefined;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createCompareTab(deps: CompareTabDeps): PanelTab {
  const tr = (k: string): string => deps.t?.(k) ?? k;

  return {
    id: COMPARE_TAB_ID,
    titleKey: 'compare.title',
    mount(container: HTMLElement, ctx: PanelContext): () => void {
      let disposed = false;
      let run = 0;
      let scenarios: Scenario[] = [];
      const weights: ViabilityWeights = { ...DEFAULT_WEIGHTS };

      const root = el('div');
      root.appendChild(el('h3', tr('compare.title')));
      root.appendChild(
        el(
          'p',
          'Compara hasta 3 escenarios (sitio e intervalo UTC). El indice de viabilidad es un promedio ponderado de ' +
            'componentes normalizados de 0 a 100; ajusta los pesos para ver como cambia el orden. Los resultados ' +
            'dependen del sitio y de las fechas elegidas, no son una prediccion de mision.',
        ),
      );

      // Scenario picker.
      const sitePick = el('select');
      const sites = deps.sites();
      for (const s of sites) {
        const o = el('option', s.name);
        o.value = s.id;
        if (s.id === ctx.site.id) o.selected = true;
        sitePick.appendChild(o);
      }
      if (!sites.some((s) => s.id === ctx.site.id)) {
        const o = el('option', ctx.site.name);
        o.value = ctx.site.id;
        o.selected = true;
        sitePick.appendChild(o);
      }
      const siteLabel = el('label', 'Sitio ');
      siteLabel.appendChild(sitePick);

      const startMs = Date.parse(ctx.utc);
      const iso = (ms: number): string => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
      const startIn = el('input');
      startIn.type = 'text';
      startIn.value = Number.isFinite(startMs) ? iso(startMs) : ctx.utc;
      const endIn = el('input');
      endIn.type = 'text';
      endIn.value = Number.isFinite(startMs) ? iso(startMs + 3 * DAY_MS) : ctx.utc;
      const startLabel = el('label', 'Inicio UTC ');
      startLabel.appendChild(startIn);
      const endLabel = el('label', 'Fin UTC ');
      endLabel.appendChild(endIn);

      const addBtn = el('button', 'Agregar escenario');
      addBtn.type = 'button';
      const clearBtn = el('button', 'Limpiar');
      clearBtn.type = 'button';
      const status = el('p');
      status.setAttribute('role', 'status');
      const listEl = el('ul');
      root.append(siteLabel, startLabel, endLabel, addBtn, clearBtn, status, listEl);

      // Weights.
      const wBox = el('fieldset');
      wBox.appendChild(el('legend', 'Pesos del indice de viabilidad'));
      const wOut = new Map<string, HTMLElement>();
      (Object.keys(DEFAULT_WEIGHTS) as (keyof ViabilityWeights)[]).forEach((k) => {
        const row = el('div');
        const label = el('label', `${WEIGHT_LABELS[k]} `);
        const input = el('input');
        input.type = 'range';
        input.min = '0';
        input.max = '10';
        input.step = '1';
        input.value = String(weights[k]);
        const out = el('span', String(weights[k]));
        wOut.set(k, out);
        input.addEventListener('input', () => {
          const n = Number(input.value);
          weights[k] = Number.isFinite(n) ? n : 0;
          out.textContent = String(weights[k]);
          void render();
        });
        label.appendChild(input);
        row.append(label, out);
        wBox.appendChild(row);
      });
      root.appendChild(wBox);

      const results = el('div');
      results.setAttribute('aria-live', 'polite');
      const charts = el('div');
      const sensBtn = el('button', 'Por que cambia tanto');
      sensBtn.type = 'button';
      const sensOut = el('div');
      root.append(results, charts, sensBtn, sensOut);

      const showError = (e: unknown): void => {
        status.textContent = e instanceof Error ? e.message : String(e);
      };

      const renderList = (): void => {
        listEl.textContent = '';
        for (const s of scenarios) {
          listEl.appendChild(el('li', `${s.siteId}: ${s.utcStart} a ${s.utcEnd}`));
        }
      };

      async function render(): Promise<void> {
        const my = ++run;
        renderList();
        results.textContent = '';
        charts.textContent = '';
        if (scenarios.length === 0) return;
        try {
          const cmp = await compareMetrics(scenarios, (sc) => {
            const site = sites.find((s) => s.id === sc.siteId) ?? ctx.site;
            return deps.metrics(site, sc.utcStart, sc.utcEnd, STEP_MIN);
          });
          if (disposed || my !== run) return;
          const table = el('table');
          const head = el('tr');
          for (const h of ['Escenario', 'Indice (0-100)', 'Iluminada', 'Tierra visible', 'Noche mas larga (h)']) {
            head.appendChild(el('th', h));
          }
          table.appendChild(head);
          cmp.sideBySide.forEach((row, i) => {
            const hours = Math.max(1, (Date.parse(row.scenario.utcEnd) - Date.parse(row.scenario.utcStart)) / 3_600_000);
            const v = viabilityIndex(row.metrics, weights, hours);
            const tr_ = el('tr');
            tr_.append(
              el('td', `${i + 1}. ${row.scenario.siteId}`),
              el('td', v.score.toFixed(1)),
              el('td', row.metrics.sunlitFraction.toFixed(3)),
              el('td', row.metrics.earthVisibleFraction.toFixed(3)),
              el('td', row.metrics.longestDarkHours.toFixed(1)),
            );
            table.appendChild(tr_);
          });
          results.appendChild(table);
          const labels = cmp.sideBySide.map((r, i) => `${i + 1}. ${r.scenario.siteId}`);
          for (const m of CHART_METRICS) {
            insertSvg(charts, barChartSvg(cmp.sideBySide, m.key, labels, m.title));
          }
          status.textContent = '';
        } catch (e) {
          if (!disposed && my === run) showError(e);
        }
      }

      addBtn.addEventListener('click', () => {
        const a = parseUtc(startIn.value);
        const b = parseUtc(endIn.value);
        if (!a || !b || Date.parse(b) <= Date.parse(a)) {
          status.textContent = 'Fechas UTC invalidas: usa formato ISO con Z y fin posterior al inicio.';
          return;
        }
        const r = addScenario(scenarios, { siteId: sitePick.value, utcStart: a, utcEnd: b });
        if (!r.ok) {
          status.textContent = r.error;
          return;
        }
        scenarios = r.value;
        status.textContent = '';
        void render();
      });
      clearBtn.addEventListener('click', () => {
        scenarios = [];
        status.textContent = '';
        void render();
      });

      sensBtn.addEventListener('click', () => {
        const a = parseUtc(startIn.value);
        const b = parseUtc(endIn.value);
        if (!a || !b || Date.parse(b) <= Date.parse(a)) {
          status.textContent = 'Fechas UTC invalidas para el analisis de sensibilidad.';
          return;
        }
        const site = sites.find((s) => s.id === sitePick.value) ?? ctx.site;
        const my = ++run;
        sensOut.textContent = '';
        sensitivity(site, [-10, -5, 5, 10], [-2, -1, 1, 2], (s, x, y) => deps.metrics(s, x, y, STEP_MIN), {
          utcStart: a,
          utcEnd: b,
        })
          .then((entries) => {
            if (disposed || my !== run) return;
            insertSvg(sensOut, sensitivityLineSvg(entries, 'sunlitFraction', 'Sensibilidad: fraccion iluminada'));
            sensOut.appendChild(
              el('p', 'Desplazar el sitio unos km (norte positivo) o las fechas unos dias puede cambiar mucho la iluminacion.'),
            );
          })
          .catch((e: unknown) => {
            if (!disposed && my === run) showError(e);
          });
      });

      container.appendChild(root);
      return () => {
        disposed = true;
        root.remove();
      };
    },
  };
}
