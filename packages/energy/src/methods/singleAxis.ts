import { param } from '../defaults';
import { solarMethod } from './common';

/** Single-axis tracker: vertical axis follows the Sun azimuth, fixed tilt (param tiltDeg). */
export const singleAxis = solarMethod('singleAxis', 'Seguimiento de un eje', (s, p) => ({
  tiltDeg: param(p, 'tiltDeg'),
  azimuthDeg: s.sun.azimuthDeg,
}));
