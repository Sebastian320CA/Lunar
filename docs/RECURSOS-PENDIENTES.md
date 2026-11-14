# Recursos pendientes

Lista de lo que falta para completar la app, con ruta esperada, formato, fuente sugerida y comportamiento mientras tanto. Contrastada con `public/assets/manifest.json` y los archivos en disco. Resumen complementario en `docs/INTEGRACION.md` (sección "Datos PENDIENTE").

Reglas generales:

- Nada se descarga en ejecución. Todo recurso se obtiene en compilación o a mano, se guarda en el repositorio y se acredita.
- No se inventan datos. Si falta una fuente, el valor queda marcado PENDIENTE.
- Fuentes externas: NASA (SVS, 3D Resources, Moon Trek, PDS, NAIF), USGS, Natural Earth. LROC QuickMap es de la Universidad Estatal de Arizona (ASU), no un sitio de la NASA.
- Inspirado en NASA Space Apps - No avalado por la NASA.

## Cómo agregar un recurso

1. Copiar el archivo a `public/assets/models/`, `textures/` o `audio/`.
2. Agregar o editar su entrada en `public/assets/manifest.json` (`id`, `path` relativo a `/assets`, `license`, `credit`; los modelos también `unitsToMeters`, `upAxis`, `nodes`, `polygons`). Extensiones válidas: `.glb`; `.webp .png .jpg .ktx2`; `.ogg .mp3 .wav`. El esquema es `ManifestSchema` en `packages/contracts/src/manifest.ts` (la sección `audio` es opcional).
3. Ejecutar desde la raíz: `powershell -File tools/validate-assets.ps1`. Informa FALTA, peso (aviso si un GLB pasa de 15 MB), "sin credito" y GLB en la carpeta sin entrada en el manifiesto. El script no revisa audio ni resolución de texturas; revisarlos a mano.
4. Cargar la escena y comprobar visualmente (ver `docs/MODULO-scene3d.md`).

Límites: GLB < 15 MB; texturas ≤ 4096 px, WebP o KTX2.

## Modelos 3D (GLB)

Estado en disco: `Aeronomy of Ice in the Mesosphere.glb` (0,31 MB), `Earth_1_12756.glb` (12,32 MB, cerca del límite), `Moon_1_3474.glb` (3,12 MB).

