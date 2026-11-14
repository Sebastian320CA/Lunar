// Convenciones de este archivo (Requirement 2):
// - Marco_Horizontal: azimut 0 = norte, sentido horario, rango 0 a 360 grados (360 excluido);
//   elevacion sobre el horizonte local, sin refraccion, rango -90 a 90 grados.
// - Distancias en kilometros (km).
// - Fechas como cadenas UTC ISO 8601 con sufijo Z, por ejemplo 2025-01-01T00:00:00Z.
// - Longitud_Canonica: grados, este positivo, intervalo (-180, 180] (excluye -180, incluye 180).
// - Cada campo numerico documenta su unidad con "Unidad:".

/** Cadena UTC ISO 8601 con sufijo Z, por ejemplo 2025-01-01T00:00:00Z. */
export type UtcString = string;

/** Vector 3D adimensional (por ejemplo, una direccion unitaria en el marco de la escena). */
export interface Vec3 {
  /** Unidad: adimensional. */
  x: number;
  /** Unidad: adimensional. */
  y: number;
  /** Unidad: adimensional. */
  z: number;
}

export type Program = 'apollo' | 'clps' | 'commercial' | 'international' | 'custom';

/**
 * Ids de los sitios Apollo que alunizaron (solo ids, sin coordenadas).
 * Apollo 13 no figura porque no alunizo. El modulo `sites` usa estos ids y solo los
 * amplia mediante "Solicitud al contrato" (docs/INTEGRACION.md).
 */
export const APOLLO_SITE_IDS = [
  'apollo-11',
  'apollo-12',
  'apollo-14',
  'apollo-15',
  'apollo-16',
  'apollo-17',
] as const;
export type ApolloSiteId = (typeof APOLLO_SITE_IDS)[number];

/** Sitio de aterrizaje lunar. Coordenadas selenograficas en grados decimales. */
export interface LunarSite {
  id: string;
  name: string;
  program: Program;
  /** Unidad: grados, rango -90 a 90, selenografica. */
  latDeg: number;
  /** Unidad: grados, Longitud_Canonica en (-180, 180], este positivo. */
  lonDeg: number;
  /** Unidad: metros sobre la esfera de referencia lunar. */
  elevM?: number;
  source: string;      // de donde sale el dato
  verified: boolean;   // false si la coordenada no se contrasto con una fuente
}

/**
 * Posicion de un cuerpo en el cielo local, en Marco_Horizontal
 * (azimut 0 = norte, sentido horario, 0 a 360 grados con 360 excluido;
 * elevacion -90 a 90 grados sobre el horizonte local, sin refraccion).
 */
export interface BodyState {
  /** Unidad: grados, rango 0 a 360 (360 excluido), 0 = norte, sentido horario. */
  azimuthDeg: number;
  /** Unidad: grados, rango -90 a 90, respecto al horizonte local, sin refraccion. */
  elevationDeg: number;
  aboveTerrainHorizon: boolean;  // true si supera el perfil del terreno
}

/** Estado del cielo en un instante. `utc` es UTC ISO 8601 con sufijo Z. Angulos en Marco_Horizontal. */
export interface SkyState {
  utc: string;                   // ISO 8601 con sufijo Z
  sun: BodyState;
  earth: BodyState;
  directCommsAvailable: boolean;
}

/** Perfil de horizonte del terreno en Marco_Horizontal. */
export interface HorizonProfile {
  /** Unidad: grados (> 0), paso de azimut, p. ej. 1. */
  azimuthStepDeg: number;
  /** Unidad: grados, rango -90 a 90 por muestra; largo = 360 / azimuthStepDeg. */
  elevationDeg: number[];
  /** Unidad: metros (> 0), calidad del dato, se muestra en la UI. */
  demResolutionM: number;
  demSource: string;
}

/**
 * Encabezado del binario de efemerides.
 * - Se guarda en `data/ephemeris/ephemeris.json` (formato JSON).
 * - El binario es `data/ephemeris/ephemeris.bin`, sin encabezado interno; su tamano es `count * 48` bytes.
 * - Formato del binario: Float64 little-endian, `count` filas de 6 valores
 *   (`count * 6 * 8` bytes en total), en el orden de `fields`.
 * - El tiempo de la fila `i` es `startUtc + i * stepSeconds`, para `i` entre 0 y `count - 1`.
 * - Distancias en km. `startUtc` es UTC ISO 8601 con sufijo Z (por ejemplo 2025-01-01T00:00:00Z).
 * - `frame` es el marco de referencia de las posiciones (cadena no vacia).
 */
