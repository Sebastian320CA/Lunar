/** Solar constant at 1 AU, W/m2. Source: Kopp & Lean 2011, GRL 38, L01706 (TSI 1360.8 +/- 0.5), rounded to 1361 (IAU 2015 Res. B3 nominal 1361). */
export const SOLAR_CONSTANT_WM2 = 1361;
/** 1 astronomical unit in km. Source: IAU 2012 Res. B2 (149597870.7 km exact). */
export const AU_KM = 149597870.7;

const DEG = Math.PI / 180;

/** Irradiance on a surface facing the Sun, inverse-square with Sun-Moon distance, no atmosphere. */
export function irradianceWm2(sunMoonDistanceKm: number = AU_KM): number {
  if (!Number.isFinite(sunMoonDistanceKm) || sunMoonDistanceKm <= 0) return 0;
  const r = AU_KM / sunMoonDistanceKm;
  return SOLAR_CONSTANT_WM2 * r * r;
}

/**
 * Cosine of the incidence angle between the Sun direction and the panel normal, clamped to >= 0.
 * Sun: azimuth 0 = north clockwise, elevation above local horizon.
 * Panel: tilt 0 = horizontal (normal up), 90 = vertical; panelAzimuth = direction the normal leans toward.
 */
export function incidenceCos(
  sunAzimuthDeg: number,
  sunElevationDeg: number,
  panelTiltDeg: number,
  panelAzimuthDeg: number,
): number {
  const el = sunElevationDeg * DEG;
  const tilt = panelTiltDeg * DEG;
  const dAz = (sunAzimuthDeg - panelAzimuthDeg) * DEG;
  const c = Math.sin(el) * Math.cos(tilt) + Math.cos(el) * Math.sin(tilt) * Math.cos(dAz);
  return Math.max(0, c);
}
