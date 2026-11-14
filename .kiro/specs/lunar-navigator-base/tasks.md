# Implementation Plan: lunar-navigator-base

## Overview

Plan de implementación en TypeScript (estricto, pnpm workspaces, vitest, Vite, zod, fast-check) para la Fase A de "Lunar Landing Site Navigator". El orden es: base del monorepo, `packages/contracts`, scripts de verificación, `packages/security`, ESLint, Shell `apps/web` (con modos `production` y `demo`), CI y documentación. Cada paso se integra con el anterior y termina conectado en el Shell.

Decisiones firmes que este plan implementa (ya reflejadas en `requirements.md` y `design.md`):

- El encabezado de efemérides vive en `data/ephemeris/ephemeris.json`; `ephemeris.bin` no tiene encabezado interno.
- Contracts exporta `APOLLO_SITE_IDS` y `SITE_ID_ALLOWLIST` de Security se construye a partir de ella.
- Vite define dos modos, `production` y `demo`, con la constante `__LUNAR_DEMO__`, la marca `__LUNAR_STUB__`, el prefijo `[PRUEBA]`, un banner permanente, `ModuleUnavailableError` y el script `check-no-stubs` en CI después de la compilación de producción.
- `security/detect-object-injection` está en `off` en todo el repositorio y en `error` en `packages/security` y `apps/web/src/security`; las pruebas de contaminación de prototipo de `packages/security` son obligatorias.
- El `public/assets/manifest.json` se migra a rutas relativas a `public/assets/` y `tools/validate-assets.ps1` resuelve contra `public\assets`.
- El criterio de cierre de cada módulo en `docs/INTEGRACION.md` tiene cinco elementos, (a) a (e); el elemento (e) exige no consumir objetos `isTestData` como reales.
- `getPanelTabs` es parte de Contracts y `isTestData` es propiedad del propio stub para valores primitivos.

Las versiones de dependencias se resuelven con `pnpm add --save-exact` al ejecutar cada tarea. Los SHA de las acciones de GitHub se resuelven con `gh api` al ejecutarla; no se inventan.

## Tasks

- [x] 1. Preparar la base del monorepo
  - [x] 1.1 Configurar `.npmrc`, versiones exactas y scripts raíz
    - Crear `.npmrc` con `save-exact=true` y `engine-strict=true`
    - Fijar `typescript` a `7.0.2` y `vitest` a `5.1.0` en el `package.json` raíz
    - Agregar con `--save-exact`: `zod` en `packages/contracts` y `packages/security`; `fast-check` y `eslint` en la raíz; `vite` y `jsdom` en `apps/web`; declarar `@lunar/*: workspace:*` en `apps/web/package.json` y `@lunar/contracts: workspace:*` en `packages/security/package.json`
    - Agregar scripts raíz `lint`, `typecheck`, `test`, `build`, `check:versions`, `check:hashes`, `check:no-stubs`, `check:docs`, `check:workflows` (apuntan a los scripts de las tareas 3, 8.14 y 8.25)
    - Agregar el script `build` (`tsc --noEmit -p .`) en cada paquete e incluir `src`, `test` y `scripts` en sus `tsconfig`; para los `.ts` ejecutados por Node usar `allowImportingTsExtensions` y `erasableSyntaxOnly`
    - Confirmar que los scripts de los paquetes resuelven `node_modules/.bin` de la raíz
    - _Requirements: 12.2, 16.7, 16.8_

