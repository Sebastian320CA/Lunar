import { solarMethod } from './common';

/**
 * Horizontal panel on a raised mast. The caller passes `mastHorizonElevDeg`, the terrain horizon
 * elevation at mast height (Solicitud al contrato: TerrainService has no height parameter).
 * When absent, the terrain flag `sun.aboveTerrainHorizon` is used.
 */
export const mast = solarMethod(
  'mast',
  'Mastil elevado',
  () => ({ tiltDeg: 0, azimuthDeg: 0 }),
  (s, p) => {
    const h = p['mastHorizonElevDeg'];
    return typeof h === 'number' && Number.isFinite(h) ? s.sun.elevationDeg > h : s.sun.aboveTerrainHorizon;
  },
);
