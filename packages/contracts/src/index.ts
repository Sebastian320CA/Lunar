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