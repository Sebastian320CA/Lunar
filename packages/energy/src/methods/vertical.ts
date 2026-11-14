import { param } from '../defaults';
import { solarMethod } from './common';

/** Fixed vertical panels (useful near the poles, where the Sun stays low). */
export const vertical = solarMethod('vertical', 'Vertical fijo', (_s, p) => ({
  tiltDeg: 90,
  azimuthDeg: param(p, 'panelAzimuthDeg'),
}));
