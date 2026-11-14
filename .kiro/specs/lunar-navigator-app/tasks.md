# Implementation Plan: Lunar Navigator App

## Overview

Goal: `pnpm --filter @lunar/web dev` opens a working app (3D Moon/Earth scene, site list and selection, UTC date/time control, sky and Sun/Earth visibility, metrics, energy, comparison, i18n, panels, PDF export, education and games). One top-level task per module, in integration order. Language: TypeScript strict; Python only for data generators in `tools/*-data`.

Rules that apply to every module task:

- Implement in `packages/<name>/src`, honoring `packages/contracts` types (do not change them; write needs as "Solicitud al contrato" in the module doc).
- Only the LAST sub-task of a module edits `packages/<name>/src/index.ts`, writes `docs/MODULO-<name>.md` (short: public API, how to test, known limits, contract requests) and creates `apps/web/src/modules/<name>.ts` (a `WebModule` as defined in design.md). Earlier sub-tasks only create their own files, so they can run in parallel.
- Each sub-task includes a few focused vitest unit tests for its own code (no property-based tests). DOM tests use the `// @vitest-environment jsdom` pragma.
- Each module that shows text keeps its es/en strings in `packages/<name>/src/strings.ts` (keys `<module>.<key>`) and the Module_File passes them to `ctx.services.i18n?.addResources`. No `innerHTML` with user data, no `eval`, no network.
- Scientific data is never invented. If a value cannot be read from a cited source, write the code path and mark the data `PENDIENTE: <source to confirm>`.
- Never create or edit GLB files. Missing assets use a Placeholder and are listed in task 19.
- Adding a dependency: `pnpm --filter <pkg> add -E <dep>` (exact version). If the lockfile conflicts with another task, re-run `pnpm install` and keep both changes.
- Disclaimer text, always visible: "Inspirado en NASA Space Apps - No avalado por la NASA". No NASA logo.

## Tasks

- [x] 1. Finish packages/security classPackage (task 5.12 of the base spec)
  - [x] 1.1 Fix lint errors in `packages/security/src/classPackage.ts`
    - Fix the 2 `security/detect-object-injection` errors at lines 47 and 73 without disabling the rule (for example iterate with `for...of`/`Array.prototype` methods instead of computed indexing).
    - Confirm `src/index.ts` already exports `loadClassPackage`, `ClassPackageSchema`, `validateManifest`, `MAX_CLASS_PACKAGE_BYTES` and the `ClassPackage` type; fix the wiring if anything is missing.
    - Run `pnpm lint` and `pnpm --filter @lunar/security build`; both must pass.
    - _Requirements: 8.3, 9.3_
  - [x] 1.2 Add unit tests for `loadClassPackage` and `validateManifest`
    - Create `packages/security/src/classPackage.test.ts` with: valid package, oversized input, invalid JSON, `__proto__` key, unknown site id, valid and invalid manifest.
    - Run `pnpm --filter @lunar/security test`.
    - _Requirements: 8.3_

- [x] 2. Shell contract for module registration
  - [x] 2.1 Create `apps/web/src/modules/context.ts`
    - Define `WebServices`, `WebContext` and `WebModule` exactly as in design.md; export a `createContext({ demo })` helper with `assetUrl` (prefix `/assets/`) and `dataUrl` (lookup in an `import.meta.glob('../../../../data/**/*', { query: '?url', import: 'default', eager: true })` map; returns `undefined` if the file is absent).
    - Add `jsdom` (exact version used by `apps/web`) to the root `package.json` devDependencies so package tests can use the jsdom pragma.
    - Add a small test for `createContext` in `apps/web/src/modules/context.test.ts`.
    - _Requirements: 1.1, 1.2_

