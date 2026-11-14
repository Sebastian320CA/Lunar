import type { EnergyMethod, EnergyResult, SkyState } from '@lunar/contracts';
import { param } from '../defaults';
import { incidenceCos, irradianceWm2 } from '../physics';

/** Panel orientation chosen by a method for a given sky. */
export interface Orientation {
  tiltDeg: number;
  azimuthDeg: number;
}

/** Builds a solar EnergyMethod: power = area x efficiency x irradiance x cos(incidence) x visibility. */
export function solarMethod(
  id: string,
  label: string,
  orient: (sky: SkyState, params: Record<string, number>) => Orientation,
  visible: (sky: SkyState, params: Record<string, number>) => boolean = (s) => s.sun.aboveTerrainHorizon,
): EnergyMethod {
  return {
    id,
    label,
    compute(sky, params): EnergyResult {
      const o = orient(sky, params);
      const cos = incidenceCos(sky.sun.azimuthDeg, sky.sun.elevationDeg, o.tiltDeg, o.azimuthDeg);
      const powerW =
        param(params, 'areaM2') *
        param(params, 'efficiency') *
        irradianceWm2(param(params, 'sunMoonDistanceKm')) *
        cos *
        (visible(sky, params) ? 1 : 0);
      return {
        methodId: id,
        panelTiltDeg: o.tiltDeg,
        panelAzimuthDeg: o.azimuthDeg,
        powerW,
        energyWh: powerW * param(params, 'stepH'),
      };
    },
  };
}
