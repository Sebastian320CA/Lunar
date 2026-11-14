# Requirements Document

## Introduction

Lunar Landing Site Navigator is an offline-first web application (PWA, later desktop) that compares lunar landing sites and dates by showing the Sun and the Earth against the local horizon, to evaluate solar energy and direct-to-Earth communication. This spec turns the existing base (contracts, security, web shell, lint, Semgrep) into a working application: `pnpm --filter @lunar/web dev` opens an app with a 3D Moon/Earth scene, site list and selection, UTC date control, sky metrics, energy, comparison, i18n, panels, PDF export, education and games.

Decisions recorded without asking the user (all can be changed later):

- Ephemeris range 2025-01-01 to 2030-01-01 UTC, step 10 minutes (about 12.6 MB). If NAIF kernels cannot be downloaded, a documented analytic low-precision model (Meeus) is the default and the UI labels it as an approximation.
- Terrain without a DEM falls back to a spherical-Moon horizon (0 degrees elevation) marked PENDIENTE; DEM-based profiles use the LOLA product after its exact name is verified.
- Site coordinates are written only when read from a cited source; otherwise the site is listed as PENDIENTE and has no coordinates.
- PDF library: pdf-lib (pure TypeScript, no remote resources). Standard fonts are used until a font file is supplied (PENDIENTE).
- Module strings for es/en live in each package; the i18n package holds core strings and the other 11 languages as templates marked "traduccion automatica pendiente de revision".
- "Modo calculadora" means a text-only, keyboard-only, small-screen version of the trivia without 3D.
- External sites (LROC QuickMap by ASU, NASA Moon Trek, CSA Moon exploration) are used only at data-preparation time and are credited. QuickMap is not a NASA site.

## Glossary

- **App**: The web application in `apps/web`.
- **Module**: A workspace package in `packages/<name>` that implements contract types from `@lunar/contracts`.
- **Module_File**: The file `apps/web/src/modules/<name>.ts` through which a Module registers itself in the App.
- **Ephemeris_Service**: The implementation of `EphemerisService` in `packages/ephemeris`.
- **Analytic_Source**: The low-precision Meeus-based vector source used when `ephemeris.bin` is absent.
- **Terrain_Service**: The implementation of `TerrainService` in `packages/terrain`.
- **Sky_Module**: `packages/sky`, which computes `SiteMetrics` and draws the sky diagram.
- **Scene**: The Three.js scene exposed through `SceneApi`.
- **Panel**: The site panel in `packages/ui` that hosts registered `PanelTab` entries.
- **Pending_Marker**: The text "PENDIENTE" followed by the source where the value must be confirmed.
- **Disclaimer**: The text "Inspirado en NASA Space Apps - No avalado por la NASA".
- **Placeholder**: A procedural object (for example a sphere) shown when an asset file is missing.

## Requirements

### Requirement 1: App startup

**User Story:** As a user, I want to start the App with one command, so that I can use it immediately.

#### Acceptance Criteria

1. WHEN the command `pnpm --filter @lunar/web dev` runs, THE App SHALL serve a page that mounts the Scene, the site list, the date control and the Panel.
2. IF a Module fails to load, THEN THE App SHALL show an error screen that names the Module and keeps the other Modules running.
3. THE App SHALL make no network request at runtime.
4. THE App SHALL display the Disclaimer on every screen.

### Requirement 2: Sites and UTC date

**User Story:** As a user, I want to choose a site and a UTC date, so that I can inspect conditions there.

#### Acceptance Criteria

1. THE sites Module SHALL list every site in `data/sites/sites.json` with name, program, coordinates, source and verified flag.
2. WHEN the user submits custom coordinates, THE sites Module SHALL validate latitude, longitude and name with `@lunar/security` and show the error text for each invalid field.
3. WHEN the user selects the next sunrise, sunset or earthrise, THE TimeController SHALL set the time to the next event returned by `findEvents`.
4. IF a site coordinate cannot be confirmed from a cited source, THEN THE sites Module SHALL list the site as Pending_Marker without coordinates.

### Requirement 3: Ephemeris

**User Story:** As a planner, I want accurate Sun and Earth positions, so that results can be trusted.

#### Acceptance Criteria

