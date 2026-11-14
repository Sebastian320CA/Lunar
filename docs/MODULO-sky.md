# Módulo sky
Paquete `@lunar/sky`: métricas del sitio, diagrama del cielo, cuenta regresiva y la pestaña "Sol y Tierra".

## API pública
- `computeSiteMetrics({ ephemeris, terrain }, site, startUtc, endUtc, stepMin)`: devuelve `SiteMetrics` (elevación máxima del Sol, fracción iluminada, racha más larga de luz y de oscuridad, visibilidad de la Tierra, ventana y corte de comunicación, resolución del DEM). Rechaza con un error que nombra el parámetro inválido.
- `uncertaintyText(demResolutionM, lang)`: texto de incertidumbre ligado a la resolución del DEM (`es` o `en`).
- `renderSkyDiagram({ horizon, sky, size })`: SVG como cadena; el texto pasa por `sanitizeText` y se escapa.
- `nextSetEvent`, `formatRemaining`, `countdownText`, `createCountdown`: cuenta regresiva a la próxima puesta del Sol o de la Tierra.
- `createSkyTab(deps)`: `PanelTab` con id `sol-tierra` y `titleKey` `sky.tab`.

## Pestaña "Sol y Tierra"
Muestra un resumen en lenguaje sencillo (Sol y Tierra sobre o bajo el horizonte del terreno), la cuenta regresiva, el diagrama del cielo y un bloque `<details>` plegable con el detalle técnico (ángulos, métricas, incertidumbre del DEM y fuente de efemérides). Si `ephemerisMeta.approximate` es verdadero, muestra la etiqueta "Datos aproximados". Todo el texto se escribe con `textContent`. El SVG se inserta con `DOMParser` y `importNode`, sin `innerHTML`. Las etiquetas de la cuenta regresiva pasan por i18n (`sky.sunsetIn`, `sky.earthsetIn`) y, si falta la clave, se usa el texto en español. La cuenta regresiva se actualiza con `time.onChange` y se cancela al desmontar.

## Registro
`apps/web/src/modules/sky.ts` asigna `services.metrics` y registra la pestaña con `registerPanelTab`. Efemérides, terreno, tiempo e i18n se buscan en `ctx.services` en el momento de usarlos, así que el orden de carga entre módulos no importa.

## Errores
Servicio ausente o fallo de cálculo: el mensaje se muestra en el estado de la pestaña. Un cálculo anterior se descarta si hay uno más reciente o si la pestaña se desmontó.

## Pendiente
Los textos fijos de la sección técnica están en español y no pasan por i18n; solo las claves `sky.*` mencionadas arriba se traducen.