- [ ] 2. Implementar `packages/contracts`
  - [x] 2.1 Definir tipos, interfaces y constantes en `src/index.ts`
    - Reescribir solo los comentarios de los tipos existentes (unidades, Marco_Horizontal, km, UTC, `lonDeg` en `(-180, 180]`) sin cambiar ningún tipo
    - Agregar `UtcString`, `EphemerisBinaryHeader`, `SkyEventType`, `SkyEvent`, `Vec3`, `SiteMetrics`, `SceneMode`, `Unsubscribe`, `ScreenAnchor`, `SceneApi`, `Language`, `I18nApi`, `PanelContext`, `PanelTab`, `TimeController`, `EnergyInput`, `SolarPanelViewApi`, `ReportScenario`, `ReportParam`, `ReportTable`, `ReportSection`, `ReportData`
    - Agregar la constante `APOLLO_SITE_IDS` (tupla `as const` con `apollo-11`, `apollo-12`, `apollo-14`, `apollo-15`, `apollo-16`, `apollo-17`, solo ids) y el tipo `ApolloSiteId`; documentar que Apollo 13 no figura porque no alunizó y que `sites` solo la amplía mediante "Solicitud al contrato"
    - Extender `EphemerisService` con `findEvents` sin tocar `getSky` ni `getSeries`
    - Documentar en `EphemerisBinaryHeader` que el encabezado se guarda en `data/ephemeris/ephemeris.json`, que el binario es `data/ephemeris/ephemeris.bin` sin encabezado interno y que su tamaño es `count * 48` bytes
    - Documentar `Unidad:` en cada campo numérico, valor por defecto de `ms` (1000), semántica de `findEvents`, `dispose`, límites de `ReportData` (título 200, secciones 50) y contenido no confiable de `svg`/`pngDataUrl`
    - Cada nuevo campo agregado a `EnergyResult` o `EnergyMethod`, si existe, es opcional
    - _Requirements: 1.1–1.11, 2.1–2.5, 3.1–3.6, 3.9–3.12, 4.1–4.8, 6.12_

  - [x] 2.2 Crear el esquema zod del Manifest en `src/manifest.ts`
    - `ManifestSchema` con `z.strictObject` en todos los niveles; `version: z.literal(1)`; secciones `models`, `textures` y `audio` con `.optional()` (sin `.default`); el tipo del asset lo determina la sección, sin campo `type`
    - Campos por sección, los mismos que el `public/assets/manifest.json` real: en `models`, `id`, `path`, `credit` y los opcionales `unitsToMeters`, `upAxis`, `nodes`, `polygons`, `license`; en `textures`, `id`, `path` y `credit`; en `audio`, `id`, `path` y `credit`
    - `assetPathSchema` relativo a `public/assets/`: rechaza segmento `..`, `/` o `\` inicial, letra de unidad, esquema de protocolo y prefijo `assets/`
    - Validación de crédito con `trim().length` entre 1 y 500 sin `transform`, extensiones por tipo (`.glb` en minúscula para modelos) e ids únicos con `superRefine`
    - Mensajes: `ruta "<ruta>" rechazada: <motivo>` y `asset "<id>": campo credit vacío o ausente`
    - Exportar `ManifestSchema`, `Manifest` y `ASSET_KINDS` desde `src/index.ts`
    - _Requirements: 5.1–5.8, 5.10–5.12_

  - [x] 2.3 Implementar `registerPanelTab` y `getPanelTabs`
    - Registro interno `Map`; `registerPanelTab` lanza `Error` con el `id` duplicado y conserva el registro existente; `getPanelTabs(): readonly PanelTab[]` en orden de registro
    - Documentar el comportamiento en comentarios
    - Ningún otro código de ejecución en el paquete
    - _Requirements: 3.7, 3.8, 16.4_

  - [ ]* 2.4 Escribir prueba de propiedad del registro de pestañas
    - **Property 17: Registro de pestañas, el primero gana**
    - **Validates: Requirements 3.7, 3.8**

  - [ ]* 2.5 Escribir prueba de propiedad de ida y vuelta del Manifest
    - **Property 14: Manifest, ida y vuelta**
    - **Validates: Requirements 5.4, 5.5, 5.1**

  - [ ]* 2.6 Escribir prueba de propiedad de rutas inseguras del Manifest
    - **Property 15: Manifest, rutas inseguras rechazadas**
    - **Validates: Requirements 5.6, 5.11**

  - [ ]* 2.7 Escribir prueba de propiedad de campos obligatorios del Manifest
    - **Property 16: Manifest, campos obligatorios**
    - **Validates: Requirements 5.2, 5.3, 5.7, 5.8**

  - [ ]* 2.8 Escribir pruebas de tipos y exportaciones de Contracts
    - `test/*.types.ts` con `Equals<A,B>`: forma exacta de `Result<T>`, `SiteMetrics`, `EnergyInput`, `SceneMode`, tupla `fields`, tupla `APOLLO_SITE_IDS`; `@ts-expect-error` para casos inválidos
    - Importar por nombre cada export de los Requirements 1 a 5 y verificar con `Object.keys` que el runtime exporta solo `registerPanelTab`, `getPanelTabs` y los esquemas y constantes permitidos (incluida `APOLLO_SITE_IDS`)
    - Verificar que `zod` está declarado con versión exacta
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.8, 6.12_

  - [x] 2.9 Migrar `public/assets/manifest.json` y `tools/validate-assets.ps1`
    - En `public/assets/manifest.json` cambiar solo los cuatro valores `path`: `/assets/models/apollo-lm.glb` pasa a `models/apollo-lm.glb`, `/assets/textures/moon-color.webp` a `textures/moon-color.webp`, `/assets/textures/moon-height.webp` a `textures/moon-height.webp` y `/assets/textures/earth-color.webp` a `textures/earth-color.webp`
    - No agregar campo `type`; `version`, `id`, `credit`, `unitsToMeters`, `upAxis`, `nodes`, `polygons` y `license` quedan sin cambios
    - En la función `Check` de `tools/validate-assets.ps1` usar `$full = Join-Path "public\assets" ($i.path -replace '/', '\')` (se elimina el `-replace '^/', ''` y el prefijo `public`)
    - En la comprobación de GLB huérfanos cambiar la comparación a `(("public\assets\" + $_.path) -replace '/', '\') -eq $rel`; el resto del script no cambia
    - _Requirements: 5.9, 5.13_

  - [ ] 2.10 Escribir pruebas del manifest real y de la resolución de rutas
    - Prueba en `packages/contracts/test` que parsea el `public/assets/manifest.json` real con `ManifestSchema` y falla si el resultado no es exitoso
    - Prueba que aplica la misma resolución de rutas que el script (`path.join('public','assets', ruta)`) a cada ruta del manifest y comprueba que el resultado empieza por `public/assets/`, no contiene `..` y, si el archivo existe en disco, que `fs.existsSync` es verdadero (los assets aún no entregados no hacen fallar la prueba)
    - Se mantiene como tarea obligatoria porque el Requirement 5.14 la exige
    - _Requirements: 5.9, 5.13, 5.14_

- [x] 3. Scripts de verificación en Contracts
  - [x] 3.1 Implementar `checkVersions` y su CLI
    - `scripts/lib/checkVersions.ts` (función pura) y `scripts/check-versions.ts`; recorre todos los `package.json`, ignora `workspace:*`, lista archivo, nombre y versión, sale con 1 si hay alguna
    - _Requirements: 12.2, 12.3_

  - [ ]* 3.2 Escribir prueba de propiedad de versiones exactas
    - **Property 19: Versiones exactas**
    - **Validates: Requirements 12.2, 12.3**

  - [x] 3.3 Implementar `checkContractDocs` y su CLI
    - Análisis por líneas: cada campo numérico de `interface`/`type` exportados exige `Unidad:`; devuelve los nombres sin unidad
    - _Requirements: 2.6_

  - [ ]* 3.4 Escribir prueba de propiedad del verificador de unidades
    - **Property 18: Verificador de unidades documentadas**
    - Agregar una prueba que ejecuta `checkContractDocs` sobre el `src/index.ts` real y espera lista vacía
    - **Validates: Requirements 2.6**

  - [x] 3.5 Implementar `checkWorkflows` y su CLI
    - Detecta `uses:` sin SHA de 40 hex (excluye `./`) y ausencia de `permissions` con `contents: read` como máximo; indica archivo y acción
    - _Requirements: 12.10, 12.12_

  - [ ]* 3.6 Escribir prueba de propiedad de acciones fijadas por SHA
    - **Property 20: Acciones fijadas por SHA**
    - **Validates: Requirements 12.10, 12.12**

  - [x] 3.7 Implementar `checkSecurityDoc` y su CLI
    - Tabla ASVS `ID | Control | Estado | Evidencia o justificación`; reporta estado inválido, "cumplido" sin ruta existente, "no aplicable" sin justificación, rutas inexistentes (id y ruta), y que existan las cinco secciones H2 y las seis categorías STRIDE
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.7, 14.8_

  - [ ]* 3.8 Escribir prueba de propiedad del verificador de `SEGURIDAD.md`
    - **Property 32: Verificador de `docs/SEGURIDAD.md`**
    - **Validates: Requirements 14.3, 14.4, 14.5, 14.7, 14.8**

- [ ] 4. Checkpoint - Contracts y scripts
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Implementar `packages/security`
  - [x] 5.1 Implementar validadores de latitud, longitud, fecha UTC e id de sitio
    - `lat.ts`, `lon.ts` (devuelve siempre Longitud_Canonica, `-0 → 0`), `utc.ts` (aritmética de calendario sin `Date`, ≤ 64 caracteres, sin fracciones), `siteId.ts`
    - En `siteId.ts` exportar `SITE_ID_ALLOWLIST: readonly string[] = [...APOLLO_SITE_IDS]` importando `APOLLO_SITE_IDS` de `@lunar/contracts`; no duplicar los ids ni agregar coordenadas
    - Todas devuelven `Result<T>`, nunca lanzan, mensajes en español sin incluir el valor recibido; exportar desde `src/index.ts`
    - _Requirements: 6.1–6.9, 6.12_

  - [ ]* 5.2 Escribir prueba de propiedad de latitud
    - **Property 1: Latitud, aceptación exacta**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [ ]* 5.3 Escribir prueba de propiedad de longitud canónica
    - **Property 2: Longitud, rango canónico y congruencia**
    - **Validates: Requirements 6.4, 6.11**

  - [ ]* 5.4 Escribir prueba de propiedad de idempotencia de longitud
    - **Property 3: Longitud, idempotencia**
    - **Validates: Requirements 6.10**

  - [ ]* 5.5 Escribir prueba de propiedad de rechazo de longitud
    - **Property 4: Longitud, rechazo de entradas inválidas**
    - **Validates: Requirements 6.1, 6.5**

  - [ ]* 5.6 Escribir prueba de propiedad de fecha UTC
    - **Property 5: Fecha UTC equivale al oráculo de calendario**
    - **Validates: Requirements 6.6, 6.7, 6.1**

  - [ ]* 5.7 Escribir prueba de propiedad de id de sitio
    - **Property 6: Id de sitio, lista blanca exacta**
    - **Validates: Requirements 6.8, 6.9, 6.12**

  - [x] 5.8 Implementar `sanitizeText` y `sanitizeName`
    - Pipeline: tipo, recorrido lineal que descarta Cc, bidi y marcas HTML (sin regex `<[^>]*>`), NFC, `trim`, conteo de puntos de código; errores de vacío y de longitud máxima sin truncar
    - _Requirements: 7.1–7.6_

  - [ ]* 5.9 Escribir prueba de propiedad de invariantes de salida de nombres
    - **Property 7: Nombres, invariantes de salida**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.8**

  - [ ]* 5.10 Escribir prueba de propiedad de idempotencia de nombres
    - **Property 8: Nombres, idempotencia**
    - **Validates: Requirements 7.7**

  - [ ]* 5.11 Escribir prueba de propiedad de clasificación de nombres
    - **Property 9: Nombres, clasificación de aceptación**
    - **Validates: Requirements 7.4, 7.5, 7.6, 7.1**

  - [ ] 5.12 Implementar `loadClassPackage`, `ClassPackageSchema`, `validateManifest` y cableado final de `src/index.ts`
    - Límite `MAX_CLASS_PACKAGE_BYTES = 1_048_576` medido antes de parsear, `JSON.parse` en `try/catch`, recorrido iterativo con pila (profundidad máxima 32) buscando `__proto__`, `constructor`, `prototype`, `z.strictObject` en todos los niveles, lista blanca de `siteIds` con `SITE_ID_ALLOWLIST`, sanitización de textos con `sanitizeText`
    - `validateManifest` con `ManifestSchema.safeParse` y el primer issue con su ruta
    - Exportar toda la API pública del paquete
    - _Requirements: 8.1–8.9, 5.1_

  - [ ]* 5.13 Escribir prueba de propiedad de Class_Package que nunca lanza
    - **Property 10: Paquete de clase, nunca lanza y respeta el tamaño**
    - **Validates: Requirements 8.3, 8.4, 8.5**

  - [ ]* 5.14 Escribir prueba de propiedad de claves prohibidas y prototipo intacto
    - **Property 11: Paquete de clase, claves prohibidas y prototipo intacto**
    - **Validates: Requirements 8.6, 8.9**

  - [ ]* 5.15 Escribir prueba de propiedad de ida y vuelta con saneamiento
    - **Property 12: Paquete de clase válido, ida y vuelta con saneamiento**
    - **Validates: Requirements 8.1, 8.7**

  - [ ]* 5.16 Escribir prueba de propiedad de mutaciones inválidas
    - **Property 13: Paquete de clase, mutaciones inválidas rechazadas**
    - **Validates: Requirements 8.1, 8.8**

  - [ ] 5.17 Escribir pruebas unitarias con entradas hostiles
    - Un archivo por validador con caso válido y rechazado; tablas con `NaN`, `±Infinity`, `-0`, `"42"`, `"1e3"`, `""`, `" "`, `null`, `undefined`, `{}`, `[]`, `{valueOf: () => 1}`; límites de longitud -180, 180, 360, -180.000001, 360.000001
    - Cadenas `<script>`, `javascript:`, `' OR 1=1`, `../../`, `\u0000`, `\u202E`, `\u2066`, 1 048 576 caracteres (incluida `'<'.repeat(1_048_576)`) en menos de 1000 ms
    - Comprobar que `SITE_ID_ALLOWLIST` es igual a `[...APOLLO_SITE_IDS]` y que `apollo-13` se rechaza
    - Sin pruebas omitidas; `pnpm test` en el paquete termina en 0
    - Se mantiene como tarea obligatoria porque el Requirement 9 la exige como entregable
    - _Requirements: 9.1–9.4, 9.8, 6.12_

  - [ ] 5.18 Escribir pruebas de contaminación de prototipo
    - Archivo propio en `packages/security/test` que cubre cada validador de objetos (`loadClassPackage`, `validateManifest`) con `__proto__`, `constructor.prototype` y variantes anidadas hasta 5 niveles, en objetos y dentro de arreglos
    - Tras cada prueba verificar que `Object.prototype` no tiene propiedades nuevas ni modificadas, con resultado válido o rechazado
    - Se mantiene como tarea obligatoria: es entregable de `packages/security` y compensa la excepción de `security/detect-object-injection` (desactivada fuera de `packages/security` y `apps/web/src/security`)
    - _Requirements: 8.9, 9.5, 12.5_

- [ ] 6. Checkpoint - Security
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Configurar ESLint y análisis de código
  - [x] 7.1 Prueba de humo de ESLint con TypeScript 7 y decisión de respaldo
    - Primera tarea de ESLint: instalar `typescript-eslint` y `eslint-plugin-security` con `--save-exact` y ejecutar `eslint` sobre un `.ts` de prueba usando `typescript 7.0.2`
    - Si el parser funciona, continuar con configuración en la raíz
    - Si falla (peer `typescript <6.1.0`), crear el paquete de workspace `tools/lint` con su propio `typescript` exacto compatible (por ejemplo 5.9.x), mover ahí `typescript-eslint` y la configuración, y dejar el resto del repositorio en TypeScript 7; registrar el resultado para `docs/INTEGRACION.md`
    - _Requirements: 12.5_

  - [x] 7.2 Crear `eslint.config.js` y el script `pnpm lint`
    - Nivel `error`: `no-eval`, `no-new-func`, `no-implied-eval`, `no-script-url` y las reglas de `security.configs.recommended` promovidas a `error`
    - `security/detect-object-injection` en `off` en el bloque base (todo el repositorio) y en `error` en un bloque con `files: ['packages/security/**/*.ts', 'apps/web/src/security/**/*.ts']`
    - `no-restricted-syntax` para `innerHTML`/`outerHTML` con valor no literal, `insertAdjacentHTML` con argumento no literal y `it/test/describe.skip|todo|only|skipIf|runIf`
    - `no-restricted-imports` con el patrón `**/stubs/**`, con excepción en `apps/web/src/stubs/**` y `apps/web/test/**`, para impedir importaciones estáticas de stubs
    - Ubicar la configuración según el resultado de 7.1 (raíz o `tools/lint`) y cablear `pnpm lint` en la raíz
    - _Requirements: 12.5, 12.6, 9.8, 16.6, 10.18_

  - [ ]* 7.3 Escribir pruebas de lint con `ESLint.lintText`
    - `el.innerHTML = userInput` falla, `el.innerHTML = 'literal'` pasa, `eval`, `new Function`, `setTimeout('x')`, `javascript:` y `it.skip` fallan
    - `obj[k]` falla bajo `packages/security/src/x.ts` y `apps/web/src/security/x.ts`, y pasa bajo `packages/sky/src/x.ts`
    - `import x from '../stubs/ephemeris.stub.ts'` falla en `apps/web/src/modules/` y pasa en `apps/web/test/`
    - _Requirements: 12.5, 12.6, 10.18_

