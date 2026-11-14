/**
 * Horizonte en tiempo de ejecucion a partir de una tesela DEM.
 *
 * Formato de tesela (`DemTile`):
 * - `data`: arreglo tipado de alturas en metros sobre la esfera de referencia (1737.4 km),
 *   fila mayor (row-major), `width * height` valores; la fila 0 es la mas al norte.
 * - Georreferencia: `westDeg`/`northDeg` = esquina noroeste del centro del pixel (0,0);
 *   `pixelDegLon`/`pixelDegLat` = tamano de pixel en grados (> 0, la latitud decrece con la fila).
 * - `resolutionM`: resolucion nominal del DEM en metros (se copia a `demResolutionM`).
 * - `source`: producto DEM (se copia a `demSource`).
 *
 * La precision del horizonte esta limitada por la resolucion del DEM, no por la aritmetica.
 * Si la tesela no cubre el sitio, se devuelve el horizonte esferico.
 */
import type { HorizonProfile } from '@lunar/contracts';
import { MOON_RADIUS_M, sphericalHorizon } from './spherical';

export interface DemTile {
  data: ArrayLike<number>;
  width: number;
  height: number;
  westDeg: number;
  northDeg: number;
  pixelDegLon: number;
  pixelDegLat: number;
  resolutionM: number;
  source: string;
}

const RAD = Math.PI / 180;

/** Altura bilineal en (lat, lon); NaN si queda fuera de la tesela. */
export function sampleDem(tile: DemTile, latDeg: number, lonDeg: number): number {
  const x = (lonDeg - tile.westDeg) / tile.pixelDegLon;
  const y = (tile.northDeg - latDeg) / tile.pixelDegLat;
  if (!(x >= 0 && y >= 0 && x <= tile.width - 1 && y <= tile.height - 1)) return NaN;
  const x0 = Math.min(Math.floor(x), tile.width - 2 < 0 ? 0 : tile.width - 2);
  const y0 = Math.min(Math.floor(y), tile.height - 2 < 0 ? 0 : tile.height - 2);
  const x1 = Math.min(x0 + 1, tile.width - 1);
  const y1 = Math.min(y0 + 1, tile.height - 1);
  const fx = x - x0;
  const fy = y - y0;
  const v = (cx: number, cy: number): number => tile.data[cy * tile.width + cx] ?? NaN;
  const top = v(x0, y0) * (1 - fx) + v(x1, y0) * fx;
  const bot = v(x0, y1) * (1 - fx) + v(x1, y1) * fx;
  return top * (1 - fy) + bot * fy;
}

export function computeHorizonFromDem(
  tile: DemTile,
  latDeg: number,
  lonDeg: number,
  observerHeightM = 0,
  stepDeg = 1,
): HorizonProfile {
  const fallback = sphericalHorizon(observerHeightM);
  const ground = sampleDem(tile, latDeg, lonDeg);
  if (!Number.isFinite(ground) || !(stepDeg > 0) || !Number.isInteger(360 / stepDeg)) {
    return fallback;
  }
  const h0 = ground + Math.max(0, observerHeightM);
  const dip = fallback.elevationDeg[0] ?? 0;
  const R = MOON_RADIUS_M;
  const stepM = Math.max(tile.resolutionM / 2, 1);
  const maxM = Math.max(tile.width * tile.pixelDegLon, tile.height * tile.pixelDegLat) * RAD * R;
  const lat1 = latDeg * RAD;
  const lon1 = lonDeg * RAD;
  const n = 360 / stepDeg;
  const elevationDeg: number[] = [];

  for (let i = 0; i < n; i++) {
    const az = i * stepDeg * RAD;
    let best = dip;
    for (let d = stepM; d <= maxM; d += stepM) {
      const th = d / R;
      const sinLat2 = Math.sin(lat1) * Math.cos(th) + Math.cos(lat1) * Math.sin(th) * Math.cos(az);
      const lat2 = Math.asin(Math.max(-1, Math.min(1, sinLat2)));
      const lon2 =
        lon1 +
        Math.atan2(
          Math.sin(az) * Math.sin(th) * Math.cos(lat1),
          Math.cos(th) - Math.sin(lat1) * sinLat2,
        );
      const lonDeg2 = ((((lon2 / RAD + 180) % 360) + 360) % 360) - 180;
      const h = sampleDem(tile, lat2 / RAD, lonDeg2);
      if (!Number.isFinite(h)) continue;
      // Geometria exacta sobre la esfera: incluye la caida por curvatura.
      const up = (R + h) * Math.cos(th) - (R + h0);
      const along = (R + h) * Math.sin(th);
      const e = Math.atan2(up, along) / RAD;
      if (e > best) best = e;
    }
    elevationDeg.push(best);
  }

  return {
    azimuthStepDeg: stepDeg,
    elevationDeg,
    demResolutionM: tile.resolutionM,
    demSource: tile.source,
  };
}
