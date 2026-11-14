import { getPanelTabs, registerPanelTab } from '@lunar/contracts';
import type { I18nApi, PanelContext, PanelTab } from '@lunar/contracts';

export const SUMMARY_TAB_ID = 'resumen';

/** Builds the `resumen` tab. All values go through textContent. */
export function createSummaryTab(i18n: I18nApi): PanelTab {
  return {
    id: SUMMARY_TAB_ID,
    titleKey: 'panel.summary',
    mount(container: HTMLElement, ctx: PanelContext): () => void {
      const { site } = ctx;
      const programKey = `shell.program.${site.program}`;
      const programText = i18n.t(programKey);
      const dl = document.createElement('dl');
      dl.className = 'ln-summary';
      const rows: Array<[string, string]> = [
        ['panel.name', site.name],
        ['panel.program', programText && programText !== programKey ? programText : site.program],
        ['panel.coordinates', `${site.latDeg.toFixed(4)}, ${site.lonDeg.toFixed(4)}`],
        ['panel.source', site.source],
        ['panel.verified', i18n.t(site.verified ? 'panel.verified' : 'panel.unverified')],
      ];
      for (const [key, value] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = i18n.t(key);
        const dd = document.createElement('dd');
        dd.textContent = value;
        dl.append(dt, dd);
      }
      if (!site.verified) {
        const marker = document.createElement('p');
        marker.className = 'ln-pending';
        marker.setAttribute('data-pending-marker', 'true');
        marker.textContent = i18n.t('panel.pending');
        container.append(dl, marker);
      } else {
        container.append(dl);
      }
      return () => {
        dl.remove();
        container.querySelector('[data-pending-marker]')?.remove();
      };
    },
  };
}

/** Registers the summary tab once (idempotent). */
export function registerSummaryTab(i18n: I18nApi): void {
  if (getPanelTabs().some((t) => t.id === SUMMARY_TAB_ID)) return;
  registerPanelTab(createSummaryTab(i18n));
}