- [x] 3. Module sites (catalog, custom coordinates, time control)
  - [x] 3.1 Site catalog and data
    - Create `packages/sites/src/catalog.ts`: `parseSites(json): Result<LunarSite[]>` (validates with `@lunar/security` validators; ids from `APOLLO_SITE_IDS` for Apollo) and `loadSites(ctx)`.
    - Create `data/sites/sites.json` with Apollo 11, 12, 14, 15, 16, 17, CLPS targets, commercial and international missions and Artemis south-pole candidate regions. Fetch each coordinate from a citable source at data-prep time (for example NASA NSSDCA mission pages, LROC QuickMap, USGS Gazetteer of Planetary Nomenclature). Write `lat/lon` only if read from that source; set `source` to the URL and `verified: true` only for values read in this session. Entries that cannot be sourced go to `data/sites/pending-sites.json` (`id,name,program,sourceToConfirm`) with no coordinates.
    - Test: parsing valid and invalid files, canonical longitude in (-180, 180].
    - _Requirements: 2.1, 2.4_
  - [x] 3.2 Custom coordinates and TimeController
    - Create `packages/sites/src/customSite.ts`: `validateCustomSite({name,lat,lon})` using `validateLat`, `validateLon`, `sanitizeName`, returning per-field errors in clear Spanish.
    - Create `packages/sites/src/timeController.ts`: `createTimeController(initialUtc, ephemeris)` implementing `TimeController`, plus `stepLunarDays(n)` (29.53059 days per synodic month, constant documented), `jumpToNext(site, 'sunrise'|'sunset'|'earthrise')` via `findEvents`, and a play loop with injectable clock.
    - Test: invalid lat/lon errors, lunar-day step, event jump with a mocked `EphemerisService`, unsubscribe stops notifications.
    - _Requirements: 2.2, 2.3_
  - [x] 3.3 DOM components
    - Create `packages/sites/src/ui/siteList.ts` (`mountSiteList(container, sites, onSelect)`), `customForm.ts` (form that calls `validateCustomSite`) and `timeline.ts` (`mountTimeline(container, time)` with UTC date-time inputs validated by `validateUtc`, scrubber, play/pause and lunar-day buttons). Use `textContent`, not `innerHTML`; keyboard accessible.
    - Test with jsdom: selecting a site, invalid date shows error.
    - _Requirements: 2.1, 2.2, 2.3_
  - [x] 3.4 Wire index, docs and registration
    - Export the public API in `packages/sites/src/index.ts`, write `docs/MODULO-sites.md`, create `apps/web/src/modules/sites.ts` (sets `services.sites` and `services.time`, loads `data/sites/sites.json` through `ctx.dataUrl`).
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Module ephemeris (data tools and TypeScript service)
  - [x] 4.1 Python generator tools (`tools/ephemeris-data`)
    - Create `download_kernels.py` (SHA-256 verification per kernel; verify current names and versions on NAIF `naif.jpl.nasa.gov`, otherwise mark PENDIENTE), `generate.py` (spiceypy; Moon-fixed principal-axes frame with libration, 10 min step, 2025-01-01 to 2030-01-01 UTC; writes `data/ephemeris/ephemeris.bin` and `ephemeris.json` in `EphemerisBinaryHeader` format with `sha256`; validates the header), `compare_horizons.py` (Apollo sites at 5 dates against JPL Horizons, prints max error in degrees) and `README.md` with requirements and the empty results table (PENDIENTE).
    - Write `tools/ephemeris-data/test_header.py` that checks header validation on a tiny synthetic file (run only if Python is available).
    - Do not run the downloads here if there is no network; never write invented numbers.
    - _Requirements: 3.5_
  - [x] 4.2 Vector source interface, binary reader and geometry
    - Create `packages/ephemeris/src/source.ts` (`VectorSource { sunEarth(utcMs: number, out: Float64Array): void; coverage(): {startMs:number; endMs:number} }`), `binary.ts` (`BinarySource` parsing `ephemeris.json` + `ephemeris.bin`, header validation, SHA-256 check with `crypto.subtle`, 4-point Lagrange interpolation across rows), and `geometry.ts` (vector to azimuth/elevation in the site topocentric frame, apparent angular radius, Sun-Moon distance in km).
    - Tests with synthetic data: binary round trip, interpolation error on a smooth known function, azimuth/elevation for known vectors, azimuth in [0, 360).
    - _Requirements: 3.1, 3.5_
  - [x] 4.3 Analytic fallback source (Meeus)
    - Create `packages/ephemeris/src/analytic.ts`: `AnalyticSource implements VectorSource` using Meeus, "Astronomical Algorithms" 2nd ed., ch. 25 (Sun), 47 (Moon position) and 53 (optical libration), producing Sun and Earth vectors in the Moon-fixed frame. Transcribe the series tables from the book or a verified public source; if the full tables cannot be obtained, use a documented truncated series. Label it approximate in a `ANALYTIC_NOTE` constant.
    - Test against the worked example of Meeus ex. 47.a (1992-04-12 0h TD: geocentric Moon longitude, latitude and distance) with the tolerance of the implemented series, citing the book.
    - Accuracy against Horizons stays PENDIENTE until `compare_horizons.py` runs.
    - _Requirements: 3.2, 3.3_
  - [x] 4.4 Service: getSky, getSeries, findEvents
    - Create `packages/ephemeris/src/service.ts`: `createEphemerisService(source, horizonAt?)` implementing `EphemerisService`. `getSky` uses upper-limb elevation for `aboveTerrainHorizon` against `horizonAt(azimuthDeg)` (default 0) and sets `directCommsAvailable` from the Earth. `getSeries` uses typed arrays without per-step allocation. `findEvents` scans with bisection refinement, returns ascending events in [start, end), and rejects naming `startUtc` or `endUtc` for invalid input or `endUtc < startUtc`. Validate UTC with `validateUtc`.
    - Tests with a synthetic source: sunrise/sunset times for a known circular motion, empty result, invalid range error.
    - _Requirements: 3.1, 3.4_
  - [x] 4.5 Wire index, docs and registration
    - Export the API and `getEphemerisMeta()` (`{source, approximate, note}`) from `packages/ephemeris/src/index.ts`; write `docs/MODULO-ephemeris.md` (frame, interpolation error measured in tests, upper limb, no refraction, approximation notice); create `apps/web/src/modules/ephemeris.ts`: fetch `ephemeris.json`/`.bin` via `ctx.dataUrl`; use `BinarySource` when present and valid, otherwise `AnalyticSource`; set `services.ephemeris` and `services.ephemerisMeta`.
    - _Requirements: 3.2, 3.3_

