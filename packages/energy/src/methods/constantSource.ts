import type { EnergyMethod } from '@lunar/contracts';
import { param } from '../defaults';

/** Non-solar reference source (e.g. RTG-like): constant power independent of the Sun. */
export const constantSource: EnergyMethod = {
  id: 'constantSource',
  label: 'Fuente constante (no solar)',
  compute(_sky, params) {
    const powerW = Math.max(0, param(params, 'constantPowerW'));
    return {
      methodId: 'constantSource',
      panelTiltDeg: 0,
      panelAzimuthDeg: 0,
      powerW,
      energyWh: powerW * param(params, 'stepH'),
    };
  },
};
