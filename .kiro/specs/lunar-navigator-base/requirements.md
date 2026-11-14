# Requirements Document

## Introduction

Este spec prepara la base de "Lunar Landing Site Navigator" (Fase A) para que 14 módulos, desarrollados en chats distintos, se integren sin conflictos. Entrega cinco cosas: (1) contratos TypeScript y el esquema del manifest en `packages/contracts`, (2) validación de entradas en `packages/security`, (3) un shell en `apps/web` con stubs que cumplen cada contrato, (4) endurecimiento de seguridad y cadena de suministro, y (5) la documentación `docs/SEGURIDAD.md` y `docs/INTEGRACION.md`.

Restricciones heredadas de `.kiro/steering` y `docs/CONTRATO.md`: TypeScript estricto, Vite, Three.js, pnpm workspaces, vitest; offline primero (sin red en runtime); toda entrada del usuario pasa por `packages/security` con zod y `Result<T>`; sin `eval`, `new Function` ni `innerHTML` con datos del usuario; modelos 3D solo GLB desde `public/assets/manifest.json`; sin datos científicos inventados (lo no verificado se marca PENDIENTE con su fuente); sin logo oficial de la NASA.

Convenciones del documento: las palabras clave EARS (WHEN, WHILE, IF, THEN, WHERE, THE, SHALL) se escriben en inglés; el resto del texto va en español. Los tipos existentes en `packages/contracts/src/index.ts` (`LunarSite`, `BodyState`, `SkyState`, `HorizonProfile`, `TerrainService`, `EnergyResult`, `EnergyMethod`, `Result<T>`, `Program`) se conservan sin cambios incompatibles. La longitud (`lonDeg`) usa siempre el intervalo (-180, 180].

Decisiones confirmadas en la revisión:
- `EphemerisService` existente se extiende con `findEvents`; `getSky` y `getSeries` conservan su firma.
- `EnergyResult` y `EnergyMethod` ya existen; se conservan y solo se agregan campos opcionales o tipos nuevos (`EnergyInput`) sin romper la forma actual.
- `EnergyInput`, `ReportData.scenarios`, `ReportData.params`, `ReportData.table`, `ReportData.sources`, el argumento de `SceneApi.setSiteMarkers` y el contexto `ctx` de `PanelTab` se definen como tipos exportados en `packages/contracts/src/index.ts` (no solo en `docs/INTEGRACION.md`, que además registra las decisiones). Decisiones: `ctx` es `{ site: LunarSite; utc: string }` y `setSiteMarkers(sites: LunarSite[])`; `EnergyInput` y los campos de `ReportData` son mínimos, con las unidades documentadas en los Requirements 3 y 4.
- Longitud: el validador de Security acepta longitudes de -180 a 360 grados (es decir, los formatos -180..180 y 0..360) y siempre devuelve un valor en el intervalo (-180, 180], el formato de `LunarSite.lonDeg`. Nunca normaliza a 0..360. Las longitudes fuera de -180..360 se rechazan.
- Versiones exactas: el repositorio incluye un `.npmrc` con `save-exact=true`; `typescript` y `vitest`, hoy con prefijo `^` en el `package.json` raíz, se fijan a versiones exactas; el script de verificación de versiones ignora las dependencias con protocolo `workspace:*`.
- Datos faltantes: los archivos de Preloaded_Data sin datos reales se marcan PENDIENTE; la verificación de hashes los lista (ruta, estado PENDIENTE y fuente), nunca los omite en silencio y no falla por ellos.
- Análisis estático: Semgrep es obligatorio; CodeQL es un paso opcional que no rompe el flujo si no está disponible (por ejemplo, en repositorios privados).
- El modo del tipo `SceneMode` y el nombre `PanelTab.titleKey` usan claves de i18n, no texto literal.

## Glossary

- **Contracts**: Paquete `packages/contracts` que contiene tipos, interfaces, esquemas zod y constantes compartidos entre módulos, y como único código de ejecución `registerPanelTab`, el accesor de solo lectura `getPanelTabs` y su registro interno (Requirement 16.4).
- **Security**: Paquete `packages/security` que valida y sanea toda entrada del usuario y de archivos externos.
- **Shell**: Aplicación `apps/web` que monta todos los módulos mediante stubs o implementaciones reales.
- **Stub**: Implementación mínima de un contrato que devuelve datos determinísticos y marcados como de prueba, sin lógica científica.
- **Result**: Tipo `Result<T>` de Contracts: `{ ok: true; value: T } | { ok: false; error: string }`.
- **Marco_Horizontal**: Convención angular local: azimut 0 = norte, sentido horario; elevación sobre el horizonte local, sin refracción.
- **Ephemeris_Binary**: Archivo `data/ephemeris/ephemeris.bin` de posiciones del Sol y la Tierra, sin encabezado interno, descrito por `EphemerisBinaryHeader`, que se guarda en el archivo `data/ephemeris/ephemeris.json`.
- **Manifest**: Archivo `public/assets/manifest.json` que lista los assets (GLB, texturas, audio) y sus créditos.
- **Class_Package**: Paquete de clase cargado por el usuario (modo clase) que contiene configuración educativa.
- **Site_Id_Allowlist**: Lista blanca de identificadores de sitio válidos.
- **Preloaded_Data**: Archivos bajo `data/` y `public/assets/` entregados con la aplicación.
- **CI**: Flujos de GitHub Actions del repositorio.
- **CSP**: Content Security Policy aplicada al Shell.
- **STRIDE**: Modelo de amenazas (Spoofing, Tampering, Repudiation, Information disclosure, Denial of service, Elevation of privilege).
- **ASVS_Adaptada**: Checklist basada en OWASP ASVS, reducida a los controles aplicables a una app offline.
- **Longitud_Canonica**: Longitud selenográfica en grados, este positivo, en el intervalo (-180, 180] (excluye -180, incluye 180), formato de `LunarSite.lonDeg`.
- **Modulo**: Cada uno de los 14 paquetes o apps con dueño definido en `.kiro/steering/structure.md`.

## Requirements

### Requirement 1: Tipos de efemérides en Contracts

**User Story:** Como desarrollador del módulo de efemérides, quiero un formato binario y una interfaz de servicio definidos, para que los módulos sky, scene3d y energy consuman mis datos sin acordar detalles aparte.

#### Acceptance Criteria