- [x] 5. Module terrain (horizon profiles)
  - [x] 5.1 Python DEM tools (`tools/terrain-data`)
    - Create `build_horizons.py`: reads `data/sites/sites.json` and a LOLA DEM (PDS Geosciences Node; verify the exact product name and resolution, otherwise PENDIENTE), ray-marches per site with lunar curvature (reference radius 1737.4 km, observer height parameter default 0 m, mast option 1 to 5 m, azimuth step 1 degree) and writes `data/terrain/<siteId>.json` (`HorizonProfile`). Include `README.md` with product, limits and the PENDIENTE results table. Do not fabricate output files without a DEM.
    - _Requirements: 4.1, 4.3_
  - [x] 5.2 TerrainService and spherical fallback
    - Create `packages/terrain/src/service.ts` (`createTerrainService(loadProfile)`: reads precomputed profile, validates length = 360 / `azimuthStepDeg`, returns it) and `spherical.ts` (`sphericalHorizon(observerHeightM)`: 0 degrees at height 0 and the geometric dip for a raised observer; `demResolutionM = 1737400` sentinel; `demSource` starting with "PENDIENTE: sin DEM").
    - Also export `horizonElevationAt(profile, azimuthDeg)` with linear interpolation and wrap-around.
    - Tests: profile length validation, wrap-around at 359.5 degrees, fallback fields present.
    - _Requirements: 4.1, 4.2_
  - [x] 5.3 Runtime horizon from DEM tiles
    - Create `packages/terrain/src/dem.ts`: `computeHorizonFromDem(tile, lat, lon, observerHeightM, stepDeg)` with bilinear sampling, ray marching and curvature drop, returning `HorizonProfile` with `demResolutionM` taken from the tile. Tile format documented in the module doc (typed array + georeference).
    - Tests with a synthetic DEM: flat plain gives about 0 degrees, a ridge of known height and distance gives the expected elevation within tolerance.
    - _Requirements: 4.3_
  - [x] 5.4 Wire index, docs and registration
    - Export API in `packages/terrain/src/index.ts`; write `docs/MODULO-terrain.md` (DEM limits: precision is bounded by DEM resolution, not arithmetic); create `apps/web/src/modules/terrain.ts` (loads `data/terrain/<siteId>.json` through `ctx.dataUrl`, falls back to `sphericalHorizon`, sets `services.terrain`).
    - _Requirements: 4.1, 4.2_

- [x] 6. Module sky (diagram, metrics, "Sol y Tierra" tab)
  - [x] 6.1 Site metrics
    - Create `packages/sky/src/metrics.ts`: `computeSiteMetrics(deps: {ephemeris: EphemerisService; terrain: TerrainService}, site, startUtc, endUtc, stepMin): Promise<SiteMetrics>` computed from `getSeries` and the horizon (never by hand), plus `uncertaintyText(demResolutionM, lang)`. Validate the interval with `validateUtc`.
    - Tests with mocked services: ranges (fractions in [0, 1], hours >= 0), always-lit and always-dark series, longest comms gap.
    - _Requirements: 5.1_
  - [x] 6.2 SVG sky diagram and countdown
    - Create `packages/sky/src/diagram.ts` (`renderSkyDiagram({horizon, sky, size}): string` returning an SVG string with terrain profile, Sun, Earth, compass cardinals; all text through `sanitizeText`) and `countdown.ts` (`nextSetEvent(events, utc)` and `createCountdown(el, getEvents, time)` updating with `textContent`).
    - Tests: SVG contains Sun and Earth markers and four cardinals; countdown picks the next sunset or earthset.
    - _Requirements: 5.1_
  - [x] 6.3 "Sol y Tierra" tab, docs and registration
    - Create `packages/sky/src/tab.ts` (`PanelTab` id `sol-tierra`, titleKey `sky.tab`; plain-language text with a collapsible technical detail; shows the "approximate data" label when `ephemerisMeta.approximate`); export the API from `src/index.ts`; write `docs/MODULO-sky.md`; create `apps/web/src/modules/sky.ts` (sets `services.metrics`, registers the tab).
    - _Requirements: 3.3, 5.1_