- [ ] 8. Implementar el Shell `apps/web`
  - [x] 8.1 Crear la estructura base del Shell y los modos de Vite
    - `index.html`, `tsconfig.json`, `src/env.d.ts` con `declare const __LUNAR_DEMO__: boolean`
    - `vite.config.ts` base: `publicDir: '../../public'`, `build.modulePreload.polyfill: false`, `define: { __LUNAR_DEMO__: JSON.stringify(mode === 'demo') }`, `build.sourcemap: false` en producción, `chunkFileNames: '[name]-[hash].js'` de modo que en `demo` cada stub quede en su propio chunk
    - `vitest.config.ts` con `environment: 'jsdom'` y `__LUNAR_DEMO__` definido en `true` por defecto
    - Scripts de `apps/web/package.json`: `dev` (`--mode demo`), `build` (`tsc --noEmit && vite build --mode production`), `build:demo` (`vite build --mode demo --outDir dist-demo`), `test`, `check:hashes`, `check:no-stubs`
    - Agregar `dist-demo` a `.gitignore`
    - _Requirements: 10.5, 10.14, 10.15, 10.18_

  - [ ] 8.2 Implementar `src/security/csp.ts`
    - `REQUIRED_DIRECTIVES`, `CSP_POLICY` (tabla de D2 con `media-src` y `manifest-src`), `serializeCsp`, `parseCsp`, `findViolations`
    - _Requirements: 11.1–11.4, 11.8, 11.9_

  - [ ]* 8.3 Escribir prueba de propiedad de ida y vuelta de CSP
    - **Property 21: CSP, ida y vuelta**
    - **Validates: Requirements 11.6, 11.1**

  - [ ]* 8.4 Escribir prueba de propiedad de detección de violaciones de CSP
    - **Property 22: CSP, detección exacta de violaciones**
    - **Validates: Requirements 11.2, 11.3, 11.4, 11.7, 11.8, 11.9**

  - [ ] 8.5 Agregar `cspPlugin` a `vite.config.ts`
    - `apply: 'build'`, `transformIndexHtml: { order: 'post' }`, inyecta `<meta http-equiv="Content-Security-Policy">` en `head-prepend`; lanza `Error` si falta una directiva
    - _Requirements: 11.6, 11.9_

  - [ ]* 8.6 Crear el `globalSetup` de compilaciones de prueba
    - `test/setup/builds.ts` ejecuta una sola vez la API `build()` de Vite en `production` y en `demo`, cada una con un `outDir` temporal, y expone las rutas a las pruebas; registrarlo en `vitest.config.ts`
    - _Requirements: 10.15, 11.6_

  - [ ]* 8.7 Escribir prueba de CSP sobre el `index.html` de producción
    - Análisis con `DOMParser` del `index.html` del build `production`; `findViolations = []` e igualdad con `CSP_POLICY`; fixture con violaciones que comprueba el mensaje con directiva y valor
    - _Requirements: 11.6, 11.7, 11.8, 11.9_

  - [ ] 8.8 Implementar `ModuleUnavailableError` y el marcador de stubs
    - `src/host/moduleUnavailable.ts` con la clase `ModuleUnavailableError(moduleName)` y mensaje `<módulo>: módulo no disponible`
    - `src/stubs/marker.ts` con `STUB_MARKER = '__LUNAR_STUB__'` y `testText(s) = '[PRUEBA] ' + s`
    - _Requirements: 10.16, 10.17, 10.19_

  - [ ] 8.9 Implementar `src/integrity/` y `src/net/localFetch.ts`
    - `sha256Hex` (Web Crypto), `verifyBytes`, `hashes.ts` (esquema zod de `hashes.json` y `compareHashes`), `ephemerisLayout.ts` (`validateEphemerisLayout`), `loadVerified` (falla cerrado si la entrada es PENDIENTE, el hash difiere o falta `crypto.subtle`; sin cachés) y `localFetch` como único uso de `fetch`
    - _Requirements: 13.1, 13.3–13.8_

  - [ ]* 8.10 Escribir prueba de propiedad de SHA-256
    - **Property 23: SHA-256 en runtime equivale a la referencia**
    - **Validates: Requirements 13.5, 13.1**

  - [ ]* 8.11 Escribir prueba de propiedad de alteración detectada
    - **Property 24: Alteración detectada y bytes descartados**
    - **Validates: Requirements 13.5, 13.6**

  - [ ]* 8.12 Escribir prueba de propiedad de `compareHashes`
    - **Property 25: Verificación de hashes, clasificación y código de salida**
    - **Validates: Requirements 13.3, 13.4, 13.8**

  - [ ]* 8.13 Escribir prueba de propiedad de la disposición de `ephemeris.bin`
    - **Property 26: Disposición de `ephemeris.bin`**
    - **Validates: Requirements 13.7**

  - [ ] 8.14 Crear `data/hashes.json` y los scripts de hashes
    - `data/hashes.json` con `public/assets/manifest.json` en `OK` (hash calculado sobre el manifest ya migrado en 2.9) y en `PENDIENTE` (con fuente) `data/ephemeris/ephemeris.bin`, `data/ephemeris/ephemeris.json` y los cuatro assets del manifest
    - `data/ephemeris/ephemeris.json` serializa `EphemerisBinaryHeader`; solo se materializa con datos reales y mientras tanto queda PENDIENTE
    - `scripts/verify-hashes.ts` (descubre archivos excluyendo `kernels/`, `raw/` y `.gitkeep`; lista siempre los PENDIENTE; fallos con ruta y motivo; `header.sha256` igual a la entrada de `ephemeris.bin`) y `scripts/generate-hashes.ts` con orden estable
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.8_

  - [ ] 8.15 Agregar el plugin `preloadedData` a `vite.config.ts`
    - En dev sirve `/data/**` desde `data/`; en build emite esos archivos sin hash en el nombre, excluyendo `kernels/` y `raw/`
    - _Requirements: 13.5_

  - [ ] 8.16 Implementar los 7 stubs en `src/stubs/`
    - `<nombre>.stub.ts` para `ephemeris` (con `findEvents` que valida con `validateUtc` y rechaza nombrando `startUtc`/`endUtc`), `terrain`, `scene3d`, `i18n`, `time`, `solar-view` y `energy`
    - Datos determinísticos por función hash; `Stubbed<T> = T & { isTestData: true }` en cada objeto devuelto y en cada elemento de arreglos devueltos, y `readonly isTestData: true` en el propio stub para los valores primitivos
    - Cada archivo contiene `STUB_MARKER` (`__LUNAR_STUB__`); las salidas de texto visibles (`t()`, nombres de sitio, `EnergyMethod.name`) usan `testText`; `t(key)` sin clave devuelve `testText(key)`; no se prefijan cadenas con formato de contrato (UTC, ids)
    - Los stubs solo se incluyen en el modo `demo`
    - _Requirements: 10.1, 10.2, 10.19, 1.9, 1.10, 3.5, 3.12, 4.7_

  - [ ]* 8.17 Escribir prueba de propiedad del stub de efemérides
    - **Property 29: Stub de efemérides, forma y orden**
    - **Validates: Requirements 1.9, 1.10, 10.1, 10.2, 16.5**

  - [ ]* 8.18 Escribir prueba de propiedad de suscripciones y texto de reemplazo
    - **Property 30: Suscripciones y texto de reemplazo en stubs**
    - **Validates: Requirements 3.5, 3.12, 10.19**

  - [ ]* 8.19 Escribir prueba de propiedad del ciclo de vida de la vista solar
    - **Property 31: Vista del panel solar, ciclo de vida**
    - **Validates: Requirements 4.7**

  - [ ]* 8.20 Escribir pruebas de contrato por stub
    - Una prueba de tipos o de ejecución por stub; deben fallar si falta un miembro (`@ts-expect-error`) o el valor no cumple el contrato
    - _Requirements: 16.5, 10.3_

  - [ ] 8.21 Crear los 7 puntos de registro en `src/modules/`
    - Un archivo por interfaz (`ephemeris`, `terrain`, `scene3d`, `i18n`, `time`, `solar-view`, `energy`) con `if (__LUNAR_DEMO__) { const m = await import('../stubs/<nombre>.stub.ts'); return m.create…(); }` y, fuera de esa rama, `throw new ModuleUnavailableError('<nombre>')`
    - Sustituir un stub cambia solo la rama de producción de ese archivo; sin importaciones estáticas de stubs
    - _Requirements: 10.4, 10.5, 10.16, 10.18_

  - [ ] 8.22 Implementar el host de pestañas y el banner en `src/host/`
    - `tabController.ts` (máquina `idle|loading|mounted|failed` con `open`, `close`, `retry`), `errorView.ts` (`createElement` y `textContent`, botón Reintentar, sin `innerHTML`; para `ModuleUnavailableError` muestra "módulo no disponible" y el nombre, sin datos), `panelHost.ts` (un controlador por `getPanelTabs()`, fallos aislados)
    - `stubBadge.ts`: solo con `__LUNAR_DEMO__` verdadero y al menos una instancia con `isTestData === true`, crea `<div id="lunar-demo-banner" role="status">` con `textContent = 'Datos de prueba, no científicos'`, sin botón, enlace, `tabindex` ni manejadores de evento, fijo con CSS `position: sticky`; el Shell lo retira solo cuando no queda ninguna instancia de prueba
    - _Requirements: 10.2, 10.6–10.11, 10.16, 10.20_

  - [ ]* 8.23 Escribir prueba de propiedad del ciclo de vida de pestañas
    - **Property 27: Ciclo de vida de pestañas**
    - **Validates: Requirements 10.6, 10.7, 10.9, 10.10**

  - [ ]* 8.24 Escribir prueba de propiedad de la pantalla de error
    - **Property 28: Pantalla de error con texto inerte**
    - **Validates: Requirements 10.8, 10.11, 10.16**

  - [ ] 8.25 Implementar `check-no-stubs`
    - `scripts/lib/findStubLeaks.ts` (función pura: archivos y nombres de stubs, devuelve cada archivo con la marca `__LUNAR_STUB__` o el nombre `<nombre>.stub`, con ruta y motivo) y `scripts/check-no-stubs.ts` (recorre `dist` con contenido leído como `latin1`, obtiene los nombres de `src/stubs/`, sale con 1 si hay fugas o si `dist` no existe o está vacío)
    - _Requirements: 10.17_

  - [ ]* 8.26 Escribir prueba de propiedad del detector de stubs
    - **Property 33: El detector de stubs informa exactamente las fugas**
    - **Validates: Requirements 10.17**

  - [ ]* 8.27 Escribir prueba de propiedad del prefijo `[PRUEBA]`
    - **Property 34: Las salidas de texto de los stubs llevan el prefijo `[PRUEBA]`**
    - **Validates: Requirements 10.19, 10.2**

  - [ ] 8.28 Conectar `src/main.ts` y las pestañas de ejemplo
    - Pestañas de ejemplo en `src/tabs/` registradas con `registerPanelTab`; `main.ts` resuelve los 7 puntos de registro con `Promise.allSettled`, muestra cada rechazo con `renderError` y monta `PanelHost`
    - En modo `demo` monta el banner permanente mientras haya instancias con `isTestData`; en `production` no existe; pie "Inspirado en NASA Space Apps - No avalado por la NASA", ambos con `textContent`
    - Sin logo de la NASA
    - _Requirements: 10.2, 10.12, 10.13, 10.14, 10.16, 10.20_

  - [ ]* 8.29 Escribir prueba de propiedad del banner permanente
    - **Property 35: El banner de datos de prueba es permanente e inerte**
    - **Validates: Requirements 10.20, 10.2**

  - [ ]* 8.30 Escribir pruebas de integración del Shell
    - Banner presente con stubs en `demo` y ausente sin instancias `isTestData`; pie visible; sin archivos de logo NASA; `fetch` solo en `localFetch`; espía de red sin solicitudes en el arranque; `hashes.json` cumple su esquema y toda entrada PENDIENTE tiene fuente
    - _Requirements: 10.2, 10.12, 10.13, 13.8_

  - [ ]* 8.31 Escribir pruebas de integración de las compilaciones
    - Con el `globalSetup` de 8.6 y la API `build()` de Vite, una ejecución por modo
    - `production`: ningún archivo de `dist` contiene `__LUNAR_STUB__` ni `<nombre>.stub` de los 7 stubs, no hay chunks de stubs, el banner no está en el código emitido y `check-no-stubs` termina con 0; una copia del `dist` con la marca insertada a mano termina con 1 e indica el archivo
    - `demo`: cada stub está en un chunk aparte que contiene la marca, el chunk de entrada no la contiene, y al cargar la página (jsdom) existe el banner con el texto exacto
    - Arranque en `production` (`__LUNAR_DEMO__ = false` con `vi.resetModules()`): los 7 loaders rechazan con `ModuleUnavailableError` sin devolver datos y cada pantalla de error muestra "módulo no disponible", el nombre y el botón de reintento
    - Documentar el límite de la garantía: un módulo de prueba que muestra datos de un stub sin marca no es detectado por el Shell
    - _Requirements: 10.2, 10.5, 10.15, 10.16, 10.17, 10.18, 10.20_

