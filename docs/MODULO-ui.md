# Módulo ui
Paquete `@lunar/ui`: sistema de diseño, menú, panel de sitio y pantalla Acerca de.
## API pública
- Diseño: `setTheme(theme, root?)` / `getTheme(root?)` (`'light' | 'dark' | 'system'`, atributo `data-theme`), `LOGO_SVG` (logo propio, sin logo de la NASA) y `TOKENS_CSS_PATH` (`design/tokens.css`, variables `--ln-*`).
- `createMenu(container, items, i18n)`: menú accesible con `MenuHandle`.
- `openSitePanel(opts)` / `anchorFor(scene, siteId)`: panel junto al sitio, anclado con `scene.getSiteScreenAnchor`.
- `SUMMARY_TAB_ID` (`resumen`), `createSummaryTab(i18n)`, `registerSummaryTab(i18n)` (idempotente).
- `mountAbout(container, manifest)`, `DISCLAIMER`, `NON_ENDORSEMENT`, `DATA_CREDITS`: créditos del manifiesto y aviso de no aval.
## Registro
`apps/web/src/modules/ui.ts` carga `tokens.css` y registra la pestaña `resumen`. Las traducciones se resuelven con `ctx.services.i18n` al renderizar, así que el orden de registro no importa.
## Errores
Un manifiesto inválido en `mountAbout` muestra un mensaje de error en lugar de lanzar.