- [x] 7. Module energy (methods, battery, charts, tab)
  - [x] 7.1 Physics and energy methods
    - Create `packages/energy/src/physics.ts` (`irradianceWm2(sunMoonDistanceKm)` with solar constant 1361 W/m2 at 1 AU = 149597870.7 km, `incidenceCos`) and one file per method in `packages/energy/src/methods/`: `horizontal`, `fixedTilt`, `vertical`, `singleAxis`, `dualAxis`, `mast` (param `mastHorizonElevDeg` provided by the caller from the terrain at mast height; record as "Solicitud al contrato"), `constantSource`. Power = area x efficiency x irradiance x cos(incidence) x (1 if `sky.sun.aboveTerrainHorizon`, else 0). Defaults in `defaults.ts`, each with unit and source or "ejemplo editable, PENDIENTE fuente".
    - Tests: zero power below horizon, cos incidence at known angles, dual axis >= horizontal for the same sky.
    - _Requirements: 5.2_
  - [x] 7.2 Series and battery
    - Create `packages/energy/src/series.ts` (`computeSeries(method, inputs: EnergyInput[]): EnergyResult[]` and cumulative energy) and `battery.ts` (`createBattery({capacityWh, loadW, efficiency})`, `simulate(powerSeries, stepSeconds)` giving state of charge and hours the night is endured).
    - Tests: energy integration equals power x time for constant input; battery never below 0 or above capacity.
    - _Requirements: 5.2_
  - [x] 7.3 SVG charts
    - Create `packages/energy/src/charts.ts`: `powerChartSvg`, `cumulativeEnergySvg`, `methodComparisonSvg`, `siteComparisonSvg` (SVG strings, no CDN, sanitized labels).
    - Tests: each returns a well-formed SVG with the expected number of series.
    - _Requirements: 5.2_
  - [x] 7.4 "Energia" tab, docs and registration
    - Create `packages/energy/src/tab.ts` (`PanelTab` id `energia`: method selector, editable parameters validated as finite numbers, charts, and an empty `<div data-solar-view>` container where `services.solarView?.()` is mounted and fed `EnergyResult` and the Sun `BodyState`); export API; write `docs/MODULO-energy.md`; create `apps/web/src/modules/energy.ts`.
    - _Requirements: 5.2_

- [x] 8. Module compare
  - [x] 8.1 Scenario comparison core
    - Create `packages/compare/src/core.ts`: `Scenario {siteId, utcStart, utcEnd}`, `addScenario` (max 3, returns `Result`), `compareMetrics(scenarios, metricsFn)` (side by side and sequential order), `viabilityIndex(metrics, weights)` with visible default weights, `sensitivity(site, shiftsKm, shiftsDays, metricsFn)` for the "por que cambia tanto" view.
    - Tests with simulated metrics: fourth scenario rejected, weights change the ranking, sensitivity output order.
    - _Requirements: 5.3, 5.4, 5.5_
  - [x] 8.2 SVG charts
    - Create `packages/compare/src/charts.ts`: bar chart per metric for up to 3 scenarios and a sensitivity line chart; plain SVG strings.
    - Tests: bar count equals scenario count.
    - _Requirements: 5.3_
  - [x] 8.3 "Comparar" tab, docs and registration
    - Create `packages/compare/src/tab.ts` (`PanelTab` id `comparar`; scenario picker, weights sliders with labels, explanation text), export API, write `docs/MODULO-compare.md`, create `apps/web/src/modules/compare.ts` (uses `services.metrics`).
    - _Requirements: 5.3, 5.4, 5.5_