- [ ] **`apollo-lm`** → `public/assets/models/apollo-lm.glb`. Módulo lunar para la vista de aterrizaje. Falta el archivo; la entrada del manifiesto existe con `nodes: []` y `polygons: 0`. Fuente sugerida: [NASA 3D Resources](https://nasa3d.arc.nasa.gov/) (licencia: directrices de uso de medios de NASA; confirmar en el modelo). Al agregarlo, rellenar `polygons`, `nodes` y `unitsToMeters`. Mientras tanto: marcador Placeholder.
- [ ] **Confirmar origen y crédito de los tres GLB existentes** (`moon-glb`, `earth-glb`, `aeronomy-ice-mesosphere`). Sus entradas dicen "PENDIENTE (confirmar licencia)" y "PENDIENTE (confirmar origen)". Si no se confirma el origen o la licencia, retirar el archivo. Rellenar también `polygons` y `nodes`.
- [ ] **Panel solar** → `public/assets/models/solar-panel.glb` (id sugerido `solar-panel`; hoy no está en el manifiesto). Debe tener nodos llamados `panel` e `hinge`, con `hinge` como padre de `panel`, porque `packages/solar-view/src/view.ts` usa esos nombres. Mientras tanto: geometría procedural (poste, bisagra y panel). Fuente: NASA 3D Resources o modelo propio (Blender, licencia abierta con crédito).
- [ ] **Rover y módulo de aterrizaje para los juegos** (opcional) → `public/assets/models/rover.glb`, `lander.glb`. Fuente: NASA 3D Resources. Mientras tanto: formas simples en los juegos.

## Texturas

Estado en disco: `public/assets/textures/` no existe. Las tres entradas del manifiesto apuntan a archivos ausentes, así que `validate-assets.ps1` informa FALTA.

- [ ] **`moon-color`** → `public/assets/textures/moon-color.webp`. Color de la Luna. Fuente: [NASA SVS CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/). Reducir a ≤ 4096 px de ancho y convertir a WebP. Mientras tanto: esfera gris sin textura.
- [ ] **`moon-height`** → `public/assets/textures/moon-height.webp`. Relieve (desplazamiento o bump). Fuente: mapa de elevación del mismo kit, derivado de LRO LOLA. ≤ 4096 px. Mientras tanto: esfera lisa.
- [ ] **`earth-color`** → `public/assets/textures/earth-color.webp`. Tierra. Fuente: [NASA Earth Observatory, Blue Marble](https://visibleearth.nasa.gov/collection/1484/blue-marble). ≤ 4096 px. Mientras tanto: esfera sin textura.
- [ ] Alternativa a SVS para la Luna: mosaico WAC de [NASA Moon Trek](https://trek.nasa.gov/moon/), producto `LRO_WAC_Mosaic_Global_303ppd_v02` (WMTS: `https://trek.nasa.gov/tiles/Moon/EQ/{Producto}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg`). Descargar solo en compilación, unir las teselas y acreditar.
- [ ] Tras agregarlas, verificar la orientación (longitud 0 hacia +Z, Apollo 11 en su lugar). Ver "PENDIENTE" en `docs/MODULO-scene3d.md`.

## Música y efectos de sonido

Estado en disco: `public/assets/audio/` está vacío y el manifiesto no tiene sección `audio`.

- [ ] **Música del menú** → `public/assets/audio/menu.ogg` (id sugerido `music-menu`). Bucle suave.
- [ ] **Ambiente de la escena** → `public/assets/audio/scene-ambience.ogg` (id `ambience-scene`).
- [ ] **Efectos de los juegos** → `public/assets/audio/sfx-*.ogg` (por ejemplo `sfx-launch`, `sfx-hit`, `sfx-win`, `sfx-click`). Cortos, mono.
- Formato: preferir `.ogg`; peso sugerido < 1 MB por efecto y < 3 MB por pista (no hay límite fijado en el contrato). Cada entrada necesita `license` y `credit`.
- Fuentes sugeridas: música y sonidos libres de regalías o de dominio público (por ejemplo CC0 en [Freesound](https://freesound.org/) o [OpenGameArt](https://opengameart.org/); revisar la licencia de cada archivo). El audio de la NASA tiene sus propias [directrices de uso](https://www.nasa.gov/nasa-brand-center/images-and-media/); leerlas antes de incluirlo y no sugerir respaldo de la NASA.
- Mientras tanto: la app funciona sin sonido.

## Datos

- [ ] **DEM LOLA para perfiles de horizonte** → `data/terrain/<siteId>.json` (11 sitios, ver tabla en `tools/terrain-data/README.md`). Fuente: LRO LOLA, [PDS Geosciences Node](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/). Para consulta en compilación: [Moon Trek](https://trek.nasa.gov/moon/) y [LROC QuickMap](https://quickmap.lroc.im-ldi.com/). Confirmar producto `LDEM_*` y resolución en la etiqueta `.LBL`. Sitios polares necesitan `LDEM_80S` (lector estereográfico pendiente) o un recorte. Ejecutar `python tools/terrain-data/build_horizons.py ...`. Mientras tanto: `sphericalHorizon` con `demSource` "PENDIENTE: sin DEM".
- [ ] **Coordenadas de candidatos Artemis y otros sitios** → `data/sites/pending-sites.json` (15 sitios sin coordenadas) a `data/sites/sites.json`. Candidatos Artemis III: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1 y 2, de Gerlache Rim 2, Slater Plain (fuente: [NTRS 20250011660](https://ntrs.nasa.gov/citations/20250011660) y USGS Gazetteer of Planetary Nomenclature). Otros: `clps-im-2`, `clps-blue-ghost-m2`, `clps-griffin-1`, `commercial-ispace-m2`, `intl-change-6`, `intl-change-3` (fuente: NSSDCA, notas de prensa CLPS, LROC QuickMap). Cada sitio nuevo necesita latitud, longitud (marco Mean Earth, rango (-180, 180]), incertidumbre y fuente. Mientras tanto: no aparecen en el catálogo y no se inventan coordenadas.
- [ ] **Formas de Natural Earth para el menú** → generadas con `tools/i18n-data/fetch_natural_earth.py`. Fuente: [Natural Earth](https://www.naturalearthdata.com/) (dominio público). Mientras tanto: botones de forma simple.
- [ ] **`LANGUAGE_FOCUS`** → `tools/i18n-data/build_focus.py` con Natural Earth. Mientras tanto: capitales aproximadas con `verified: false`.
- [ ] **Traducciones de 11 idiomas** (todos menos `es` y `en`) → `src/locales` del paquete i18n. Revisión por hablantes nativos; quitar la marca "traduccion automatica pendiente de revision" al aprobar.
- [ ] **ΔT (TD−UT) del respaldo Meeus**. Fuente: IERS / USNO (medidos y predicciones). Confirmar el valor usado en `AnalyticSource` y su fecha. Mientras tanto: aproximación marcada en `ANALYTIC_NOTE`.
- [ ] **Hashes de kernels NAIF**. Los kernels (`data/ephemeris/kernels/`: `naif0012.tls`, `de440s.bsp`, `pck00011.tpc`, `moon_pa_de440_200625.bpc`, `moon_de440_250416.tf`) están en disco, pero NAIF no publica SHA-256; los de `kernels.json` son los observados. Contrastar con una segunda fuente. Fuente: [NAIF](https://naif.jpl.nasa.gov/naif/data.html).
- [ ] **Fuente tipográfica del PDF**. Falta un archivo de fuente con licencia abierta; el PDF usa las fuentes estándar de `pdf-lib`. Se necesita para caracteres fuera de Latin-1 (idiomas no latinos).
- [x] `data/ephemeris/ephemeris.bin` y `ephemeris.json`: generados (262 945 filas, 12,6 MB). Su exactitud frente a Horizons está en `tools/ephemeris-data/README.md`.
- [ ] Parámetros de ejemplo del módulo energy (área, eficiencia, inclinación, potencia, batería, carga) y altura del mástil: "PENDIENTE fuente" en `docs/MODULO-energy.md`.

## Verificación

- [ ] **Preguntas educativas**: contrastar por muestreo las fuentes citadas en el banco de preguntas (`docs/MODULO-edu.md`, "Fuentes de los datos") antes de usarlo en clase o ampliarlo.
- [ ] **Sitios desplazados de `compare`**: no están verificados (`docs/MODULO-compare.md`).
- [ ] **Orientación de texturas y GLB** y `landingPose` (dirección de la Tierra): captura visual (`docs/MODULO-scene3d.md`).
- [ ] **Dispositivo tipo calculadora** del modo calculadora: suposición por revisar (`docs/MODULO-edu.md`).
- [ ] Ejecutar `tools/validate-assets.ps1` y confirmar "Problemas: 0" al cerrar los recursos.