1. THE Contracts SHALL exportar la interfaz `EphemerisBinaryHeader` con los campos `version` (número entero mayor o igual a 1), `frame` (cadena no vacía), `startUtc` (cadena UTC ISO 8601), `stepSeconds` (número mayor que 0), `count` (número entero mayor o igual a 1), `units`, `fields` y `sha256` (cadena hexadecimal de 64 caracteres).
2. THE Contracts SHALL tipar `EphemerisBinaryHeader.units` como el literal `'km'`.
3. THE Contracts SHALL tipar `EphemerisBinaryHeader.fields` como la tupla literal de solo lectura `['sunX','sunY','sunZ','earthX','earthY','earthZ']`, de modo que el compilador de TypeScript rechace cualquier otro orden, longitud o valor.
4. THE Contracts SHALL documentar en comentarios que Ephemeris_Binary es Float64 little-endian, con `count` filas de 6 valores (`count * 6 * 8` bytes en total), y que el tiempo de la fila `i` es `startUtc + i*stepSeconds` para `i` entre 0 y `count - 1`.
5. THE Contracts SHALL documentar en comentarios el marco de referencia (`frame`), las unidades en km y el formato UTC ISO 8601 de `startUtc` con sufijo `Z` (por ejemplo `2025-01-01T00:00:00Z`).
6. THE Contracts SHALL exportar el tipo `SkyEvent` con `type` en `'sunrise' | 'sunset' | 'earthrise' | 'earthset'` y `utc` como cadena UTC ISO 8601 con sufijo `Z`.
7. THE Contracts SHALL extender `EphemerisService` con el método `findEvents(site, startUtc, endUtc)` que devuelve una promesa de `SkyEvent[]`, donde `site` tiene el mismo tipo que el parámetro `site` de `EphemerisService.getSky`, y `startUtc` y `endUtc` son cadenas UTC ISO 8601.
8. THE Contracts SHALL conservar sin cambios las firmas de `EphemerisService.getSky` y `EphemerisService.getSeries`, de modo que el código existente que las usa compile sin modificaciones.
9. THE Contracts SHALL documentar en comentarios de `EphemerisService.findEvents` que el intervalo incluye `startUtc` y excluye `endUtc`, que el arreglo devuelto está ordenado por `utc` ascendente, y que devuelve un arreglo vacío cuando no hay eventos en el intervalo.
10. IF `endUtc` es anterior a `startUtc` o alguna de las dos cadenas no es UTC ISO 8601 válida, THEN THE EphemerisService SHALL rechazar la promesa de `findEvents` con un error que indique el parámetro inválido, sin devolver eventos parciales.
11. THE Contracts SHALL documentar en comentarios de `EphemerisBinaryHeader` que el encabezado se guarda en `data/ephemeris/ephemeris.json` (formato JSON), que el binario es `data/ephemeris/ephemeris.bin` sin encabezado interno y que su tamaño en bytes es `count * 48`.

### Requirement 2: Métricas de sitio y marco angular

**User Story:** Como desarrollador de sky y compare, quiero un tipo de métricas de sitio con unidades explícitas, para que ambos módulos calculen y comparen los mismos valores.

#### Acceptance Criteria

1. THE Contracts SHALL exportar la interfaz `SiteMetrics` con exactamente los campos `maxSunElevationDeg`, `sunlitFraction`, `longestLightHours`, `longestDarkHours`, `earthVisibleFraction`, `longestCommsWindowHours`, `longestCommsGapHours` y `demResolutionM`, cada uno de tipo `number`.
2. THE Contracts SHALL documentar en el comentario de cada campo de `SiteMetrics` su unidad y su rango válido: `maxSunElevationDeg` en grados (-90 a 90), `sunlitFraction` y `earthVisibleFraction` como fracción adimensional (0 a 1 inclusive), `longestLightHours`, `longestDarkHours`, `longestCommsWindowHours` y `longestCommsGapHours` en horas (≥ 0) y `demResolutionM` en metros (> 0).
3. THE Contracts SHALL documentar en el comentario de cada tipo que contenga un campo de azimut o de elevación el Marco_Horizontal, indicando el origen del azimut, el sentido de giro del azimut, el rango del azimut (0 a 360 grados, 360 excluido) y el rango de la elevación (-90 a 90 grados).
4. THE Contracts SHALL documentar en el comentario de cada tipo que contenga distancias que estas se expresan en kilómetros (km).
5. THE Contracts SHALL documentar en el comentario de cada tipo que contenga fechas que estas se expresan como cadenas UTC en formato ISO 8601 con sufijo `Z`.
6. IF un campo numérico de un tipo exportado por Contracts no tiene documentada su unidad en un comentario, THEN THE Contracts SHALL ser considerado no conforme y la verificación de tipos o la revisión de contratos SHALL reportar el nombre del campo sin unidad.

### Requirement 3: Contratos de escena, idioma, paneles y tiempo

**User Story:** Como desarrollador de scene3d, ui, i18n y del shell, quiero interfaces de integración definidas, para que cada módulo se conecte a los demás sin conocer su implementación.

#### Acceptance Criteria

1. THE Contracts SHALL exportar el tipo `SceneMode` como una unión de exactamente cinco literales de cadena: `'intro'`, `'landing'`, `'free'`, `'map'` y `'site'`, y ningún otro valor.
2. THE Contracts SHALL exportar la interfaz `SceneApi` con exactamente los métodos `setMode(mode: SceneMode)`, `focusMoonOn(lat, lon, ms?)`, `focusEarthOn(lat, lon, ms?)`, `setSiteMarkers(sites: LunarSite[])`, `onSiteSelected(cb)`, `getSiteScreenAnchor(id)`, `setSimulationTime(utc)` y `setSunDirectionProvider(fn)`.
3. THE Contracts SHALL declarar en `SceneApi.getSiteScreenAnchor(id)` un valor de retorno con las coordenadas de pantalla en píxeles del sitio, o `null` si el `id` no corresponde a ningún marcador registrado o el sitio no es visible.
4. THE Contracts SHALL exportar la interfaz `I18nApi` con los métodos `setLanguage(lang)`, `t(key)` y `onChange(cb)`.
5. THE Contracts SHALL documentar en comentarios que `I18nApi.t(key)` devuelve un texto de reemplazo definido (la propia `key`) cuando la clave no existe en el idioma activo.
6. THE Contracts SHALL exportar el tipo `PanelContext` definido como `{ site: LunarSite; utc: string }` y la interfaz `PanelTab` con las propiedades `id: string`, `titleKey: string` y `mount(container, ctx: PanelContext)`, donde `mount` devuelve una función de desmontaje sin argumentos.
7. THE Contracts SHALL exportar la función `registerPanelTab(tab: PanelTab)` y el accesor de solo lectura `getPanelTabs(): readonly PanelTab[]`, que devuelve las pestañas registradas en orden de registro y no permite modificar el registro.
8. IF `registerPanelTab` recibe un `PanelTab` cuyo `id` ya está registrado, THEN THE Contracts SHALL documentar que el registro existente se conserva sin cambios y que la llamada lanza un error indicando el `id` duplicado.
9. THE Contracts SHALL exportar la interfaz `TimeController` con los métodos `getUtc()`, `setUtc(utc)`, `onChange(cb)`, `play(speed)` y `pause()`.
10. THE Contracts SHALL documentar en comentarios las unidades de `lat` y `lon` en grados decimales (`lat` de -90 a 90, `lon` en Longitud_Canonica), de `PanelContext.utc` como cadena UTC ISO 8601 con sufijo `Z`, de `ms` en milisegundos (entero ≥ 0, con valor por defecto documentado cuando se omite) y de `utc` como cadena UTC ISO 8601 con sufijo `Z`.
11. THE Contracts SHALL documentar en comentarios que `play(speed)` expresa `speed` como multiplicador numérico del tiempo real, donde `1` equivale a tiempo real.
12. THE Contracts SHALL documentar en comentarios que `SceneApi.onSiteSelected`, `I18nApi.onChange` y `TimeController.onChange` devuelven una función de cancelación sin argumentos que, al invocarse, detiene las notificaciones al callback registrado.