export interface EphemerisBinaryHeader {
  /** Unidad: adimensional, entero >= 1. */
  version: number;
  /** Marco de referencia de las posiciones; cadena no vacia. */
  frame: string;
  /** UTC ISO 8601 con sufijo Z. */
  startUtc: UtcString;
  /** Unidad: segundos, > 0. */
  stepSeconds: number;
  /** Unidad: filas, entero >= 1. */
  count: number;
  /** Las posiciones estan en kilometros. */
  units: 'km';
  /** Orden fijo de las 6 columnas de cada fila. */
  fields: readonly ['sunX', 'sunY', 'sunZ', 'earthX', 'earthY', 'earthZ'];
  /** SHA-256 de `ephemeris.bin`, 64 caracteres hexadecimales en minuscula. */
  sha256: string;
}

export type SkyEventType = 'sunrise' | 'sunset' | 'earthrise' | 'earthset';

/** Evento del cielo. `utc` es UTC ISO 8601 con sufijo Z. */
export interface SkyEvent {
  type: SkyEventType;
  utc: UtcString;
}

export interface EphemerisService {
  getSky(site: LunarSite, utc: string): Promise<SkyState>;
  getSeries(site: LunarSite, startUtc: string, endUtc: string, stepMin: number): Promise<SkyState[]>;
  /**
   * Busca eventos de salida y puesta del Sol y de la Tierra.
   * - El intervalo incluye `startUtc` y excluye `endUtc`.
   * - El arreglo devuelto esta ordenado por `utc` ascendente.
   * - Devuelve un arreglo vacio cuando no hay eventos en el intervalo.
   * - Rechaza la promesa con un error que nombra el parametro invalido (`startUtc` o `endUtc`)
   *   si `endUtc` es anterior a `startUtc` o alguna cadena no es UTC ISO 8601 valida,
   *   sin devolver eventos parciales.
   * `startUtc` y `endUtc` son UTC ISO 8601 con sufijo Z.
   */
  findEvents(site: LunarSite, startUtc: string, endUtc: string): Promise<SkyEvent[]>;
}

export interface TerrainService {
  getHorizon(site: LunarSite): Promise<HorizonProfile>;
}

/** Metricas de un sitio. Cada campo documenta unidad y rango valido. */
export interface SiteMetrics {
  /** Unidad: grados, rango -90 a 90. */
  maxSunElevationDeg: number;
  /** Unidad: fraccion adimensional, rango 0 a 1 inclusive. */
  sunlitFraction: number;
  /** Unidad: horas, >= 0. */
  longestLightHours: number;
  /** Unidad: horas, >= 0. */
  longestDarkHours: number;
  /** Unidad: fraccion adimensional, rango 0 a 1 inclusive. */
  earthVisibleFraction: number;
  /** Unidad: horas, >= 0. */
  longestCommsWindowHours: number;
  /** Unidad: horas, >= 0. */
  longestCommsGapHours: number;
  /** Unidad: metros, > 0. */
  demResolutionM: number;
}

/** Modos de la escena 3D: exactamente cinco valores. */
export type SceneMode = 'intro' | 'landing' | 'free' | 'map' | 'site';

/** Funcion de cancelacion sin argumentos: al invocarla se detienen las notificaciones al callback registrado. */
export type Unsubscribe = () => void;

/** Coordenadas de pantalla de un sitio. */
export interface ScreenAnchor {
  /** Unidad: pixeles de pantalla (eje horizontal). */
  xPx: number;
  /** Unidad: pixeles de pantalla (eje vertical). */
  yPx: number;
}

/**
 * API de la escena 3D.
 * - `lat` en grados decimales (-90 a 90); `lon` en Longitud_Canonica (grados, (-180, 180]).
 * - `ms` en milisegundos (entero >= 0); valor por defecto cuando se omite: 1000.
 * - `utc` es UTC ISO 8601 con sufijo Z.
 */
export interface SceneApi {
  setMode(mode: SceneMode): void;
  focusMoonOn(lat: number, lon: number, ms?: number): void;
  focusEarthOn(lat: number, lon: number, ms?: number): void;
  setSiteMarkers(sites: LunarSite[]): void;
  /** Devuelve una funcion de cancelacion sin argumentos que detiene las notificaciones al `cb`. */
  onSiteSelected(cb: (siteId: string) => void): Unsubscribe;
  /**
   * Coordenadas de pantalla en pixeles del sitio, o `null` si `id` no corresponde a
   * ningun marcador registrado o el sitio no es visible.
   */
  getSiteScreenAnchor(id: string): ScreenAnchor | null;
  setSimulationTime(utc: UtcString): void;
  /** `fn` devuelve la direccion unitaria (adimensional) del Sol en el marco de la escena para `utc`. */
  setSunDirectionProvider(fn: (utc: UtcString) => Vec3): void;
}

