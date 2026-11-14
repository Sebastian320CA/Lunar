import type { HorizonProfile } from '@lunar/contracts';

export const SPHERICAL_DEM_RESOLUTION_M = 1737400;
export const MOON_RADIUS_M = 1737400;

/** Perfil esferico sin DEM: 0 grados a altura 0; depresion geometrica acos(R/(R+h)) para h > 0. */
export function sphericalHorizon(observerHeightM = 0): HorizonProfile {
  const h = Number.isFinite(observerHeightM) && observerHeightM > 0 ? observerHeightM : 0;
  const dipDeg = h === 0 ? 0 : -(Math.acos(MOON_RADIUS_M / (MOON_RADIUS_M + h)) * 180) / Math.PI;
  return {
    azimuthStepDeg: 1,
    elevationDeg: new Array<number>(360).fill(dipDeg),
    demResolutionM: SPHERICAL_DEM_RESOLUTION_M,
    demSource: 'PENDIENTE: sin DEM (horizonte esferico, radio 1737.4 km)',
  };
}
