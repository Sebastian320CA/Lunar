import type {
  EnergyMethod,
  EnergyResult,
  LunarSite,
  PanelContext,
  PanelTab,
  SkyState,
  SolarPanelViewApi,
} from '@lunar/contracts';
import { createBattery } from './battery';
import { cumulativeEnergySvg, methodComparisonSvg, powerChartSvg } from './charts';
import { PARAM_DEFAULTS } from './defaults';
import { methods as allMethods } from './methods';
import { computeSeries, cumulativeEnergyWh, totalEnergyWh } from './series';

export interface EnergyTabDeps {
  /** Resolved on each use so registration order does not matter. */
  getSeries(site: LunarSite, startUtc: string, endUtc: string, stepMin: number): Promise<SkyState[]>;
  /** Optional factory of the 3D panel view (`services.solarView`). */
  solarView?: () => SolarPanelViewApi;
  /** Optional translator; the key itself is used when absent. */
  t?: (key: string) => string;
  methods?: EnergyMethod[];
}

interface Field {
  key: string;
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
}

export const ENERGY_TAB_ID = 'energia';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Parses a finite number within [min, max]; returns undefined otherwise. */
export function parseBounded(raw: string, min: number, max: number): number | undefined {
  const s = raw.trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
}

function fields(): Field[] {
  const d = (k: string): number => PARAM_DEFAULTS[k]?.value ?? 0;
  return [
    { key: 'areaM2', label: 'Area', unit: 'm2', value: d('areaM2'), min: 0.0001, max: 1e6 },
    { key: 'efficiency', label: 'Eficiencia', unit: '0..1', value: d('efficiency'), min: 0, max: 1 },
    { key: 'tiltDeg', label: 'Inclinacion', unit: 'grados', value: d('tiltDeg'), min: 0, max: 90 },
    { key: 'panelAzimuthDeg', label: 'Azimut del panel', unit: 'grados', value: d('panelAzimuthDeg'), min: 0, max: 360 },
    { key: 'mastHorizonElevDeg', label: 'Horizonte a altura del mastil', unit: 'grados', value: d('mastHorizonElevDeg'), min: -90, max: 90 },
    { key: 'constantPowerW', label: 'Potencia constante', unit: 'W', value: d('constantPowerW'), min: 0, max: 1e9 },
    { key: 'durationH', label: 'Duracion', unit: 'h', value: 72, min: 1, max: 720 },
    { key: 'stepMin', label: 'Paso', unit: 'min', value: 30, min: 1, max: 1440 },
    { key: 'batteryWh', label: 'Capacidad de bateria', unit: 'Wh', value: 100, min: 0, max: 1e9 },
    { key: 'loadW', label: 'Carga', unit: 'W', value: 10, min: 0, max: 1e9 },
    { key: 'batteryEff', label: 'Eficiencia de carga', unit: '0..1', value: 0.9, min: 0, max: 1 },
  ];
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

function addMinutesIso(utc: string, minutes: number): string | undefined {
  const t = Date.parse(utc);
  if (!Number.isFinite(t)) return undefined;
  return new Date(t + minutes * 60000).toISOString().replace(/\.\d+Z$/, 'Z');
}

export function createEnergyTab(deps: EnergyTabDeps): PanelTab {
  /** Traduce con respaldo: i18n devuelve la propia clave si falta. */
  const tr = (k: string, fallback?: string): string => {
    const v = deps.t?.(k);
    return v && v !== k ? v : (fallback ?? k);
  };
  const fieldLabel = (f: Field): string => tr(`energy.field.${f.key}`, f.label);
  const unitLabel = (f: Field): string => (f.unit === 'grados' ? tr('energy.unit.deg', 'grados') : f.unit);
  const methodLabel = (m: EnergyMethod): string => tr(`energy.method.${m.id}`, m.label);
  const list = deps.methods ?? allMethods;

  return {
    id: ENERGY_TAB_ID,
    titleKey: 'energy.title',
    mount(container: HTMLElement, ctx: PanelContext): () => void {
      let disposed = false;
      let view: SolarPanelViewApi | undefined;
      let run = 0;

      const root = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = tr('energy.title', 'Energía solar');
      root.appendChild(heading);

      const methodLabelEl = document.createElement('label');
      methodLabelEl.textContent = `${tr('energy.method', 'Método')} `;
      const select = document.createElement('select');
      for (const m of list) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = methodLabel(m);
        select.appendChild(o);
      }
      methodLabelEl.appendChild(select);
      root.appendChild(methodLabelEl);

      const inputs = new Map<string, { input: HTMLInputElement; field: Field }>();
      for (const f of fields()) {
        const row = document.createElement('div');
        const label = document.createElement('label');
        label.textContent = `${fieldLabel(f)} (${unitLabel(f)}) `;
        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'decimal';
        input.value = String(f.value);
        label.appendChild(input);
        row.appendChild(label);
        root.appendChild(row);
        inputs.set(f.key, { input, field: f });
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tr('energy.calculate', 'Calcular');
      root.appendChild(button);

      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      root.appendChild(status);

      const summary = document.createElement('p');
      root.appendChild(summary);

      const chartHosts = [0, 1, 2].map(() => {
        const h = document.createElement('div');
        root.appendChild(h);
        return h;
      });

      const solarHost = document.createElement('div');
      solarHost.setAttribute('data-solar-view', '');
      root.appendChild(solarHost);

      container.appendChild(root);

      if (deps.solarView) {
        try {
          view = deps.solarView();
          view.mount(solarHost);
        } catch (e) {
          view = undefined;
          status.textContent = e instanceof Error ? e.message : tr('energy.no3d', 'Vista 3D no disponible.');
        }
      }

      function readValues(): Record<string, number> | undefined {
        const out: Record<string, number> = {};
        for (const [key, { input, field }] of inputs) {
          const v = parseBounded(input.value, field.min, field.max);
          if (v === undefined) {
            status.textContent = `${fieldLabel(field)}: ${tr('energy.rangeError', 'número entre')} ${field.min} – ${field.max}.`;
            input.setAttribute('aria-invalid', 'true');
            return undefined;
          }
          input.removeAttribute('aria-invalid');
          out[key] = v;
        }
        return out;
      }

      async function calculate(): Promise<void> {
        const values = readValues();
        if (!values) return;
        const method = list.find((m) => m.id === select.value) ?? list[0];
        if (!method) return;
        const stepMin = values['stepMin'] ?? 30;
        const durationH = values['durationH'] ?? 72;
        const end = addMinutesIso(ctx.utc, durationH * 60);
        if (!end) {
          status.textContent = tr('energy.badUtc', 'Fecha UTC inválida.');
          return;
        }
        const id = ++run;
        status.textContent = tr('energy.calculating', 'Calculando...');
        let skies: SkyState[];
        try {
          skies = await deps.getSeries(ctx.site, ctx.utc, end, stepMin);
        } catch (e) {
          if (!disposed && id === run) status.textContent = e instanceof Error ? e.message : tr('energy.ephemerisError', 'Error de efemérides.');
          return;
        }
        if (disposed || id !== run) return;

        const params: Record<string, number> = {};
        for (const k of ['areaM2', 'efficiency', 'tiltDeg', 'panelAzimuthDeg', 'mastHorizonElevDeg', 'constantPowerW']) {
          params[k] = values[k] ?? 0;
        }
        const mk = (m: EnergyMethod): EnergyResult[] =>
          computeSeries(m, skies.map((sky) => ({ sky, params, stepSeconds: stepMin * 60 })));
        const results = mk(method);
        const xLabels = skies.length > 0 ? [skies[0]?.utc ?? '', skies[skies.length - 1]?.utc ?? ''] : [];
        const powers = results.map((r) => r.powerW);

        insertSvg(chartHosts[0] as HTMLElement, powerChartSvg([{ label: methodLabel(method), values: powers }], { xLabels, title: tr('energy.chart.power', 'Potencia') }));
        insertSvg(
          chartHosts[1] as HTMLElement,
          cumulativeEnergySvg([{ label: methodLabel(method), values: cumulativeEnergyWh(results) }], {
            xLabels,
            title: tr('energy.chart.cumulative', 'Energía acumulada'),
          }),
        );
        insertSvg(
          chartHosts[2] as HTMLElement,
          methodComparisonSvg(
            list.map((m) => ({ label: tr(`energy.short.${m.id}`, m.id), value: totalEnergyWh(mk(m)) })),
            { title: tr('energy.chart.methods', 'Comparación de métodos') },
          ),
        );

        const sim = createBattery({
          capacityWh: values['batteryWh'] ?? 0,
          loadW: values['loadW'] ?? 0,
          efficiency: values['batteryEff'] ?? 0,
        }).simulate(powers, stepMin * 60);
        summary.textContent =
          `${tr('energy.total', 'Energía total')}: ${totalEnergyWh(results).toFixed(2)} Wh. ` +
          `${tr('energy.nightEndured', 'Noche resistida')}: ${sim.nightEnduredHours.toFixed(2)} h. ` +
          `${sim.depleted ? tr('energy.depleted', 'Batería agotada') : tr('energy.notDepleted', 'Batería no agotada')}; ` +
          `${tr('energy.unmet', 'energía no suministrada')}: ${sim.unmetWh.toFixed(2)} Wh.`;
        status.textContent = '';

        const last = results[results.length - 1];
        const sky = skies[skies.length - 1];
        if (view && last && sky) view.update(last, sky.sun);
      }

      const onClick = (): void => {
        void calculate();
      };
      button.addEventListener('click', onClick);

      return () => {
        if (disposed) return;
        disposed = true;
        button.removeEventListener('click', onClick);
        try {
          view?.dispose();
        } catch {
          /* ignore view disposal errors */
        }
        root.remove();
      };
    },
  };
}
