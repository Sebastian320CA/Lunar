export { setTheme, getTheme } from './design/theme.js';
export type { Theme } from './design/theme.js';
export { LOGO_SVG } from './design/logo.js';
/** Ruta de los tokens CSS (`--ln-*`) relativa a `packages/ui/src`; el CSS lo carga la app. */
export const TOKENS_CSS_PATH = 'design/tokens.css';
export { createMenu } from './menu/menu.js';
export type { MenuItem, MenuHandle } from './menu/menu.js';
export { openSitePanel, anchorFor } from './panel/panel.js';
export type { SitePanelOptions, SitePanelHandle } from './panel/panel.js';
export { SUMMARY_TAB_ID, createSummaryTab, registerSummaryTab } from './panel/summaryTab.js';
export { mountAbout, DISCLAIMER, NON_ENDORSEMENT, DATA_CREDITS } from './about/about.js';
export type { DataCredit } from './about/about.js';
