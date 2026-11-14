# Módulo compare

Paquete `@lunar/compare`: comparación de hasta 3 escenarios (sitio + intervalo UTC), índice de viabilidad y sensibilidad.

## API pública
- `addScenario(list, scenario)`: agrega sin mutar; el cuarto escenario devuelve `{ ok: false }`.
- `compareMetrics(scenarios, metricsFn)`: devuelve `sideBySide` (orden de alta) y `sequential` (por `utcStart`).
- `viabilityIndex(metrics, weights?, intervalHours?)`: promedio ponderado 0–100 con desglose por componente. Pesos visibles en `DEFAULT_WEIGHTS`.
- `sensitivity(site, shiftsKm, shiftsDays, metricsFn, interval)`: base, desplazamientos en km (norte positivo) y en días.
- `barChartSvg`, `sensitivityLineSvg`: cadenas SVG con texto escapado.
- `createCompareTab(deps)`: `PanelTab` con id `comparar`, selector de escenarios, deslizadores de pesos con etiquetas, tabla, gráficas y texto explicativo. Usa solo `textContent`; el SVG se inserta con `DOMParser` + `importNode`.

## Registro
`apps/web/src/modules/compare.ts` registra la pestaña. Las métricas vienen de `ctx.services.metrics` (módulo sky) y los sitios de `ctx.services.sites`; ambos se resuelven al usarlos, por lo que el orden de registro no importa. Sin servicio de métricas la pestaña muestra un error.

## Supuestos
- Las horas del índice se normalizan contra la duración del intervalo.
- El paso de muestreo de métricas es 60 min.
- La sensibilidad usa ±5 y ±10 km y ±1 y ±2 días; los sitios desplazados no están verificados.

## Solicitud al contrato
Ninguna.