- [x] 9. Module i18n (languages and main menu)
  - [x] 9.1 I18n core and language-to-country table
    - Create `packages/i18n/src/i18n.ts` (`createI18n(sceneGetter)`: implements `I18nApi` plus `addResources(ns, dict)`, `{var}` interpolation, plurals through `Intl.PluralRules`, RTL via `dir`, initial language from `navigator.languages`), `languageFocus.ts` (one editable table with lat/lon and criterion note for en, zh, ja, es (Colombia), pt, fr, de, ru, hi, ar, it, ko, tr; each row `verified` flag) and `tools/i18n-data/build_focus.py` that generates the coordinates from Natural Earth (public domain) when the network is available. Without that data, write approximate capital coordinates flagged `verified: false` (cosmetic, not scientific).
    - On `setLanguage`, call `scene.focusEarthOn(lat, lon)` for the language row.
    - Tests: missing key returns the key, plural forms, RTL for `ar`, es focuses on Colombia, unsubscribe.
    - _Requirements: 6.5_
  - [x] 9.2 Locales and key parity test
    - Create `packages/i18n/src/locales/{es,en}.json` complete for core namespaces (`common`, `menu`, `panel`, `about`, `scene`, `time`, `errors`) and template files for the other 11 languages with the marker "traduccion automatica pendiente de revision" (values copied from `en`).
    - Create `locales.test.ts` asserting identical key sets across all languages and that `es` and `en` have no marker.
    - _Requirements: 6.5_
  - [x] 9.3 Main menu with Earth background (`packages/ui/src/menu`)
    - Create `packages/ui/src/menu/menu.ts` (`createMenu(container, items, i18n)`: buttons shaped like continents or countries from Natural Earth contours, pseudo-3D via CSS/SVG; states normal, hover, focus, pressed, disabled; keyboard and ARIA) and `tools/i18n-data/fetch_natural_earth.py` (download and simplify outlines; credit Natural Earth). If shapes are not downloaded, use simple rounded-shape buttons, and note the pending data.
    - Tests with jsdom: Enter and Space activate, disabled button ignores clicks, ARIA labels present.
    - _Requirements: 6.5_
  - [x] 9.4 Wire index, docs and registration
    - Export API in `packages/i18n/src/index.ts`, write `docs/MODULO-i18n.md`, create `apps/web/src/modules/i18n.ts` (sets `services.i18n`, binds the scene lazily through `services.scene`).
    - _Requirements: 6.5_

- [x] 10. Module export (PDF, CSV, print)
  - [x] 10.1 PDF builder with watermark
    - Add `pdf-lib` (exact version; chosen because it is pure TypeScript with no remote resources; standard fonts only until a font file is supplied, PENDIENTE). Create `packages/export/src/pdf.ts`: `exportReport(data: ReportData): Promise<Uint8Array>` with diagonal low-opacity watermark text "Lunar Landing Site Navigator - Inspirado en NASA Space Apps - No avalado por la NASA" and a simple own logo (vector), header with title, scenarios, parameters and sources, footer with page numbers, tables paginated. Validate `title` <= 200 characters and `sections` <= 50; sanitize every string with `sanitizeText`.
    - Tests: output starts with `%PDF`, page count grows with many rows, oversized input returns an error `Result` via `safeExportReport`.
    - _Requirements: 7.1, 7.2_
  - [x] 10.2 Charts, CSV and print
    - Create `packages/export/src/svg.ts` (`sanitizeSvg` allowlist of elements and attributes, no scripts or external references; `svgToPngDataUrl` through canvas when available), `csv.ts` (`toCsv(tables)` with formula-injection protection: prefix `'` for cells starting with `= + - @`), and `print.ts` (print stylesheet and `printReport`). Embed charts in the PDF as PNG from `pngDataUrl` or sanitized SVG rasterized.
    - Tests: `sanitizeSvg` removes `<script>` and `onload`; CSV escapes quotes and formula cells.
    - _Requirements: 7.2, 7.3_
  - [x] 10.3 Wire index, docs and registration
    - Export API, write `docs/MODULO-export.md` (library choice, fonts PENDIENTE), create `apps/web/src/modules/export.ts` (sets `services.exportReport` and a download helper using `Blob` URLs).
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 11. Module ui (design system, site panel, About)
  - [x] 11.1 Design system
    - Create `packages/ui/src/design/tokens.css` (`--ln-*` variables: colors, typography with generic system font stack, spacing; light and dark via `prefers-color-scheme` and a `data-theme` attribute), `theme.ts` (`setTheme`, `getTheme`) and `logo.ts` (own simple SVG logo string; no NASA logo).
    - Tests: theme toggle sets the attribute.
    - _Requirements: 6.3, 9.3_
  - [x] 11.2 Site panel with 3D opening
    - Create `packages/ui/src/panel/panel.ts`: `openSitePanel({anchor, site, utc, i18n})` animates from the `ScreenAnchor` with CSS 3D transform, dims the background, closes with Esc and a button, traps focus, restores previous focus, sets ARIA (`role="dialog"`, `aria-modal`), and skips animation under `prefers-reduced-motion`. Tab strip renders `getPanelTabs()`. Also create the `resumen` tab (`panel/summaryTab.ts`: name, program, coordinates, source, verified flag, Pending_Marker when unverified).
    - Tests with jsdom: Esc closes and restores focus, tabs listed in registration order, reduced motion path.
    - _Requirements: 6.3, 6.4_
  - [x] 11.3 About and credits screen
    - Create `packages/ui/src/about/about.ts`: `mountAbout(container, manifest)` validating the manifest with `validateManifest`, listing every asset credit, the Disclaimer, the statement that NASA does not endorse non-US-government entities, and data-prep credits: LROC QuickMap (ASU, not a NASA site) https://quickmap.lroc.im-ldi.com/, NASA Moon Trek https://trek.nasa.gov/moon/, CSA Moon exploration https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/ (context only), Natural Earth, Meeus. Links are plain text anchors with `rel="noopener noreferrer"`.
    - Tests: every manifest credit appears, invalid manifest shows an error message.
    - _Requirements: 1.4, 9.3_
  - [x] 11.4 Wire index, docs and registration
    - Export design, panel, about and the menu (`./menu/menu.js`) from `packages/ui/src/index.ts`; write `docs/MODULO-ui.md`; create `apps/web/src/modules/ui.ts` (loads `tokens.css`, registers the `resumen` tab).
    - _Requirements: 6.3, 6.4_