### Requirement 4: Contratos de energía, vista solar y reporte

**User Story:** Como desarrollador de energy, solar-view y export, quiero entradas, resultados y datos de reporte tipados, para que el cálculo, la vista 3D y el PDF compartan la misma estructura.

#### Acceptance Criteria

1. THE Contracts SHALL exportar en `packages/contracts/src/index.ts` el tipo `EnergyInput` con exactamente los campos `sky: SkyState`, `params: Record<string, number>` y `stepSeconds: number`, y SHALL documentar en comentarios que `stepSeconds` está en segundos (> 0) y que la unidad de cada clave de `params` la declara el `EnergyMethod` correspondiente (por ejemplo W, W/m², m², grados).
2. THE Contracts SHALL conservar `EnergyMethod` y `EnergyResult` existentes sin cambios incompatibles, es decir, sin eliminar, renombrar ni cambiar el tipo de ningún campo existente, y SHALL declarar como opcional cualquier campo agregado.
3. THE Contracts SHALL exportar la interfaz `SolarPanelViewApi` con los métodos `mount(container)`, `update(result, sun)` y `dispose()`.
4. THE Contracts SHALL exportar la interfaz `ReportData` con los campos `title`, `scenarios`, `params`, `sections` y `sources`, y SHALL exportar los tipos de sus elementos: `scenarios: ReportScenario[]` con `{ id: string; label: string }`, `params: ReportParam[]` con `{ name: string; value: number; unit: string }` (`unit` en texto, por ejemplo "W", vacío si es adimensional) y `sources: string[]` (una cita por elemento); y SHALL documentar en comentarios el límite máximo de longitud de `title` (200 caracteres) y el número máximo de elementos de `sections` (50).
5. THE Contracts SHALL tipar cada elemento de `ReportData.sections` con `title` obligatorio y los campos opcionales `svg`, `pngDataUrl` y `table`, donde `table` es del tipo exportado `ReportTable` definido como `{ headers: string[]; rows: Array<Array<string | number>> }`, y SHALL documentar en comentarios que cada fila tiene la misma longitud que `headers`.
6. THE Contracts SHALL documentar en comentarios que `svg` y `pngDataUrl` de `ReportData` son contenido no confiable que el módulo export debe sanear antes de renderizarlo.
7. WHEN `SolarPanelViewApi.dispose()` se invoca después de `mount(container)`, THE Contracts SHALL documentar en comentarios que la vista libera sus recursos y retira su contenido de `container`, y que invocar `update(result, sun)` después de `dispose()` no produce efecto ni lanza error.
8. IF un campo opcional de `ReportData.sections` está ausente, THEN THE Contracts SHALL documentar en comentarios que el módulo export omite ese contenido en el reporte y no lo trata como error.

### Requirement 5: Esquema zod del manifest

**User Story:** Como desarrollador de scene3d y del shell, quiero un esquema validable del manifest de assets, para que solo se carguen GLB declarados y con crédito.

#### Acceptance Criteria

1. THE Contracts SHALL exportar un esquema zod del Manifest y el tipo TypeScript inferido de ese esquema.
2. THE Contracts SHALL exigir en el esquema que cada asset declare un identificador (cadena de 1 a 64 caracteres, único dentro del Manifest), una ruta relativa (cadena de 1 a 260 caracteres), un tipo (determinado por la sección del Manifest que lo contiene, según el criterio 10) y un crédito (cadena de 1 a 500 caracteres, sin contar espacios iniciales y finales).
3. THE Contracts SHALL restringir en el esquema las rutas de assets de tipo modelo 3D a archivos cuya extensión sea `.glb` en minúsculas.
4. WHEN un Manifest válido es parseado con el esquema, THE Contracts SHALL devolver un resultado exitoso con un objeto estructuralmente igual al original, sin añadir, eliminar ni modificar campos.
5. FOR ALL Manifest válidos, serializar a JSON y parsear con el esquema SHALL producir un objeto estructuralmente igual al Manifest original (propiedad de ida y vuelta).
6. IF una ruta del Manifest contiene un segmento `..`, empieza por `/` o `\`, contiene una letra de unidad (por ejemplo `C:`), o contiene un esquema de protocolo (por ejemplo `http://`, `file://`, `data:`), THEN THE Contracts SHALL rechazar el Manifest con un error de validación que indique la ruta ofensiva y el motivo del rechazo, sin devolver un Manifest parcial.
7. IF un asset del Manifest carece de crédito, tiene el crédito vacío o compuesto solo de espacios, THEN THE Contracts SHALL rechazar el Manifest con un error de validación que indique el identificador del asset y el campo `credit` (o su equivalente en el esquema), sin devolver un Manifest parcial.
8. IF un asset de tipo modelo 3D tiene una ruta cuya extensión no es `.glb`, THEN THE Contracts SHALL rechazar el Manifest con un error de validación que indique la ruta y el motivo del rechazo.
9. THE Contracts SHALL tener un `public/assets/manifest.json` inicial que sea parseado con éxito por el esquema, con cero assets o con todos sus assets cumpliendo los criterios 2, 3, 6 y 7.
10. THE Contracts SHALL determinar el tipo de un asset por la sección del Manifest que lo contiene (`models`, `textures` o `audio`), sin un campo `type` por asset.
11. THE Contracts SHALL exigir que las rutas de assets sean relativas a `public/assets/`, sin `/` inicial y sin el prefijo `assets/` (por ejemplo `models/apollo-lm.glb`), y IF una ruta empieza por `assets/`, THEN THE Contracts SHALL rechazar el Manifest con un error de validación que indique la ruta y el motivo.
12. THE Contracts SHALL definir el esquema zod de modo que acepte los campos presentes en el `public/assets/manifest.json` real: `version`; en `models`, `id`, `path`, `unitsToMeters`, `upAxis`, `nodes`, `polygons`, `license` y `credit`; en `textures`, `id`, `path` y `credit`; de modo que el esquema y el archivo tengan la misma forma.
13. THE Contracts SHALL registrar la migración del Manifest con estos únicos cambios de archivo: los cuatro valores `path` pierden el prefijo `/assets/` y pasan a `models/apollo-lm.glb`, `textures/moon-color.webp`, `textures/moon-height.webp` y `textures/earth-color.webp`; y `tools/validate-assets.ps1` se actualiza para resolver las rutas contra `public\assets`.
14. WHEN se ejecuta la suite de pruebas de Contracts, THE Contracts SHALL ejecutar una prueba que parsee el `public/assets/manifest.json` real con el esquema y falle si el resultado no es exitoso.

