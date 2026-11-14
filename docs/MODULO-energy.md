# Módulo energy

Paquete `@lunar/energy`: generación solar, batería, gráficos SVG y la pestaña "Energía".

## API pública
- Física: `irradianceWm2(distanciaKm)` (constante solar 1361 W/m² a 1 UA = 149597870.7 km, ley del inverso del cuadrado) e `incidenceCos`.
- Métodos (`methods`): `horizontal`, `fixedTilt`, `vertical`, `singleAxis`, `dualAxis`, `mast`, `constantSource`. Potencia = área × eficiencia × irradiancia × cos(incidencia) × (1 si `sky.sun.aboveTerrainHorizon`, si no 0).
- Valores por defecto en `PARAM_DEFAULTS` (cada uno con unidad y fuente; los ejemplos dicen "ejemplo editable, PENDIENTE fuente").
- Series: `computeSeries(method, inputs)`, `cumulativeEnergyWh`, `totalEnergyWh`.
- Batería: `createBattery({ capacityWh, loadW, efficiency }).simulate(powerSeries, stepSeconds)` devuelve estado de carga y horas de noche resistidas.
- Gráficos: `powerChartSvg`, `cumulativeEnergySvg`, `methodComparisonSvg`, `siteComparisonSvg`. Devuelven cadenas SVG con etiquetas saneadas y escapadas, sin recursos externos.
- Pestaña: `createEnergyTab(deps)` devuelve un `PanelTab` con id `energia` y `titleKey` `energy.title`.

## Pestaña "Energía"
Selector de método, parámetros editables (se validan como números finitos dentro de un rango; si no, se muestra el error y no se calcula), gráficos de potencia, energía acumulada y comparación de métodos, y un resumen de batería. Todo el texto se escribe con `textContent`. Los SVG se insertan parseándolos con `DOMParser` y copiando los nodos a un elemento `svg`, sin `innerHTML`. Al final hay un `<div data-solar-view>` donde se monta `services.solarView?.()`, que recibe el último `EnergyResult` y el `BodyState` del Sol. Si la vista no existe, la pestaña funciona sin ella. El desmontaje libera la vista y los eventos.

## Registro
`apps/web/src/modules/energy.ts` registra la pestaña con `registerPanelTab`. Usa `services.ephemeris.getSeries`, `services.solarView` y `services.i18n` en el momento de usarlos, así que el orden de registro entre módulos no importa.

## Solicitud al contrato
- `TerrainService.getHorizon` no recibe altura de observador: el método `mast` usa el parámetro `mastHorizonElevDeg`, que debe entregar quien llama desde el terreno a la altura del mástil. En la pestaña es un campo editable (por defecto 0°, PENDIENTE fuente).
- Los parámetros por defecto (área, eficiencia, inclinación, potencia constante, batería, carga) son ejemplos editables, PENDIENTE fuente.

## Errores
Parámetro inválido: mensaje junto al campo y sin cálculo. Efemérides no disponibles o fallo de `getSeries`: se muestra el mensaje en el estado de la pestaña. Resultados de un cálculo anterior se descartan si hay uno más reciente o si la pestaña se desmontó.