- [ ] 9. Checkpoint - Shell
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. CI y análisis estático
  - [x] 10.1 Crear `.semgrep/rules.yml`
    - Reglas `ERROR`: `eval(...)`, `new Function(...)`, `setTimeout`/`setInterval` con cadena, `.innerHTML =` no literal, `fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts` fuera de `apps/web/src/net/localFetch.ts`, `document.write`
    - Acceso con corchetes cuyo índice sea `__proto__`, `constructor` o `prototype` (literal o variable con ese nombre), como control compensatorio de `detect-object-injection`
    - `import` estático de `**/stubs/**` fuera de `apps/web/src/stubs` y `apps/web/test`
    - _Requirements: 12.5, 12.8, 10.18_

  - [ ] 10.2 Crear `.github/workflows/ci.yml` y `codeql.yml`
    - `ci.yml`: jobs `verify`, `audit`, `semgrep` con `permissions: contents: read`, `pnpm install --frozen-lockfile`, `pnpm audit --audit-level high`, Semgrep con versión exacta y `--severity ERROR --error`
    - En `verify`: `pnpm lint`, `pnpm check:versions`, `pnpm check:workflows`, `pnpm check:docs`, `pnpm check:hashes`, `pnpm test`, `pnpm build` (modo `production`), `pnpm check:no-stubs` inmediatamente después de la compilación de producción y `pnpm --filter @lunar/web build:demo`
    - `codeql.yml` separado: `continue-on-error: true`, `if: ${{ !github.event.repository.private }}`, permisos del trabajo `security-events: write` y `contents: read`
    - Todas las acciones con SHA de 40 caracteres resueltas con `gh api` y comentario `# vX.Y.Z`; ejecutar `pnpm check:workflows`
    - _Requirements: 12.1, 12.4, 12.7–12.10, 12.12, 16.6, 16.7, 16.9, 10.17_

  - [ ]* 10.3 Escribir pruebas estructurales de los flujos de CI
    - Sobre los YAML reales: `frozen-lockfile`, `pnpm audit --audit-level high`, Semgrep sin `continue-on-error`, CodeQL con `continue-on-error: true` en flujo aparte, permisos mínimos y acciones fijadas por SHA (usa `checkWorkflows`)
    - El paso `pnpm check:no-stubs` existe en `verify` y va después del paso `pnpm build`
    - _Requirements: 12.1, 12.4, 12.7, 12.8, 12.10, 10.17_