- [x] 12. Module scene3d (Moon/Earth scene)
  - [x] 12.1 Renderer, assets and GLB loader
    - Add `three` (exact version) to `packages/scene3d`. Create `src/core.ts` (`SceneCore`: renderer, scene, camera, Moon and Earth meshes, directional light, resize, pause on blur, `dispose`, debug FPS, WebGL2 detection with a readable fallback message, lower pixel ratio on mobile), `src/assets.ts` (manifest loader with cache; `GLTFLoader` with `MeshoptDecoder`, local `DRACOLoader` and `KTX2Loader` paths under `/assets/decoders/`; Placeholder sphere for any missing file; list of missing assets) and `scripts/copy-decoders.mjs` that copies decoder files from `node_modules/three` to `public/assets/decoders/` (add that folder to `.gitignore`).
    - Add the 3 existing GLBs to `public/assets/manifest.json` (`Moon_1_3474.glb`, `Earth_1_12756.glb`, `Aeronomy of Ice in the Mesosphere.glb`); inspect with `npx @gltf-transform/cli inspect <file>` if available, otherwise `nodes: []`, `polygons: 0`; `credit: "PENDIENTE (confirmar origen)"`. Validate with `validateManifest`. Do not touch GLB files.
    - Tests: missing asset yields Placeholder and appears in the missing list; math helper `latLonToVec3` for known points.
    - _Requirements: 6.2_
  - [x] 12.2 Mode state machine and camera
    - Create `src/modes.ts`: states `intro`, `landing`, `free`, `map`, `site` with cancellable smooth transitions (tween with injectable clock, configurable durations), first-person landing camera on the Moon surface with Earth behind, orbit limits and damping in `free`, dimmed background in `site`.
    - Tests on the pure state machine: valid transitions, cancel mid-transition, durations configurable.
    - _Requirements: 6.1_
  - [x] 12.3 Markers, selection, anchors, focus and Sun direction
    - Create `src/markers.ts` (markers per program with distinct colors, picking by mouse and keyboard, `onSiteSelected` with `Unsubscribe`, `getSiteScreenAnchor` returning `null` for unknown or hidden ids), `src/focus.ts` (`focusMoonOn` and `focusEarthOn` rotations with default 1000 ms, canonical lon validation) and `src/sun.ts` (`setSunDirectionProvider`, `setSimulationTime`).
    - Tests: anchor null for unknown id, unsubscribe stops callbacks, focus rotation maps lat/lon to the camera-facing axis.
    - _Requirements: 6.1_
  - [x] 12.4 Wire index, docs and registration
    - Create `createScene(canvas, opts)` in `src/index.ts` returning `SceneApi & {dispose(), debug(on), missingAssets()}`; write `docs/MODULO-scene3d.md` (including: texture and GLB orientation convention to confirm visually, PENDIENTE); create `apps/web/src/modules/scene3d.ts` (creates the canvas, sets `services.scene`, feeds sun direction from `services.ephemeris` and `services.time`).
    - _Requirements: 6.1, 6.2_

- [x] 13. Module solar-view (3D solar panel)
  - [x] 13.1 Orientation math
    - Create `packages/solar-view/src/orientation.ts`: pure functions turning `EnergyResult` and the Sun `BodyState` into panel normal, ray direction, elevation indicator angle and compass heading (plain numbers, no Three.js).
    - Tests: tilt and azimuth to normal for known cases; ray points to the Sun.
    - _Requirements: 5.2_
  - [x] 13.2 View implementation
    - Add `three` (same exact version as scene3d). Create `packages/solar-view/src/view.ts`: `createSolarPanelView(): SolarPanelViewApi` with a procedural panel and hinge (GLB from the manifest `solar-panel` entry when present, nodes named for panel and hinge; otherwise procedural), deploy animation, light ray, elevation indicator, 3D compass, switch among fixed, single-axis, dual-axis and vertical, pause off-screen with `IntersectionObserver`, full `dispose` (calling `update` after `dispose` does nothing), mobile pixel-ratio cap.
    - Tests with a mocked renderer: dispose is idempotent and `update` after dispose does not throw.
    - _Requirements: 5.2_
  - [x] 13.3 Wire index, docs and registration
    - Export API, write `docs/MODULO-solar-view.md` (GLB node names expected), create `apps/web/src/modules/solarView.ts` (sets `services.solarView`).
    - _Requirements: 5.2_