/** Codigo de idioma BCP 47, por ejemplo 'es' o 'en'. */
export type Language = string;

export interface I18nApi {
  setLanguage(lang: Language): void;
  /** Devuelve la propia `key` como texto de reemplazo cuando la clave no existe en el idioma activo. */
  t(key: string): string;
  /** Devuelve una funcion de cancelacion sin argumentos que detiene las notificaciones al `cb`. */
  onChange(cb: (lang: Language) => void): Unsubscribe;
}

/** Contexto que recibe una pestana. `utc` es UTC ISO 8601 con sufijo Z. */
export type PanelContext = { site: LunarSite; utc: string };

export interface PanelTab {
  id: string;
  /** Clave de i18n, no texto literal. */
  titleKey: string;
  /** Devuelve una funcion de desmontaje sin argumentos. */
  mount(container: HTMLElement, ctx: PanelContext): () => void;
}

/** Control del tiempo de simulacion. Todas las fechas son UTC ISO 8601 con sufijo Z. */
export interface TimeController {
  getUtc(): UtcString;
  setUtc(utc: UtcString): void;
  /** Devuelve una funcion de cancelacion sin argumentos que detiene las notificaciones al `cb`. */
  onChange(cb: (utc: UtcString) => void): Unsubscribe;
  /** `speed` es un multiplicador numerico del tiempo real; 1 equivale a tiempo real. */
  play(speed: number): void;
  pause(): void;
}

export interface EnergyResult {
  methodId: string;
  /** Unidad: grados, rango -90 a 90 (inclinacion del panel). */
  panelTiltDeg: number;
  /** Unidad: grados, rango 0 a 360 (360 excluido), 0 = norte, sentido horario. */
  panelAzimuthDeg: number;
  /** Unidad: vatios (W). */
  powerW: number;
  /** Unidad: vatios hora (Wh). */
  energyWh: number;
}

export interface EnergyMethod {
  id: string;
  label: string;
  compute(sky: SkyState, params: Record<string, number>): EnergyResult;
}

/** Entrada de calculo de energia. */
export interface EnergyInput {
  sky: SkyState;
  /** Unidad: la declara cada EnergyMethod por clave (por ejemplo W, W/m2, m2, grados). */
  params: Record<string, number>;
  /** Unidad: segundos, > 0. */
  stepSeconds: number;
}

/**
 * Vista 3D del panel solar.
 * `dispose()` despues de `mount(container)` libera recursos y retira el contenido de `container`;
 * invocar `update(result, sun)` despues de `dispose()` no produce efecto ni lanza error.
 */
export interface SolarPanelViewApi {
  mount(container: HTMLElement): void;
  update(result: EnergyResult, sun: BodyState): void;
  dispose(): void;
}

export interface ReportScenario {
  id: string;
  label: string;
}

export interface ReportParam {
  name: string;
  /** Unidad: la indicada en `unit`. */
  value: number;
  /** Unidad en texto, por ejemplo "W"; cadena vacia si es adimensional. */
  unit: string;
}

/** Tabla de reporte. Cada fila tiene la misma longitud que `headers`. */
export interface ReportTable {
  headers: string[];
  /** Unidad: la de cada columna según headers. */
  rows: Array<Array<string | number>>;
}

/**
 * Seccion de reporte. Si un campo opcional esta ausente, el modulo export omite ese
 * contenido en el reporte y no lo trata como error.
 */
export interface ReportSection {
  title: string;
  /** Contenido no confiable: el modulo export debe sanearlo antes de renderizarlo. */
  svg?: string;
  /** Contenido no confiable: el modulo export debe sanearlo antes de renderizarlo. */
  pngDataUrl?: string;
  table?: ReportTable;
}

/** Datos de un reporte. */
export interface ReportData {
  /** Maximo 200 caracteres. */
  title: string;
  scenarios: ReportScenario[];
  params: ReportParam[];
  /** Maximo 50 elementos. */
  sections: ReportSection[];
  /** Una cita por elemento. */
  sources: string[];
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export { ASSET_KINDS, ManifestSchema } from './manifest.js';
export type { Manifest } from './manifest.js';
export { registerPanelTab, getPanelTabs } from './panelRegistry.js';