### Requirement 6: Validación de coordenadas, fecha e identificadores

**User Story:** Como desarrollador de cualquier módulo, quiero funciones de validación con `Result<T>`, para que ninguna entrada de usuario llegue al cálculo sin verificar.

#### Acceptance Criteria

1. THE Security SHALL implementar sus validadores con zod y devolver `Result<T>` en todas las funciones públicas, sin lanzar excepciones por entrada inválida, incluidas entradas de tipo `null`, `undefined`, objeto, arreglo, booleano y cadena donde se espera un número.
2. WHEN se recibe una latitud numérica finita entre -90 y 90 grados inclusive, THE Security SHALL devolver `ok: true` con ese valor sin modificarlo.
3. IF la latitud no es un número finito (incluidos `NaN`, `Infinity`, `-Infinity` y valores que no son de tipo número) o está fuera de -90 a 90 grados, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique latitud inválida y no SHALL lanzar excepción.
4. WHEN se recibe una longitud numérica finita entre -180 y 360 grados inclusive (formatos -180..180 y 0..360), THE Security SHALL devolver `ok: true` con la Longitud_Canonica, es decir un valor en el intervalo (-180, 180] y nunca en 0..360, según esta regla: los valores mayores que -180 y menores o iguales que 180 se devuelven sin modificar, -180 produce 180, y los valores mayores que 180 hasta 360 inclusive producen el valor menos 360 (por ejemplo, 180 produce 180, 181 produce -179, 270 produce -90, 360 produce 0 y -180 produce 180).
5. IF la longitud no es un número finito (incluidos `NaN`, `Infinity`, `-Infinity` y valores que no son de tipo número), o es menor que -180 o mayor que 360 grados, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique longitud inválida y no SHALL lanzar excepción.
6. WHEN se recibe una cadena UTC ISO 8601 con zona `Z` y una fecha de calendario existente (año 0001 a 9999, mes 01 a 12, día válido para ese mes y año, hora 00 a 23, minuto 00 a 59, segundo 00 a 59), THE Security SHALL devolver `ok: true` con la fecha normalizada en formato UTC ISO 8601 con zona `Z`.
7. IF la fecha no es una cadena UTC ISO 8601 con zona `Z`, o no es una fecha de calendario existente (por ejemplo, 30 de febrero, o 29 de febrero en año no bisiesto), o la cadena excede 64 caracteres, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique fecha inválida y no SHALL lanzar excepción.
8. WHEN se recibe un identificador de sitio de hasta 64 caracteres que coincide exactamente (sensible a mayúsculas) con una entrada de Site_Id_Allowlist, THE Security SHALL devolver `ok: true` con ese identificador.
9. IF el identificador de sitio no es una cadena, excede 64 caracteres o no coincide exactamente con ninguna entrada de Site_Id_Allowlist, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique identificador no permitido, sin incluir el valor recibido sin escapar en el mensaje.
10. FOR ALL longitudes válidas entre -180 y 360, el resultado SHALL estar en (-180, 180] y validar el resultado SHALL producir el mismo valor (idempotencia).
11. FOR ALL longitudes válidas entre -180 y 360, el valor devuelto SHALL ser equivalente módulo 360 grados a la longitud original, con una diferencia absoluta respecto a un múltiplo entero de 360 menor o igual a 1e-9 grados.
12. THE Contracts SHALL exportar la constante `APOLLO_SITE_IDS`, una tupla de solo lectura `['apollo-11','apollo-12','apollo-14','apollo-15','apollo-16','apollo-17']` (solo identificadores, sin coordenadas), y THE Security SHALL construir Site_Id_Allowlist a partir de `APOLLO_SITE_IDS`, de modo que el módulo `sites` use los mismos identificadores.

### Requirement 7: Nombres personalizados

**User Story:** Como usuario, quiero poner nombre a mis sitios personalizados, para identificarlos sin que un nombre malicioso comprometa la aplicación.

#### Acceptance Criteria

1. WHEN se recibe un nombre personalizado como cadena y, tras sanear, tiene entre 1 y 64 caracteres, THE Security SHALL devolver `ok: true` con el nombre sanitizado.
2. WHEN se recibe un nombre personalizado, THE Security SHALL eliminar del nombre los caracteres de control Unicode (categoría Cc, incluidos U+0000–U+001F y U+007F–U+009F), las marcas HTML (cualquier secuencia que empiece por `<` y termine en `>`, junto con los caracteres `<` y `>` sueltos) y los caracteres de formato bidireccional de Unicode (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069, U+061C).
3. WHEN se recibe un nombre personalizado, THE Security SHALL normalizar el nombre a Unicode NFC y eliminar los espacios en blanco iniciales y finales, aplicando la normalización y el recorte después de la eliminación de caracteres del criterio 2.
4. IF el nombre queda con 0 caracteres tras sanear, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que el nombre está vacío, sin devolver ningún nombre sanitizado.
5. IF el nombre saneado supera 64 caracteres (contados como puntos de código Unicode tras la normalización NFC), THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que se excede la longitud máxima de 64 caracteres, sin truncar el nombre.
6. IF la entrada no es una cadena (por ejemplo `null`, `undefined`, número u objeto), THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que el tipo de entrada no es válido.
7. FOR ALL cadenas de entrada aceptadas, sanear el resultado ya saneado SHALL producir `ok: true` con el mismo resultado (idempotencia).
8. FOR ALL cadenas de entrada aceptadas, el resultado SHALL NOT contener los caracteres `<` ni `>`, caracteres de control Unicode (categoría Cc), caracteres de formato bidireccional del criterio 2, ni espacios en blanco iniciales o finales.

