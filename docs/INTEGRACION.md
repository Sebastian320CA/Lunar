# Integración

Guía para integrar los 14 módulos en `apps/web`. Complementa `docs/CONTRATO.md` y los `docs/MODULO-<nombre>.md`.

## Registro de módulos

Cada módulo tiene un archivo `apps/web/src/modules/<nombre>.ts` que exporta un `WebModule` (definido en `apps/web/src/modules/context.ts`). `main.ts` construye el contexto con `createContext({ demo })` y carga los módulos con `import()` dinámico, en el orden de la tabla siguiente. Si un módulo falla, se muestra la pantalla de error de ese módulo y la carga continúa.

Los módulos publican servicios en `ctx.services` (por ejemplo `services.ephemeris`, `services.sites`, `services.time`) y las pestañas con `registerPanelTab`. Los módulos consultan `ctx.services` en el momento de usar un servicio, no al cargarse. Por eso el orden de carga fija qué servicio existe primero, pero ningún módulo falla si otro se registra después.

## Orden de integración y dependencias

| # | Módulo | Depende de (en ejecución) | Publica |
|---|--------|---------------------------|---------|
| 1 | i18n | scene3d (diferido, para `focusEarthOn`) | `services.i18n` |
| 2 | ui | i18n (al renderizar) | pestaña `resumen`, `tokens.css` |
| 3 | ephemeris | terreno (diferido, horizonte) | `services.ephemeris`, `services.ephemerisMeta` |
| 4 | terrain | ninguna | `services.terrain` |
| 5 | sites | ephemeris (diferido, saltos de evento) | `services.sites`, `services.time` |
| 6 | scene3d | ephemeris y time (dirección solar) | `services.scene` |
| 7 | sky | ephemeris, terrain, time, i18n | `services.metrics`, pestaña `sol-tierra` |
| 8 | energy | ephemeris, terrain, solarView, i18n | pestaña `energia` |
| 9 | compare | metrics | pestaña `comparar` |
| 10 | solar-view | energy lo monta; Three.js se importa al primer `mount` | `services.solarView` |
| 11 | export | ninguna | `services.exportReport`, `downloadBlob` |
| 12 | edu | security (paquetes de clase) | pestaña `edu` |
| 13 | edu-games | ephemeris (solo el juego explorer) | juegos `projectileGame`, `blocksGame`, `explorerGame` |

Los 13 módulos de la tabla corresponden a los archivos de `apps/web/src/modules` (el módulo `sites` incluye la línea de tiempo). El catorceavo paquete es `@lunar/security`, que es la base y no tiene archivo de módulo: ya está terminado y todos los demás dependen de él para validar entradas. Ajustar este conteo si se agrega o separa otro paquete.

Dependencias de datos y de paquetes: `@lunar/contracts` (tipos, no se modifican) y `@lunar/security` (validadores, `Result<T>`, `sanitizeText`) los usan todos.

## Criterio de cierre por módulo

Un módulo se considera integrado cuando cumple las cuatro condiciones:

1. La API pública está exportada en `packages/<nombre>/src/index.ts`.
2. `pnpm --filter @lunar/<nombre> test` pasa, y `pnpm lint` y `pnpm build` no fallan por ese paquete.
3. Existe `docs/MODULO-<nombre>.md` con API, forma de probar, límites conocidos y "Solicitud al contrato".
4. Está registrado en `apps/web/src/modules/<nombre>.ts` y cargado desde `main.ts`.

Solo la última subtarea de cada módulo toca `index.ts`, el documento y el archivo de módulo.

## Carga de datos desde `/data`

- `ctx.dataUrl(rutaRelativa)` resuelve archivos de `data/` con `import.meta.glob(..., { query: '?url' })` y devuelve `undefined` si el archivo no existe. Cada módulo decide su respaldo (ver abajo).
- `ctx.assetUrl(rutaRelativa)` antepone `/assets/`.
- Sin red en ejecución, sin CDN. Los decodificadores de Three.js se sirven desde `/assets/decoders/`.
- Archivos usados: `data/sites/sites.json`, `data/terrain/<siteId>.json`, `data/ephemeris/ephemeris.json` y `ephemeris.bin`.
- Respaldos: sin efemérides binarias, `AnalyticSource` (Meeus, aproximada); sin perfil de terreno, `sphericalHorizon`; sin GLB o textura, esfera Placeholder.
- `ephemeris.bin` (unos 12,6 MB) supera `assetsInlineLimit` de Vite y se sirve como archivo.

## Registro de decisiones

