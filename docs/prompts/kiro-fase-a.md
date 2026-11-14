# Fase A (pegar en Kiro, modo Spec)

Spec "base": prepara la base de "Lunar Landing Site Navigator" para que 14 modulos, hechos en chats distintos, encajen sin pelear. Lee .kiro/steering y docs/CONTRATO.md.

1. packages/contracts/src/index.ts: conserva lo existente y agrega, con unidades y marcos documentados (azimut 0 = norte, sentido horario; elevacion sobre el horizonte local; UTC ISO 8601; distancias en km):
 - EphemerisBinaryHeader {version, frame, startUtc, stepSeconds, count, units:'km', fields:['sunX','sunY','sunZ','earthX','earthY','earthZ'], sha256}. Regla: ephemeris.bin es Float64 little-endian, count x 6 valores, tiempo implicito = startUtc + i*stepSeconds.
 - SkyEvent {type:'sunrise'|'sunset'|'earthrise'|'earthset', utc}
 - EphemerisService: getSky, getSeries y findEvents(site, startUtc, endUtc)
 - SiteMetrics {maxSunElevationDeg, sunlitFraction, longestLightHours, longestDarkHours, earthVisibleFraction, longestCommsWindowHours, longestCommsGapHours, demResolutionM}
 - SceneMode ('intro'|'landing'|'free'|'map'|'site'), SceneApi {setMode, focusMoonOn(lat,lon,ms?), focusEarthOn(lat,lon,ms?), setSiteMarkers(sites), onSiteSelected(cb), getSiteScreenAnchor(id), setSimulationTime(utc), setSunDirectionProvider(fn)}
 - I18nApi {setLanguage, t, onChange}
 - PanelTab {id, titleKey, mount(container, ctx) => unmount} y registerPanelTab(tab)
 - TimeController {getUtc, setUtc, onChange, play(speed), pause}
 - EnergyInput, EnergyMethod, EnergyResult, SolarPanelViewApi {mount(container), update(result, sun), dispose()}
 - ReportData {title, scenarios[], params, sections[{title, svg?, pngDataUrl?, table?}], sources[]}
 - Esquema zod de public/assets/manifest.json
2. packages/security (zod, todo devuelve Result<T>): latitud, longitud (normalizar 0..360), fecha UTC, id de sitio (lista blanca), nombres personalizados (sanitizados), y carga de paquetes de clase (esquema estricto, tamano maximo, sin prototype pollution). Pruebas con entradas hostiles.
3. apps/web: shell con stubs que cumplan cada contrato, carga perezosa y pantalla de error legible.
4. CSP estricta, dependencias con version exacta y lockfile, pnpm audit, ESLint con reglas de seguridad, CodeQL y Semgrep en GitHub Actions, hash SHA-256 de los datos precargados.
5. docs/SEGURIDAD.md (STRIDE y checklist ASVS adaptada) y docs/INTEGRACION.md (orden de union y criterio de cierre de cada modulo).

Muestrame requirements, design y tasks y espera mi OK antes de ejecutar tareas.