### Requirement 8: Carga segura de paquetes de clase

**User Story:** Como educador, quiero cargar un paquete de clase desde un archivo, para usarlo en el aula sin riesgo de que un archivo hostil dañe la aplicación.

#### Acceptance Criteria

1. THE Security SHALL definir un esquema zod estricto para Class_Package que rechace cualquier propiedad no declarada en el esquema, en cualquier nivel de anidación.
2. THE Security SHALL exportar una constante documentada que defina el tamaño máximo de entrada de Class_Package en bytes (valor sugerido: 1 048 576 bytes, es decir 1 MiB).
3. IF el tamaño del Class_Package en bytes es mayor que el máximo definido, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que se superó el tamaño máximo, sin parsear el contenido.
4. IF el contenido no es JSON válido, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que el JSON es inválido, sin lanzar excepciones al llamador.
5. IF el contenido es JSON válido pero no cumple el esquema, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique la ruta del primer campo inválido, sin lanzar excepciones al llamador.
6. IF el JSON contiene en cualquier nivel de anidación, ya sea en objetos o dentro de arreglos, las claves `__proto__`, `constructor` o `prototype`, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que hay una clave prohibida.
7. WHEN un Class_Package es válido, THE Security SHALL devolver `ok: true` y un objeto cuyos campos de texto hayan pasado por la sanitización del Requirement 7 o por una validación equivalente documentada.
8. IF un Class_Package referencia un identificador de sitio que no pertenece a Site_Id_Allowlist, THEN THE Security SHALL devolver `ok: false` con un mensaje de error que indique que el identificador de sitio no está permitido.
9. WHEN un Class_Package es parseado, sea el resultado válido o rechazado, THE Security SHALL dejar `Object.prototype` sin propiedades nuevas ni modificadas.

### Requirement 9: Pruebas con entradas hostiles

**User Story:** Como responsable de seguridad, quiero pruebas con entradas hostiles, para detectar regresiones en la validación.

#### Acceptance Criteria

1. THE Security SHALL incluir al menos un archivo de pruebas vitest por cada validador definido en los Requirements 6, 7 y 8, con al menos un caso de entrada válida y un caso de entrada rechazada por validador.
2. THE Security SHALL incluir, para cada validador numérico, pruebas con las entradas `NaN`, `Infinity`, `-Infinity`, `-0`, cadenas numéricas (por ejemplo `"42"`, `"1e3"`, `""`, `" "`), `null`, `undefined`, objetos (`{}`, `[]`, `{valueOf: () => 1}`) y, para la longitud, los valores límite -180, 180, 360, -180.000001 y 360.000001, y verificar que cada una produce el resultado de rechazo o normalización definido en el validador correspondiente.
3. THE Security SHALL incluir, para cada validador de cadenas, pruebas con las entradas `<script>`, `javascript:`, `' OR 1=1`, `../../`, una cadena con bytes nulos (`\u0000`), una cadena con caracteres bidireccionales (`\u202E`, `\u2066`) y una cadena de 1 048 576 caracteres, y verificar que cada una es rechazada o sanitizada según el validador correspondiente.
4. WHEN una prueba de cadena de 1 048 576 caracteres se ejecuta, THE Security SHALL completar la validación en un máximo de 1000 ms sin lanzar una excepción no controlada.
5. THE Security SHALL incluir, para cada validador de objetos, pruebas de contaminación de prototipo con las claves `__proto__`, `constructor.prototype` y variantes anidadas hasta una profundidad de 5 niveles, y verificar que `Object.prototype` no contiene propiedades nuevas después de cada prueba. Estas pruebas son un entregable de `packages/security` y compensan la excepción de ESLint del Requirement 12.5.
6. THE Security SHALL incluir pruebas basadas en propiedades con al menos 100 casos generados por propiedad para la validación de longitud (idempotencia y equivalencia módulo 360 sobre el intervalo -180 a 360, resultado siempre en (-180, 180]) y para la sanitización de nombres.
7. IF una prueba basada en propiedades falla, THEN THE Security SHALL reportar el contraejemplo mínimo y la semilla utilizada para reproducir el fallo.
8. WHEN se ejecuta `pnpm test` en `packages/security`, THE Security SHALL terminar con código de salida 0, con cero pruebas fallidas y cero pruebas omitidas.

### Requirement 10: Shell con stubs que cumplen los contratos

**User Story:** Como desarrollador de un módulo, quiero un shell que ya monta stubs de todos los contratos, para probar mi módulo en integración sin esperar a los demás.

#### Acceptance Criteria

