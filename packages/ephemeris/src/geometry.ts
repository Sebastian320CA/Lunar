/** Radio medio lunar en km (esfera de referencia IAU, 1737.4 km). */
export const MOON_RADIUS_KM = 1737.4;
/** Radio solar en km (IAU 2015 nominal, 695700 km). */
export const SUN_RADIUS_KM = 695700;
/** Radio ecuatorial terrestre en km (WGS-84). */
export const EARTH_RADIUS_KM = 6378.137;

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/**
 * Azimut (0 = norte, horario, en [0, 360)) y elevacion (grados, sin refraccion) del vector
 * `(x, y, z)` (km, desde el centro de la Luna, marco Luna fija) visto desde un sitio en
 * (latDeg, lonDeg) a `radiusKm` del centro (incluye paralaje topocentrica).
 * Resultado en out[0] = azimut, out[1] = elevacion.
 */
export function toAzEl(
  x: number,
  y: number,
  z: number,
  latDeg: number,
  lonDeg: number,
  out: Float64Array,
  radiusKm: number = MOON_RADIUS_KM,
): void {
  const φ = latDeg * RAD;
  const λ = lonDeg * RAD;
  const sφ = Math.sin(φ);
  const cφ = Math.cos(φ);
  const sλ = Math.sin(λ);
  const cλ = Math.cos(λ);
  // Vector topocentrico: v - R * up
  const tx = x - radiusKm * cφ * cλ;
  const ty = y - radiusKm * cφ * sλ;
  const tz = z - radiusKm * sφ;
  const east = -sλ * tx + cλ * ty;
  const north = -sφ * cλ * tx - sφ * sλ * ty + cφ * tz;
  const up = cφ * cλ * tx + cφ * sλ * ty + sφ * tz;
  let az = Math.atan2(east, north) * DEG;
  if (az < 0) az += 360;
  if (az >= 360) az = 0; // evita 360 por redondeo
  out[0] = az;
  out[1] = Math.atan2(up, Math.hypot(east, north)) * DEG;
}

/** Radio angular aparente en grados de un disco de radio `bodyRadiusKm` a `distanceKm`. */
export function angularRadiusDeg(bodyRadiusKm: number, distanceKm: number): number {
  if (!(distanceKm > bodyRadiusKm)) throw new RangeError('distance must exceed body radius');
  return Math.asin(bodyRadiusKm / distanceKm) * DEG;
}

/** Distancia Sol-Luna en km (norma del vector solar desde el centro de la Luna). */
export function sunMoonDistanceKm(sunX: number, sunY: number, sunZ: number): number {
  return Math.hypot(sunX, sunY, sunZ);
}