- [x] 14. Module edu (trivia and class mode)
  - [x] 14.1 Question bank and trivia engine
    - Create `packages/edu/src/questions.json` (at least 30 questions es/en about the Moon, illumination, communications and sites; fields `id, category, difficulty, prompt, options, answer, explanation, source, i18nKeys`; only facts with a cited source, no unverified coordinates) and `engine.ts` (`createTrivia(bank, seed)`: flow question, explanation, different question, explanation; no repeats in a session; adaptive difficulty).
    - Tests: bank has >= 30 questions each with source and both languages; no repeats; difficulty rises after correct answers.
    - _Requirements: 8.1, 8.2_
  - [x] 14.2 Class mode and class packages
    - Create `packages/edu/src/classMode.ts` (`createClassSession`: teams, rounds, local scores, split into independent parts) and `classPackage.ts` (`exportClassPackage(session): string` producing JSON that conforms to `ClassPackageSchema`, `importClassPackage(text)` using `loadClassPackage`; add `@lunar/security` as workspace dependency).
    - Tests: export then import returns an equal package, invalid or oversized import returns an error.
    - _Requirements: 8.3_
  - [x] 14.3 UI: trivia, teacher panel, projector view, calculator mode
    - Create `packages/edu/src/ui/*.ts`: trivia view, teacher panel, projector view (large text), and calculator mode (assumption recorded in the doc: text-only, keyboard-only, small screen, no 3D). Keyboard accessible, `textContent` only.
    - Tests with jsdom: keyboard answers a question, calculator mode renders without canvas.
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 14.4 Wire index, docs and registration
    - Export API, write `docs/MODULO-edu.md`, create `apps/web/src/modules/edu.ts` (registers a lazy "Trivia" entry point; does not add a Panel tab).
    - _Requirements: 8.1, 8.2, 8.3_

- [x] 15. Module edu-games (three minigames)
  - [x] 15.1 Game 1: projectile launcher
    - Create `packages/edu-games/src/physics.ts` (lunar gravity 1.62 m/s2 and Earth 9.80665 m/s2 with source in comments, no drag) and `projectile.ts` (canvas game, optional Earth gravity comparison, local score in `localStorage` guarded by try/catch, keyboard controls, "lo que aprendiste" screen).
    - Tests: range and flight time match closed-form results for given speed and angle; the Moon range is about 6 times the Earth range for the same launch.
    - _Requirements: 8.4_
  - [x] 15.2 Game 2: payload-packing blocks
    - Create `packages/edu-games/src/blocks.ts` (falling-block packing of payload with mass and volume limits, line clear logic pure and testable, explanation of what it teaches, keyboard controls, local score, learning screen).
    - Tests: collision and line clearing logic.
    - _Requirements: 8.4_
  - [x] 15.3 Game 3: light-powered explorer
    - Create `packages/edu-games/src/explorer.ts` (basic exploration; the character recharges while the Sun is above the horizon and when the Earth is visible, through an injected `EphemerisService`; keyboard controls; local score; learning screen).
    - Tests with a mocked `EphemerisService`: energy increases in sunlight, decreases in darkness.
    - _Requirements: 8.4_
  - [x] 15.4 Wire index, docs and registration
    - Export each game as its own entry (`projectileGame`, `blocksGame`, `explorerGame`) from `packages/edu-games/src/index.ts`; write `docs/MODULO-edu-games.md`; create `apps/web/src/modules/eduGames.ts` (dynamic import per game).
    - _Requirements: 8.4_

