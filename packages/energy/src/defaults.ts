export interface ParamDefault {
  value: number;
  unit: string;
  source: string;
}

const EDITABLE = 'ejemplo editable, PENDIENTE fuente';

/** Default parameters shared by methods. Every entry documents unit and source. */
export const PARAM_DEFAULTS: Record<string, ParamDefault> = {
  areaM2: { value: 1, unit: 'm2', source: EDITABLE },
  efficiency: { value: 0.28, unit: 'fraccion 0..1', source: EDITABLE },
  sunMoonDistanceKm: {
    value: 149597870.7,
    unit: 'km',
    source: '1 AU, IAU 2012 Res. B2; el caller puede pasar la distancia real de la efemeride',
  },
  stepH: { value: 1, unit: 'h', source: 'Paso de integracion de energia; ajustar al paso de la serie' },
  tiltDeg: { value: 30, unit: 'grados', source: EDITABLE },
  panelAzimuthDeg: { value: 180, unit: 'grados (0 = norte, horario)', source: EDITABLE },
  mastHorizonElevDeg: {
    value: 0,
    unit: 'grados',
    source: 'Solicitud al contrato: lo entrega el caller desde el terreno a la altura del mastil',
  },
  constantPowerW: { value: 100, unit: 'W', source: EDITABLE },
};

export function param(params: Record<string, number>, key: string): number {
  const v = params[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return PARAM_DEFAULTS[key]?.value ?? 0;
}