1. WHEN `getSky` is called, THE Ephemeris_Service SHALL return azimuth in [0, 360) degrees and elevation in [-90, 90] degrees without refraction.
2. WHILE `ephemeris.bin` is absent, THE Ephemeris_Service SHALL use the Analytic_Source and expose `approximate: true` through `getEphemerisMeta`.
3. WHILE `approximate` is true, THE App SHALL show an "approximate data" label next to every computed Sun or Earth position.
4. WHEN `findEvents` receives an `endUtc` earlier than `startUtc`, THE Ephemeris_Service SHALL reject with an error naming the invalid parameter.
5. THE tools in `tools/ephemeris-data` SHALL generate `ephemeris.bin` and `ephemeris.json` in the `EphemerisBinaryHeader` format with a SHA-256 of the binary.

### Requirement 4: Terrain horizon

**User Story:** As a planner, I want terrain-aware horizons, so that visibility reflects local relief.

#### Acceptance Criteria

1. WHEN `getHorizon` is called, THE Terrain_Service SHALL return a profile with `demResolutionM` and `demSource` set.
2. IF no DEM profile exists for a site, THEN THE Terrain_Service SHALL return the spherical-Moon profile and set `demSource` to a Pending_Marker.
3. WHEN a DEM tile and an observer height are given, THE terrain Module SHALL compute the horizon by ray marching with lunar curvature included.

### Requirement 5: Metrics, energy and comparison

**User Story:** As a planner, I want metrics, energy and comparison, so that I can rank scenarios.

#### Acceptance Criteria

1. WHEN `computeSiteMetrics` is called, THE Sky_Module SHALL return `SiteMetrics` computed only from Ephemeris_Service and Terrain_Service results.
2. WHEN an energy method is selected, THE energy Module SHALL compute power as area x efficiency x irradiance x cos(incidence) while the Sun is above the terrain horizon, and zero otherwise.
3. WHEN the user selects up to three scenarios, THE compare Module SHALL show their metrics side by side.
4. IF the user selects a fourth scenario, THEN THE compare Module SHALL reject the selection with a message.
5. WHERE the user enables the viability index, THE compare Module SHALL show every weight and let the user change each weight.

### Requirement 6: Scene and panels

**User Story:** As a user, I want a 3D scene and panels, so that exploring sites is intuitive.

#### Acceptance Criteria

1. WHEN a site marker is selected, THE Scene SHALL rotate the Moon to show the site and notify `onSiteSelected` subscribers.
2. IF a GLB or texture file is missing, THEN THE Scene SHALL render a Placeholder and record the missing asset name.
3. WHEN the user presses Esc while the Panel is open, THE Panel SHALL close and return focus to the previous element.
4. WHERE the user has set `prefers-reduced-motion`, THE Panel SHALL open and close without 3D transform animation.
5. WHEN the user selects a language, THE I18nApi SHALL call `focusEarthOn` with the coordinates from the language table, using Colombia for Spanish.

### Requirement 7: Report export

**User Story:** As a user, I want to export a report, so that I can share results.

#### Acceptance Criteria

1. WHEN `exportReport` receives valid `ReportData`, THE export Module SHALL return a PDF with a diagonal watermark, page numbers and no remote resources.
2. THE export Module SHALL sanitize every text and SVG value with `@lunar/security` before writing it to the PDF.
3. WHEN the user requests CSV, THE export Module SHALL produce a CSV of the report tables.

### Requirement 8: Education and games

**User Story:** As an educator, I want trivia, class mode and games, so that I can teach with the App.

#### Acceptance Criteria

1. THE edu Module SHALL provide at least 30 questions in es and en, each with a source.
2. WHEN a question is answered, THE edu Module SHALL show the explanation and select a different question that has not been asked in the session.
3. WHEN the teacher imports a class package, THE edu Module SHALL validate it with `loadClassPackage` and reject invalid files with an error message.
4. THE edu-games Module SHALL provide three independently loadable games with lunar gravity, local score, keyboard control and a "what you learned" screen.

### Requirement 9: Data honesty and CI

**User Story:** As a maintainer, I want data honesty and basic CI, so that the project stays correct and safe.

#### Acceptance Criteria

1. THE App SHALL list every missing model, texture, audio file and dataset in `docs/RECURSOS-PENDIENTES.md` with a suggested source.
2. WHEN a push or pull request is made, THE CI workflow SHALL run frozen-lockfile install, lint, test, build and Semgrep.
3. THE App SHALL show credits and the Disclaimer in the "About" screen, including the NASA non-endorsement statement for the referenced external resources.