| Fecha | Decisión | Motivo | Módulos afectados |
|-------|----------|--------|-------------------|
| 2026-11-14 | Mantener `typescript` 7.0.2 en la raíz para `tsc` de cada paquete y fijar `typescript` 5.9.3 en `tools/lint`, donde corre ESLint con `typescript-eslint` 8.72.2. | `typescript-eslint` no soporta TS 7 (según la versión instalada), así que el lint usa su propia copia de TS 5.9.3. Se revisa cuando `typescript-eslint` declare soporte. | todos (lint y build) |
| 2026-11-14 | Marco de efemérides Mean Earth (ME), origen en el centro de la Luna, km. En `ephemeris.json` el marco es `MOON_ME_DE440_ME421`. | Coincide con el marco de las coordenadas de los sitios. En scene3d se mapea a la escena con `scene = (me.y, me.z, me.x)`. | ephemeris, scene3d, sky, terrain |
| 2026-11-14 | Longitud canónica en (-180, 180]. | Un solo formato evita duplicados (por ejemplo -180 y 180). Lo validan `validateLon`, `parseSites` y `focusMoonOn`/`focusEarthOn`. | sites, scene3d, i18n, security |
| 2026-11-14 | Los datos de efemérides se llaman `data/ephemeris/ephemeris.json` y `ephemeris.bin` (encabezado más binario Float64 little-endian, 6 columnas). | Nombre único, con SHA-256 en el encabezado para validar antes de usar. Cobertura 2025-01-01 a 2030-01-01, paso de 600 s. | ephemeris |
| 2026-11-14 | `APOLLO_SITE_IDS` de `@lunar/contracts` es la única fuente de ids Apollo. | Evita ids repetidos o distintos entre catálogo, panel y escena. | sites, contracts |
| 2026-11-14 | Las rutas del manifiesto son relativas a `/assets` (por ejemplo `models/Moon_1_3474.glb`). | `assetUrl` antepone `/assets/`; así el manifiesto sirve igual en desarrollo y en `dist`. | scene3d, ui (Acerca de), solar-view |
| 2026-11-14 | Respaldo analítico con Meeus (caps. 25, 47 y 53), serie truncada y marcado como aproximado (`ANALYTIC_NOTE`, `ephemerisMeta.approximate`). | La app debe funcionar sin `ephemeris.bin`. La exactitud frente a Horizons queda PENDIENTE hasta ejecutar `compare_horizons.py`. | ephemeris, sky, ui |
| 2026-11-14 | Horizonte esférico de respaldo: radio 1737,4 km, 0° a altura 0, `demResolutionM = 1737400` como valor centinela y `demSource` que empieza con "PENDIENTE: sin DEM". | Sin DEM no se inventan perfiles. El centinela permite a la UI mostrar la incertidumbre. | terrain, sky, energy |
| 2026-11-14 | `zod` 4.6.7, versión exacta, solo en `@lunar/contracts` y `@lunar/security`. | Los esquemas (`ManifestSchema`, `ClassPackageSchema`, validadores) necesitan validación en tiempo de ejecución con tipos inferidos y errores por campo. Es la única librería de validación y está en la base. Los demás paquetes no la usan directamente. | contracts, security |
| 2026-11-14 | Se usa el limbo superior del Sol y la Tierra, sin refracción. | La salida y la puesta se definen con el borde superior. La Luna no tiene atmósfera. | ephemeris, sky |
| 2026-11-14 | Escena con los GLB `moon-glb` y `earth-glb` (esferas con cube-map) en lugar de esferas lisas; rotacion fija calibrada con rasgos conocidos (`MOON_MODEL_ROTATION`, `EARTH_MODEL_ROTATION`). | Las texturas sueltas no existen; los GLB ya traen textura. Error medido: ~2° (Luna), 1-6° (Tierra). | scene3d |
| 2026-11-14 | `GLTFLoader` usa `TextureLoader` (`<img>`) para texturas embebidas. | `ImageBitmapLoader` usa `fetch(blob:)` y la CSP exige `connect-src 'self'` exacto. | scene3d |
| 2026-11-14 | Fuente de efemerides `HybridSource`: binario SPICE en 2025-2030 y Meeus fuera de ese rango. SHA-256 en TypeScript si falta `crypto.subtle`. | La linea de tiempo no debe fallar fuera de la cobertura; servida por HTTP en red local no hay contexto seguro. | ephemeris |
| 2026-11-14 | Modo `landing` con la Tierra en su direccion fisica (efemerides, marco de la Luna) y camara con la normal local como "arriba". Transiciones nuevas: `free`/`landing` -> `site`, `intro` -> `map`. | Resuelve el PENDIENTE de `landingPose` en `docs/MODULO-scene3d.md`. | scene3d |
| 2026-11-14 | Shell nuevo (`apps/web/src/shell`): barra superior, lista de sitios, tarjeta con cielo en vivo, linea de tiempo, menu, dialogos; textos en el namespace `shell` de los 13 idiomas. Preferencias de idioma y tema en `localStorage`. | Interfaz completa y traducible. | web, i18n, ui, sky, energy, compare, edu |
| 2026-11-14 | `pdf-lib` para el PDF, solo fuentes estándar hasta tener un archivo de fuente. | Solo TypeScript y sin recursos remotos. Fuente PENDIENTE. | export |

