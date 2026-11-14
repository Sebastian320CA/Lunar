import { solarMethod } from './common';

/** Dual-axis tracker: panel normal always points at the Sun (cos incidence = 1). */
export const dualAxis = solarMethod('dualAxis', 'Seguimiento de dos ejes', (s) => ({
  tiltDeg: 90 - Math.max(0, s.sun.elevationDeg),
  azimuthDeg: s.sun.azimuthDeg,
}));