1. THE Shell SHALL incluir exactamente un stub tipado por cada una de las 7 interfaces de Contracts (`EphemerisService`, `TerrainService`, `SceneApi`, `I18nApi`, `TimeController`, `SolarPanelViewApi` y `EnergyMethod`), y cada stub SHALL implementar todos los miembros de su interfaz.
2. WHERE el Shell se compila en modo `demo`, THE Shell SHALL incluir en cada valor devuelto por un stub un indicador de datos de prueba con valor verdadero, y SHALL mostrar en la interfaz visible una etiqueta con el texto "Datos de prueba, no científicos" mientras cualquier stub esté registrado (ver criterios 15 a 20).
3. WHEN se ejecuta la verificación de tipos con TypeScript en modo `strict`, THE Shell SHALL terminar con 0 errores de tipos, y un stub que omita un miembro o use un tipo incompatible con su contrato SHALL producir al menos 1 error de compilación.
4. WHEN un Modulo reemplaza su stub por la implementación real, THE Shell SHALL requerir cambios en exactamente 1 archivo, el del punto de registro de ese módulo, y 0 cambios en el código de los demás módulos.
5. THE Shell SHALL cargar cada módulo mediante importación dinámica, y el paquete inicial generado por `pnpm build` SHALL contener 0 bytes del código de los módulos que aún no se han abierto.
6. WHEN el usuario abre una pestaña registrada con `registerPanelTab`, THE Shell SHALL invocar `mount` de esa pestaña exactamente 1 vez.
7. WHEN el usuario cierra una pestaña montada, THE Shell SHALL invocar exactamente 1 vez la función de desmontaje devuelta por `mount`.
8. IF la carga o el montaje de un módulo falla, THEN THE Shell SHALL mostrar en el área de esa pestaña una pantalla de error con el nombre del módulo afectado, un mensaje que indique que la carga falló y un botón de reintento.
9. WHEN el usuario activa el botón de reintento, THE Shell SHALL volver a intentar la carga y el montaje del módulo afectado, y SHALL reemplazar la pantalla de error por el módulo si el intento tiene éxito, o mantenerla si falla.
10. IF la carga de un módulo falla, THEN THE Shell SHALL mantener montados y operativos los demás módulos ya cargados, sin desmontarlos ni perder su estado.
11. THE Shell SHALL asignar el texto de la pantalla de error mediante `textContent` y SHALL usar `innerHTML` en 0 ocasiones para ese texto.
12. THE Shell SHALL mostrar en todo momento el texto "Inspirado en NASA Space Apps - No avalado por la NASA" y SHALL incluir 0 archivos o referencias del logo oficial de la NASA.
13. WHILE el Shell está en ejecución en runtime, THE Shell SHALL realizar 0 solicitudes de red.
14. WHEN se ejecuta `pnpm build` en `apps/web`, THE Shell SHALL terminar con código de salida 0 y 0 errores.
15. THE Shell SHALL definir dos modos de Vite: `production`, sin stubs, y `demo`, con stubs incluidos.
16. WHILE el Shell se ejecuta en modo `production`, THE Shell SHALL mostrar, para cada módulo sin implementación real, la pantalla de error legible del criterio 8 con el texto "módulo no disponible", y SHALL devolver 0 datos falsos.
17. WHEN se ejecuta una compilación `production`, THE Shell SHALL ejecutar una verificación de build que falle con código de salida distinto de 0 si el directorio `dist` contiene la cadena marcadora `__LUNAR_STUB__` o el nombre de algún módulo stub, e indique el archivo afectado.
18. THE Shell SHALL cargar los stubs únicamente mediante una importación dinámica condicionada por una constante de tiempo de compilación, de modo que el empaquetado en modo `production` los elimine por tree-shaking.
19. WHERE el Shell se compila en modo `demo`, THE Shell SHALL anteponer el prefijo visible `[PRUEBA]` a las salidas de texto de los stubs de primitivas (por ejemplo `t()` y los nombres de sitio).
20. WHILE exista al menos un stub registrado, THE Shell SHALL mostrar el banner "Datos de prueba, no científicos" de forma permanente, sin control para cerrarlo ni eliminarlo, y SHALL asignar su texto mediante `textContent`.

### Requirement 11: Política de seguridad de contenido

**User Story:** Como responsable de seguridad, quiero una CSP estricta, para limitar el impacto de una inyección de script o de una conexión no autorizada.

#### Acceptance Criteria

1. THE Shell SHALL declarar una CSP con `default-src 'none'` y con una directiva explícita, no vacía, para cada una de las siguientes: `script-src`, `style-src`, `img-src`, `font-src`, `connect-src`, `worker-src`, `object-src`, `base-uri`, `form-action` y `frame-ancestors`.
2. THE Shell SHALL declarar `script-src` sin `'unsafe-eval'`, sin `'unsafe-inline'`, sin comodín `*` y sin orígenes con esquema `http:`.
3. THE Shell SHALL declarar `connect-src 'self'` como único valor de la directiva.
4. THE Shell SHALL declarar `object-src 'none'` y `base-uri 'none'`.
5. WHERE una directiva de la CSP incluye un origen distinto de `'self'` y `'none'`, THE Shell SHALL documentar en `docs/SEGURIDAD.md` una entrada por cada par directiva-origen, con el motivo de su necesidad.
6. WHEN se ejecuta la compilación de producción, THE Shell SHALL emitir un `index.html` cuya CSP sea idéntica, directiva por directiva y valor por valor, a la política declarada.
7. WHEN se ejecuta la suite de pruebas automatizadas, THE Shell SHALL ejecutar una prueba que analice la CSP del `index.html` de producción y falle si la CSP contiene `'unsafe-eval'`, `'unsafe-inline'` en `script-src`, un comodín `*` en cualquier directiva o un origen con esquema `http:` en cualquier directiva.
8. IF la prueba de CSP detecta una violación, THEN THE Shell SHALL terminar la suite con código de salida distinto de cero y SHALL indicar la directiva y el valor que incumplen la política.
9. IF el `index.html` de producción no contiene una CSP o no incluye alguna de las directivas listadas en el criterio 1, THEN THE Shell SHALL hacer fallar la compilación de producción o la prueba de CSP con un error que indique la directiva ausente.

### Requirement 12: Cadena de suministro y análisis estático

**User Story:** Como responsable de seguridad, quiero dependencias fijadas y análisis automático, para reducir el riesgo de vulnerabilidades y de ataques a la cadena de suministro.

#### Acceptance Criteria