Los cambios a `packages/contracts` requieren una entrada nueva en esta tabla antes de hacerse.

## Procedimiento "Solicitud al contrato"

Los tipos de `packages/contracts` no se cambian desde un módulo. Si un módulo necesita algo que el contrato no expresa:

1. Anotarlo en la sección "Solicitud al contrato" de su `docs/MODULO-<nombre>.md` (qué falta, por qué y la solución provisional usada). Si no hay nada, escribir "Ninguna".
2. Agregarlo a la lista siguiente de este documento.
3. Quien mantiene el contrato decide. Si se acepta, se cambia `packages/contracts`, se registra la decisión en la tabla anterior (fecha, motivo, módulos afectados) y se actualizan los módulos afectados.
4. Mientras tanto, el módulo funciona con la solución provisional documentada.

Solicitudes abiertas (recogidas de los `docs/MODULO-*.md`):

- **energy**: `TerrainService.getHorizon` no recibe la altura del observador. El método `mast` usa el parámetro `mastHorizonElevDeg`, que debe entregar quien llama; por defecto 0° (PENDIENTE fuente). Los parámetros por defecto (área, eficiencia, inclinación, potencia constante, batería, carga) son ejemplos editables (PENDIENTE fuente).
- **compare**: ninguna.
- Los demás módulos no declaran solicitudes en su documento. Revisar `docs/MODULO-*.md` al cerrar cada módulo.

## Datos PENDIENTE y fuente esperada

La lista detallada con rutas y comportamiento mientras tanto estará en `docs/RECURSOS-PENDIENTES.md`. Resumen:

| Dato | Fuente esperada | Estado |
|------|-----------------|--------|
| DEM para perfiles de horizonte (`data/terrain/<siteId>.json`) | LRO LOLA, PDS Geosciences Node (confirmar producto y resolución exactos) | Sin DEM; se usa `sphericalHorizon` |
| Coordenadas de candidatos Artemis (polo sur) y otros sitios en `data/sites/pending-sites.json` | Páginas de misión NASA NSSDCA, LROC QuickMap, USGS Gazetteer of Planetary Nomenclature | Sin coordenadas; no se inventan |
| Texturas `moon-color.webp`, `moon-height.webp`, `earth-color.webp` | NASA SVS CGI Moon Kit, NASA Moon Trek (producto `LRO_WAC_Mosaic_Global_303ppd_v02`) | Esfera sin textura |
| Créditos y licencias de los GLB (`Moon_1_3474.glb`, `Earth_1_12756.glb` y el modelo de Aeronomy of Ice in the Mesosphere) | Origen de cada archivo, por confirmar | Marcados "PENDIENTE (confirmar origen)" en el manifiesto |
| Formas de países y continentes del menú | Natural Earth (dominio público), `tools/i18n-data/fetch_natural_earth.py` | Botones de forma simple |
| Coordenadas de `LANGUAGE_FOCUS` | Natural Earth, `tools/i18n-data/build_focus.py` | Capitales aproximadas con `verified: false` |
| Traducciones de 11 idiomas (distintos de es y en) | Revisión por hablantes nativos | Plantillas con la marca "traduccion automatica pendiente de revision" |
| ΔT (TD−UT) para el respaldo Meeus | IERS / USNO (valores medidos y predicciones), por confirmar | Pendiente de confirmar el valor usado en `AnalyticSource` |
| Exactitud frente a Horizons | `tools/ephemeris-data/compare_horizons.py` contra JPL Horizons | Tabla de resultados vacía |
| Kernels NAIF (nombres, versiones y SHA-256) | `naif.jpl.nasa.gov` | `download_kernels.py` por verificar |
| Fuente tipográfica para el PDF | Fuente con licencia abierta | Fuentes estándar del PDF |
| Orientación de texturas y GLB; dirección de la Tierra en `landingPose` | Captura visual de la escena | Ver `docs/MODULO-scene3d.md` |

QuickMap es de la Universidad Estatal de Arizona (ASU), no un sitio de la NASA. Inspirado en NASA Space Apps - No avalado por la NASA.
