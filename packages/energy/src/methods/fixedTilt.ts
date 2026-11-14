import { param } from '../defaults';
import { solarMethod } from './common';

/** Fixed tilted panels (params tiltDeg, panelAzimuthDeg; a good tilt is near |latitude|, facing the equator). */
export const fixedTilt = solarMethod('fixedTilt', 'Inclinacion fija', (_s, p) => ({
  tiltDeg: param(p, 'tiltDeg'),
  azimuthDeg: param(p, 'panelAzimuthDeg'),
}));