1. WHEN se ejecuta un flujo de CI sobre un pull request o sobre la rama principal, THE CI SHALL ejecutar `pnpm install --frozen-lockfile` y terminar el flujo con estado fallido si `pnpm-lock.yaml` no coincide con los `package.json`.
2. THE Repositorio SHALL incluir un archivo `.npmrc` en la raíz con `save-exact=true`, SHALL fijar a versiones exactas `typescript` y `vitest` del `package.json` raíz, que hoy usan prefijo `^` (`^7.0.2` y `^5.1.0`, es decir `7.0.2` y `5.1.0`), y SHALL declarar en todos los `package.json` (raíz, `apps/*` y `packages/*`), para `dependencies`, `devDependencies`, `peerDependencies` y `optionalDependencies`, únicamente versiones exactas con formato `MAJOR.MINOR.PATCH` (con sufijo de prerelease opcional), sin prefijos `^`, `~`, `>`, `<`, `*`, `x`, `latest` ni rangos con `||` o guiones, con excepción de las dependencias con protocolo `workspace:*`.
3. WHEN se ejecuta el script de verificación de versiones del paquete Contracts, THE Contracts SHALL recorrer todos los `package.json` del repositorio, ignorar las dependencias cuya versión usa el protocolo `workspace:*`, listar cada otra dependencia con versión no exacta (archivo, nombre y versión declarada) y terminar con código de salida distinto de 0 si encuentra al menos una.
4. WHEN se ejecuta un flujo de CI sobre un pull request o sobre la rama principal, THE CI SHALL ejecutar `pnpm audit` y terminar el flujo con estado fallido si encuentra al menos una vulnerabilidad de severidad alta o crítica.
5. WHEN se ejecuta ESLint en CI, THE CI SHALL aplicar las reglas `no-eval`, `no-new-func`, `no-implied-eval`, `no-script-url` y las reglas recomendadas del plugin de seguridad elegido en el diseño (con la única excepción documentada de `security/detect-object-injection`), con nivel `error`, y terminar con estado fallido si hay al menos un error. La regla `security/detect-object-injection` SHALL estar desactivada (`off`) en todo el repositorio excepto en `packages/security` y `apps/web/src/security`, donde SHALL estar activada con nivel `error`. La excepción existe por los falsos positivos de la regla con `Float64Array` y `Record` en código numérico, y se compensa con las pruebas de contaminación de prototipo de `packages/security` (Requirements 8.9 y 9.5, entregable de ese paquete), con Semgrep (criterio 8) y con `noUncheckedIndexedAccess` de TypeScript.
6. IF el código contiene `innerHTML`, `outerHTML` o `insertAdjacentHTML` con un valor que no sea un literal de cadena constante, THEN THE CI SHALL terminar el flujo con estado fallido e indicar archivo y línea de cada incidencia.
7. WHERE CodeQL está disponible para el repositorio, WHEN se abre o actualiza un pull request, o se hace push a la rama principal, THE CI SHALL ejecutar un análisis CodeQL para JavaScript y TypeScript como paso opcional (con `continue-on-error` o condicionado a su disponibilidad), de modo que su indisponibilidad o su fallo de ejecución no cambie el estado del flujo.
8. WHEN se abre o actualiza un pull request, o se hace push a la rama principal, THE CI SHALL ejecutar un análisis Semgrep obligatorio y terminar con estado fallido si el análisis no se completa o reporta al menos un hallazgo de severidad error.
9. WHEN se abre o actualiza un pull request, THE CI SHALL ejecutar `pnpm lint`, `pnpm test` y `pnpm build`, y terminar con estado fallido si alguno de los tres termina con código de salida distinto de 0.
10. THE CI SHALL referenciar cada acción de GitHub de cada flujo mediante el SHA completo de 40 caracteres de un commit, y SHALL declarar en cada flujo un bloque `permissions` con `contents: read` como máximo, ampliando permisos solo por trabajo y solo cuando el trabajo lo requiera (por ejemplo, `security-events: write` para CodeQL).
11. IF un flujo o paso obligatorio de CI (excluido el paso opcional de CodeQL del criterio 7) termina con estado fallido, THEN THE CI SHALL impedir la integración del pull request mediante una comprobación de estado requerida en la rama principal hasta que todos los flujos terminen con estado exitoso.
12. IF una acción de GitHub se referencia con una etiqueta, una rama o un SHA de menos de 40 caracteres, THEN THE CI SHALL terminar el flujo con estado fallido e indicar el archivo y la acción afectada.

### Requirement 13: Integridad de los datos precargados

**User Story:** Como planificador de misión, quiero que los datos precargados lleven un hash verificable, para detectar manipulación o corrupción de archivos.

#### Acceptance Criteria

1. THE Shell SHALL incluir un archivo de hashes que contenga, para cada archivo de Preloaded_Data (incluidos `data/ephemeris/ephemeris.bin` y `data/ephemeris/ephemeris.json`), una entrada con la ruta relativa del archivo y su hash SHA-256 en 64 caracteres hexadecimales en minúscula.
2. THE Contracts SHALL incluir el hash SHA-256 de `data/ephemeris/ephemeris.bin`, en 64 caracteres hexadecimales en minúscula, en el campo `sha256` de `EphemerisBinaryHeader`, guardado en `data/ephemeris/ephemeris.json`.
3. WHEN el script de verificación se ejecuta, THE Shell SHALL calcular el SHA-256 de cada archivo de Preloaded_Data no marcado como PENDIENTE, compararlo con el valor del archivo de hashes, listar en su salida cada archivo marcado como PENDIENTE (ruta, estado PENDIENTE y fuente) y terminar con código de salida 0 solo si todos los archivos no PENDIENTES coinciden, sin que los archivos PENDIENTES afecten el código de salida.
4. IF el script de verificación detecta un archivo de Preloaded_Data no marcado como PENDIENTE con hash distinto, sin entrada en el archivo de hashes o ausente del disco, THEN THE CI SHALL fallar con código de salida distinto de 0 e indicar la ruta relativa de cada archivo afectado y el motivo (hash distinto, sin entrada o ausente).
5. WHEN el Shell carga un archivo de Preloaded_Data en runtime, THE Shell SHALL calcular su SHA-256 y compararlo con el valor esperado antes de entregar sus bytes a cualquier otro módulo.
6. IF la verificación de hash en runtime falla, THEN THE Shell SHALL descartar los bytes cargados sin usarlos ni conservarlos en caché, y mostrar la pantalla de error legible del Requirement 10 con el nombre del archivo y un mensaje que indique fallo de integridad.
7. IF el valor `count` de `data/ephemeris/ephemeris.json` difiere del tamaño de `data/ephemeris/ephemeris.bin` (sin encabezado interno) dividido entre 48 bytes, o esa división no da un entero, THEN THE Shell SHALL rechazar `ephemeris.bin`, no usar ninguno de sus registros y mostrar un error que indique el valor `count` declarado y el calculado.
8. WHERE aún no existen datos reales en `data/` para un archivo de Preloaded_Data, THE Shell SHALL marcarlo como PENDIENTE indicando su fuente, excluirlo del cálculo de coincidencia y del código de salida de la verificación de hashes, listarlo siempre en la salida del script (ruta, estado PENDIENTE y fuente) sin omitirlo en silencio, y no tratarlo como válido ni cargarlo en runtime.

### Requirement 14: Documento de seguridad

**User Story:** Como revisor, quiero un documento de amenazas y controles, para evaluar la postura de seguridad del proyecto.

#### Acceptance Criteria

