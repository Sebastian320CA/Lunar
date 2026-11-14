# Módulo solar-view

Vista 3D del panel solar (`packages/solar-view`). Se monta dentro del contenedor `<div data-solar-view>` de la pestaña «Energía».

## API

- `createSolarPanelView(options?)` devuelve un `SolarPanelViewApi` (`mount`, `update`, `dispose`) definido en `@lunar/contracts`.
  - `mount(container)`: crea el renderizador y añade el canvas al contenedor.
  - `update(result: EnergyResult, sun: BodyState)`: orienta panel, rayo, indicador de elevación y brújula.
  - `dispose()`: libera recursos y retira el canvas. Es idempotente; `update` posterior no hace nada ni lanza error.
- Opciones: `createRenderer` (inyectable en pruebas), `maxPixelRatio` (por defecto 2, límite para móviles), `deploySeconds` (por defecto 1.5).
- `SOLAR_METHOD_IDS`: `fixed`, `single-axis`, `dual-axis`, `vertical`.
- Matemática pura (sin Three.js): `computeOrientation`, `panelNormal`, `rayDirection`, `directionFromAzEl`, `elevationIndicatorDeg`, `compassHeadingDeg`, `normalizeAzimuthDeg`.

Marco de referencia: x = este, y = arriba, z = sur (norte = -z). Azimut 0 = norte, en sentido horario.

## Registro

`apps/web/src/modules/solar-view.ts` asigna `ctx.services.solarView`, una fábrica que devuelve de inmediato una vista cuyo código (Three.js) se importa de forma diferida en el primer `mount`. Las llamadas anteriores a la carga se aplican al terminar (`mount` y el último `update`).

## Nodos GLB esperados

La implementación actual usa geometría procedural y todavía no carga ningún GLB. Cuando exista la entrada `solar-panel` en el manifiesto de assets, el modelo debe nombrar sus nodos:

- `panel`: la superficie del panel (se orienta según inclinación y azimut).
- `hinge`: la bisagra sobre la que gira el panel.

Si el GLB falta o no contiene esos nodos, se mantiene la geometría procedural, que usa esos mismos nombres.