- [ ] 11. Documentación
  - [ ] 11.1 Redactar `docs/SEGURIDAD.md`
    - Cinco secciones H2 (STRIDE, ASVS_Adaptada, CSP, Class_Package, verificación de hashes), seis categorías STRIDE con amenaza, control y ubicación, tabla ASVS con estados y evidencias, directivas CSP con valor y pares directiva-origen justificados (`img-src data:`, `img-src blob:`, `media-src`, `manifest-src`)
    - Limitaciones: `frame-ancestors` en `<meta>`, alcance del hash, y el límite de la garantía de stubs (el Shell garantiza banner, prefijo `[PRUEBA]` e `isTestData`, no la interfaz de otros módulos)
    - Registrar la excepción de `security/detect-object-injection` y sus controles compensatorios, y la exclusión de stubs en producción con `check-no-stubs`
    - Incluir el comando `gh api` de protección de rama como paso manual
    - _Requirements: 11.5, 12.11, 14.1–14.6_

  - [ ] 11.2 Redactar `docs/INTEGRACION.md`
    - En español; orden de unión de los 14 módulos (tabla D5), regla de bloqueo de dependientes, procedimiento "Solicitud al contrato", lista de datos PENDIENTE con fuente, versión y justificación de `zod`
    - Criterio de cierre de cinco elementos por módulo: (a) API exportada en `src/index.ts`, (b) pruebas del paquete con 0 fallos, (c) existe `docs/MODULO-<nombre>.md`, (d) stub reemplazado por la implementación real (para el Shell: los 7 puntos de registro apuntan a implementaciones reales o a un stub listado como PENDIENTE), (e) ningún código del módulo consume objetos con `isTestData` como si fueran reales (los rechaza o propaga la marca) y hay pruebas del paquete que lo verifican; un módulo que incumple (e) no se considera cerrado
    - Explicar el límite de la garantía de stubs y los modos `production`/`demo`
    - Registro de decisiones con fecha `AAAA-MM-DD`: las 11 del Requirement 15.6 más `getPanelTabs`, `detect-object-injection` desactivado fuera de las dos rutas de seguridad, migración del manifest, `isTestData` en el stub, `data/ephemeris/ephemeris.json` como encabezado, `APOLLO_SITE_IDS`, modos `production`/`demo` con exclusión de stubs, criterio de cierre (e), `Vec3`/`ScreenAnchor`/`Unsubscribe`, y resultado de la prueba de humo de ESLint con TypeScript 7 (7.1)
    - _Requirements: 15.1–15.8, 16.8_

  - [ ] 11.3 Redactar `docs/MODULO-contracts.md` y `docs/MODULO-security.md`
    - API pública (incluida `APOLLO_SITE_IDS` y `SITE_ID_ALLOWLIST`), ejemplos de uso, reglas de cambios al contrato y límites
    - _Requirements: 15.3_

  - [ ]* 11.4 Escribir pruebas de los documentos
    - `checkSecurityDoc` sobre `docs/SEGURIDAD.md` real sin fallos; `INTEGRACION.md` con 14 posiciones numeradas, dependencias en posiciones anteriores, criterio de cierre con los cinco elementos (a) a (e) por módulo, sección de decisiones y cada dato PENDIENTE con fuente
    - _Requirements: 14.1–14.8, 15.2–15.7_