1. THE Contracts SHALL incluir el archivo `docs/SEGURIDAD.md` redactado en español, en formato Markdown, con un encabezado de primer nivel y una sección independiente (encabezado de segundo nivel) para cada uno de los siguientes temas: análisis STRIDE, checklist ASVS_Adaptada, CSP, Class_Package y verificación de hashes.
2. THE `docs/SEGURIDAD.md` SHALL contener un análisis STRIDE que cubra las 6 categorías (Spoofing, Tampering, Repudiation, Information Disclosure, Denial of Service y Elevation of Privilege), con al menos 1 amenaza, 1 control y 1 ubicación en el código (ruta de archivo o paquete existente en el repositorio) para cada categoría.
3. THE `docs/SEGURIDAD.md` SHALL contener una checklist ASVS_Adaptada en la que cada control tenga un identificador único y exactamente 1 estado entre "cumplido", "pendiente" o "no aplicable".
4. THE `docs/SEGURIDAD.md` SHALL incluir, para cada control marcado como "no aplicable", una justificación de al menos 1 oración que indique el motivo concreto por el que el control no aplica al proyecto.
5. THE `docs/SEGURIDAD.md` SHALL incluir, para cada control marcado como "cumplido", al menos 1 enlace o referencia a una ruta existente en el repositorio que corresponda a una prueba automatizada o a un archivo de configuración que lo verifica.
6. THE `docs/SEGURIDAD.md` SHALL describir la CSP adoptada, enumerando cada directiva con su valor, el manejo de Class_Package y el procedimiento de verificación de hashes, incluyendo el algoritmo de hash utilizado y la acción tomada cuando un hash no coincide.
7. IF un enlace o ruta del repositorio referenciado en `docs/SEGURIDAD.md` no existe, THEN THE Contracts SHALL reportar la referencia inválida como fallo de verificación del documento, indicando el identificador del control afectado y la ruta inexistente.
8. IF un control de la checklist ASVS_Adaptada no tiene estado o tiene un estado distinto de "cumplido", "pendiente" o "no aplicable", THEN THE Contracts SHALL reportar el control como fallo de verificación del documento, indicando su identificador.

### Requirement 15: Documento de integración

**User Story:** Como desarrollador de un módulo, quiero saber en qué orden se unen los módulos y cuándo se considera cerrado el mío, para trabajar en paralelo sin bloquear a otros.

#### Acceptance Criteria

1. THE `docs/INTEGRACION.md` SHALL estar redactado íntegramente en español, con excepción de identificadores de código, nombres de archivos y nombres de paquetes.
2. THE `docs/INTEGRACION.md` SHALL definir el orden de unión de los 14 módulos como una lista numerada del 1 al 14, donde cada posición incluye el nombre del módulo y los módulos de los que depende directamente (o "ninguno").
3. THE `docs/INTEGRACION.md` SHALL definir para cada uno de los 14 módulos un criterio de cierre que contenga una lista de verificación con al menos estos cuatro elementos, cada uno con resultado binario cumple/no cumple: (a) API exportada en `src/index.ts` del paquete, (b) pruebas del paquete ejecutadas con 0 fallos, (c) existencia del archivo `docs/MODULO-<nombre>.md`, (d) stub del módulo en el Shell reemplazado por la implementación real.
4. THE `docs/INTEGRACION.md` SHALL incluir una sección de registro de decisiones sobre cambios al contrato, donde cada entrada contenga fecha en formato AAAA-MM-DD, motivo y lista de módulos afectados.
5. THE `docs/INTEGRACION.md` SHALL describir el procedimiento "Solicitud al contrato" como una secuencia numerada de pasos que indique: quién presenta la solicitud, la información mínima que debe contener (cambio propuesto, motivo, módulos afectados), quién la aprueba y dónde se registra el resultado en el registro de decisiones.
6. THE `docs/INTEGRACION.md` SHALL registrar una decisión por cada campo que la solicitud original deja sin definir y por cada decisión confirmada de la Introducción (`EnergyInput`, `ReportData.scenarios`, `ReportData.params`, `ReportData.table`, `ReportData.sources`, `setSiteMarkers`, `PanelTab.ctx`, intervalo de longitud, versiones exactas, datos PENDIENTE y CodeQL opcional), y cada decisión incluirá el nombre del campo o tema, el valor o criterio elegido y su justificación, mientras que la definición normativa de los tipos reside en `packages/contracts/src/index.ts`.
7. THE `docs/INTEGRACION.md` SHALL listar cada dato marcado como PENDIENTE junto con su fuente esperada, de modo que ningún dato PENDIENTE quede sin fuente asociada.
8. IF un módulo no cumple alguno de los cuatro elementos de su criterio de cierre, THEN THE `docs/INTEGRACION.md` SHALL establecer que el módulo no se considera cerrado y que los módulos que dependen de él no pueden integrarse hasta que se cumpla el criterio.

### Requirement 16: Cumplimiento de contratos y calidad de la base

**User Story:** Como integrador, quiero comprobaciones automáticas de la base, para detectar roturas entre módulos antes de la unión.

#### Acceptance Criteria

1. WHEN se ejecuta `tsc --noEmit` con `strict: true` sobre el paquete Contracts, THE Contracts SHALL terminar con código de salida 0 y 0 errores de compilación.
2. THE Contracts SHALL exportar desde `src/index.ts` el 100% de los tipos, interfaces y esquemas zod definidos en los Requirements 1 a 5, incluidos `EnergyInput`, `PanelContext`, `ReportScenario`, `ReportParam`, `ReportTable`, `ReportData` y `APOLLO_SITE_IDS`, de modo que importar cada nombre desde el paquete no produzca errores de compilación.
3. THE Contracts SHALL mantener `Result<T>` con la misma forma que tiene hoy en `packages/contracts/src/index.ts`, y una prueba de tipos SHALL fallar la compilación si se agrega, elimina o cambia el tipo de algún campo o variante de `Result<T>`.
4. THE Contracts SHALL contener solo tipos, interfaces, esquemas zod y constantes, y como único código de ejecución permitido las funciones `registerPanelTab` y `getPanelTabs` y su registro interno, sin otras funciones de lógica de negocio, sin clases y sin efectos secundarios en la carga del módulo salvo la creación del registro vacío.
5. THE Shell SHALL incluir al menos una prueba de tipos o de ejecución por cada stub de paquete que verifique que el stub satisface su contrato de Contracts, y cada prueba SHALL fallar si el stub omite un miembro requerido o devuelve un valor que no cumple el esquema.
6. WHEN se ejecuta `pnpm -r test` desde la raíz, THE CI SHALL terminar con código de salida 0, 0 pruebas fallidas y 0 pruebas omitidas.
7. WHEN se ejecuta `pnpm -r build` desde la raíz, THE CI SHALL terminar con código de salida 0 y 0 errores de compilación en todos los paquetes del workspace.
8. THE Contracts SHALL declarar zod con versión exacta (sin prefijos `^` ni `~`) como única dependencia de runtime agregada en su `package.json` (cubierto por `save-exact=true` del `.npmrc`), y `docs/INTEGRACION.md` SHALL documentar la versión y una justificación de al menos una oración.
9. IF `pnpm -r test` o `pnpm -r build` falla en algún paquete, THEN THE CI SHALL terminar con código de salida distinto de 0 e indicar el nombre del paquete que falló, sin reportar éxito.