- [x] 16. apps/web integration
  - [x] 16.1 Shell UI
    - Create `apps/web/src/shell/*.ts`: layout with canvas, language selector, site list, timeline, "approximate data" label, About button, export button (builds `ReportData` from the selected site, metrics and energy and calls `services.exportReport`), Trivia and Games entry buttons, and the always-visible Disclaimer footer. Clicking a marker or list item opens the Panel through `openSitePanel` with `scene.getSiteScreenAnchor`.
    - Tests with jsdom: shell renders the Disclaimer and a site list from a mocked context.
    - _Requirements: 1.1, 1.4, 3.3, 6.1_
  - [x] 16.2 Error screen, CSP and Vite config
    - Create `apps/web/src/shell/errorScreen.ts` (names the failed module, readable text, retry button). Add the CSP meta tag from design.md to `apps/web/index.html` and the same headers in `vite.config.ts` (dev server); set `build.chunkSizeWarningLimit` and manual chunks for `three`; confirm no network calls and no CDN URLs.
    - Tests: error screen shows the module name.
    - _Requirements: 1.2, 1.3_
  - [x] 16.3 Bootstrap and lazy loading
    - Replace `apps/web/src/main.ts`: build the context, load modules with dynamic `import()` in this order: i18n, ui, ephemeris, terrain, sites, scene3d, sky, energy, compare, solarView, export, edu, eduGames; a failure in one module shows the error screen for that module and continues; then mount the shell. Update `apps/web/package.json` scripts if needed so `pnpm --filter @lunar/web dev` starts the app.
    - _Requirements: 1.1, 1.2_
  - [x] 16.4 Build verification and script cleanup
    - Run `pnpm install`, `pnpm lint`, `pnpm test`, `pnpm build` and fix failures. The root scripts `check:hashes` and `check:no-stubs` point to `apps/web/scripts/*`; if those files are absent, remove the two scripts. Add a jsdom smoke test `apps/web/src/main.test.ts` (bootstrap with mocked modules renders the shell).
    - Do not start the dev server in the task; the user runs `pnpm --filter @lunar/web dev`.
    - _Requirements: 1.1, 1.3_

- [x] 17. Minimal CI
  - [x] 17.1 Create `.github/workflows/ci.yml`
    - Jobs: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm test`, `pnpm build`, Semgrep with `.semgrep/rules.yml`; CodeQL job marked `continue-on-error: true`. Read `packages/contracts/scripts/lib/checkWorkflows.ts` and satisfy it: actions pinned to 40-character commit SHAs and explicit least-privilege `permissions`. Run `pnpm check:workflows` to confirm.
    - _Requirements: 9.2_

- [x] 18. Security and integration docs
  - [x] 18.1 Write `docs/SEGURIDAD.md` (concise)
    - Cover input validation through `@lunar/security`, no `eval`/`innerHTML` with user data, CSP (including `wasm-unsafe-eval` for decoders), SVG and CSV sanitization in export, class package limits, offline-only data. Read `packages/contracts/scripts/lib/checkSecurityDoc.ts` and satisfy its required content; run `pnpm check:docs`.
    - _Requirements: 1.3, 7.2_
  - [x] 18.2 Write `docs/INTEGRACION.md` (concise)
    - Describe module registration (`WebModule`), service wiring order, data loading from `/data`, the list of "Solicitud al contrato" items collected from the `docs/MODULO-*.md` files, and decisions recorded in this spec.
    - _Requirements: 1.1_

- [x] 19. Pending resources list
  - [x] 19.1 Write `docs/RECURSOS-PENDIENTES.md`
    - Table: missing models (`apollo-lm.glb`, solar panel GLB, rover or lander models), textures (`moon-color.webp`, `moon-height.webp`, `earth-color.webp`), music and audio, PDF font file, DEM and NAIF kernels, `ephemeris.bin`, terrain profiles, unverified or pending sites, Natural Earth shapes, translation reviews, and manifest credits marked PENDIENTE. For each: purpose, expected path, suggested source (NASA SVS CGI Moon Kit, LRO LOLA via PDS Geosciences Node, NASA Moon Trek WMTS `https://trek.nasa.gov/tiles/Moon/EQ/{Producto}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg` with product `LRO_WAC_Mosaic_Global_303ppd_v02`, LROC QuickMap, NAIF, Natural Earth), and what the app does meanwhile. Credit external sites and repeat the NASA non-endorsement statement (QuickMap is by ASU, not a NASA site). Compare with `public/assets/manifest.json` and the files on disk so the list is accurate.
    - _Requirements: 9.1_

- [x] 20. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tests are required (no optional tasks); property-based tests are not used by decision.
- Only the last sub-task of each module edits that module's `src/index.ts`, docs and Module_File, which avoids same-file conflicts inside a wave.
- Music, extra 3D models and game assets come last (task 19); until then Placeholders are used.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "3.1", "3.2", "3.3", "4.1", "4.2", "5.1", "5.2", "5.3", "6.1", "6.2", "7.1", "7.2", "7.3", "8.1", "8.2", "9.1", "9.2", "9.3", "10.1", "10.2", "11.1", "11.2", "11.3", "12.1", "13.1", "14.1", "14.2", "15.1", "15.2", "15.3"] },
    { "id": 1, "tasks": ["1.2", "3.4", "4.3", "4.4", "5.4", "6.3", "7.4", "8.3", "9.4", "10.3", "11.4", "12.2", "12.3", "13.2", "14.3", "15.4"] },
    { "id": 2, "tasks": ["4.5", "12.4", "13.3", "14.4"] },
    { "id": 3, "tasks": ["16.1", "16.2", "17.1", "18.1", "18.2"] },
    { "id": 4, "tasks": ["16.3"] },
    { "id": 5, "tasks": ["16.4", "19.1"] }
  ]
}
```