- [ ] 12. Final checkpoint - Verificación completa
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las sub-tareas marcadas con `*` son opcionales y se pueden omitir para un MVP más rápido; las tareas 2.10, 5.17 y 5.18 no lo son porque los Requirements 5.14, 9 y 9.5 exigen esas pruebas como entregable.
- Cada tarea referencia requisitos específicos para trazabilidad; cada propiedad del diseño (1 a 35) tiene su propia sub-tarea.
- Las pruebas de propiedades usan fast-check con al menos 100 casos y el comentario `// Feature: lunar-navigator-base, Property N: <texto>`.
- Esta lista no ejecuta nada por sí misma: el flujo termina con la creación de los artefactos de planificación.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.3", "3.5", "3.7", "7.1", "10.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.6", "3.8", "5.1", "5.8", "7.2"] },
    { "id": 3, "tasks": ["2.3", "2.5", "2.6", "2.7", "2.9", "5.2", "5.3", "5.4", "5.5", "5.6", "5.7", "5.9", "5.10", "5.11", "5.12", "7.3", "8.1"] },
    { "id": 4, "tasks": ["2.4", "2.8", "2.10", "3.4", "5.13", "5.14", "5.15", "5.16", "5.17", "5.18", "8.2", "8.8", "8.9"] },
    { "id": 5, "tasks": ["8.3", "8.4", "8.5", "8.10", "8.11", "8.12", "8.13", "8.14", "8.16", "8.22", "8.25"] },
    { "id": 6, "tasks": ["8.6", "8.15", "8.17", "8.18", "8.19", "8.20", "8.21", "8.23", "8.24", "8.26", "8.27", "8.29", "10.2"] },
    { "id": 7, "tasks": ["8.7", "8.28", "10.3"] },
    { "id": 8, "tasks": ["8.30", "8.31", "11.1", "11.2", "11.3"] },
    { "id": 9, "tasks": ["11.4"] }
  ]
}
```
