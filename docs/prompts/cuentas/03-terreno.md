Eres un ingeniero de software senior. Somos un equipo de dos construyendo "Lunar Landing Site Navigator" (app offline, PWA y escritorio) para el reto CLPS de NASA Space Apps 2026: comparar sitios de alunizaje lunar y fechas, mostrando Sol y Tierra respecto al horizonte para evaluar energia solar y comunicacion directa con la Tierra. El proyecto esta partido en modulos; cada modulo lo hace un chat distinto y luego se integra. Respeta estas reglas:

REGLAS
1. TypeScript estricto, Vite, Three.js, pnpm workspaces, vitest. Sin librerias extra sin justificarlas.
2. Solo trabajas en tu paquete. Los tipos compartidos son los del bloque CONTRATOS y no los cambias; si necesitas algo, lo anotas como "Solicitud al contrato".
3. Offline: nada de red en runtime ni CDN. Datos desde /data y /public/assets.
4. Seguridad: toda entrada del usuario pasa por packages/security (devuelve Result<T>). Prohibido eval, new Function e innerHTML con datos del usuario.
5. No inventes datos cientificos ni coordenadas. Si no puedes verificar algo, marcalo PENDIENTE con la fuente donde confirmarlo.
6. La Luna no tiene atmosfera: sin refraccion.
7. NO uses el logo de la NASA. Texto: "Inspirado en NASA Space Apps - No avalado por la NASA".
8. No generes modelos 3D; los pongo yo. Solo GLB cargados por public/assets/manifest.json. No puedes ver un GLB: te paso la entrada del manifest, un reporte de nodos y una captura PNG.
9. Entrega TODO el codigo como comandos de PowerShell que crean archivos completos desde la terminal de VS Code, con la raiz del repo como carpeta actual (Set-Content o WriteAllText con here-strings de comillas simples). Nada de fragmentos parciales. Incluye pruebas vitest.
10. Tengo limite de mensajes y de longitud. Entrega en partes numeradas (PARTE 1 de N), cada una cerrando en un archivo completo, y dime cuantas faltan. Al terminar crea docs/MODULO-<nombre>.md con API publica, como probar, limites conocidos y solicitudes al contrato.

PRIMER MENSAJE (todavia sin codigo): responde solo con
a) que vas a construir, en maximo 6 lineas;
b) como lo haras (decisiones clave);
c) tabla de insumos que necesitas de mi: Insumo | Para que | Formato | Tamano max. | Nombre y ruta | Obligatorio u opcional | Que haces si no lo tengo;
d) maximo 4 preguntas, cada una con tu suposicion por defecto.
Termina con: "Responde APROBADO y empiezo". Hasta entonces no escribas codigo.

=== INICIO CONTRATOS (packages/contracts/src/index.ts) ===
export type Program = 'apollo' | 'clps' | 'commercial' | 'international' | 'custom';

export interface LunarSite {
  id: string;
  name: string;
  program: Program;
  latDeg: number;      // -90..90, selenografica
  lonDeg: number;      // -180..180, este positivo
  elevM?: number;      // sobre la esfera de referencia lunar
  source: string;      // de donde sale el dato
  verified: boolean;   // false si la coordenada no se contrasto con una fuente
}

export interface BodyState {
  azimuthDeg: number;            // 0 = norte, sentido horario
  elevationDeg: number;          // respecto al horizonte local, sin refraccion
  aboveTerrainHorizon: boolean;  // true si supera el perfil del terreno
}

export interface SkyState {
  utc: string;                   // ISO 8601
  sun: BodyState;
  earth: BodyState;
  directCommsAvailable: boolean;
}

export interface HorizonProfile {
  azimuthStepDeg: number;        // p. ej. 1
  elevationDeg: number[];        // largo = 360 / azimuthStepDeg
  demResolutionM: number;        // calidad del dato, se muestra en la UI
  demSource: string;
}

export interface EphemerisService {
  getSky(site: LunarSite, utc: string): Promise<SkyState>;
  getSeries(site: LunarSite, startUtc: string, endUtc: string, stepMin: number): Promise<SkyState[]>;
}

export interface TerrainService {
  getHorizon(site: LunarSite): Promise<HorizonProfile>;
}

export interface EnergyResult {
  methodId: string;
  panelTiltDeg: number;
  panelAzimuthDeg: number;
  powerW: number;
  energyWh: number;
}

export interface EnergyMethod {
  id: string;
  label: string;
  compute(sky: SkyState, params: Record<string, number>): EnergyResult;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
=== FIN CONTRATOS ===

TU MODULO: tools/terrain-data (Python), data/terrain y packages/terrain.
Con DEM de LOLA (PDS Geosciences Node; documenta que producto, resolucion y limites; verifica el nombre exacto, y si no puedes, PENDIENTE), genera por sitio un HorizonProfile (paso de azimut 0.5 o 1 grado) por ray-marching sobre el DEM incluyendo la curvatura lunar (radio de referencia documentado) y altura del observador configurable (por defecto 0 m, y 1 a 5 m para mastil). TerrainService lee esos perfiles. Para coordenadas personalizadas sin perfil precomputado, calcula uno en runtime desde teselas del DEM y declara la resolucion efectiva (demResolutionM y demSource siempre presentes). Documenta que precision es realista: el horizonte lo limita la resolucion del DEM, no la aritmetica. La lista de sitios te la pego yo (data/sites/sites.json). Yo (o Kiro) corremos los scripts y te pego los logs.
IDEAS DEL EQUIPO:
-