import type { BodyState, EnergyResult } from '@lunar/contracts';

/**
 * Pure orientation math for the 3D solar panel view (no Three.js).
 * Frame (same as Three.js y-up): x = east, y = up, z = south (north = -z).
 * Azimuth: 0 = north, clockwise. Angles in degrees, vectors are unit length.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PanelOrientation {
  /** Unit normal of the panel face. */
  normal: Vec3;
  /** Unit vector from the panel toward the Sun (the light ray travels opposite). */
  rayDirection: Vec3;
  /** Angle of the elevation indicator arc, degrees, clamped to -90..90. */
  elevationIndicatorDeg: number;
  /** Compass heading of the Sun, degrees in [0, 360). */
  compassHeadingDeg: number;
  /** Angle between panel normal and Sun direction, degrees 0..180. */
  incidenceDeg: number;
}

const DEG = Math.PI / 180;

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Normalizes an angle to [0, 360). Non-finite input gives 0. */
export function normalizeAzimuthDeg(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const m = deg % 360;
  const r = m < 0 ? m + 360 : m;
  return r >= 360 ? 0 : r;
}

/** Unit vector for a direction given by azimuth (0 = north, clockwise) and elevation above the horizon. */
export function directionFromAzEl(azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = finiteOr(azimuthDeg, 0) * DEG;
  const el = finiteOr(elevationDeg, 0) * DEG;
  const ce = Math.cos(el);
  return { x: Math.sin(az) * ce, y: Math.sin(el), z: -Math.cos(az) * ce };
}

/**
 * Panel normal. Tilt 0 = horizontal (normal up), 90 = vertical; the normal leans toward `azimuthDeg`.
 */
export function panelNormal(tiltDeg: number, azimuthDeg: number): Vec3 {
  const t = finiteOr(tiltDeg, 0) * DEG;
  const az = finiteOr(azimuthDeg, 0) * DEG;
  const s = Math.sin(t);
  return { x: s * Math.sin(az), y: Math.cos(t), z: -s * Math.cos(az) };
}

/** Unit vector pointing from the panel to the Sun. */
export function rayDirection(sun: BodyState): Vec3 {
  return directionFromAzEl(sun.azimuthDeg, sun.elevationDeg);
}

/** Elevation indicator angle: Sun elevation clamped to -90..90. */
export function elevationIndicatorDeg(sun: BodyState): number {
  return Math.max(-90, Math.min(90, finiteOr(sun.elevationDeg, 0)));
}

/** Compass heading of the Sun in [0, 360). */
export function compassHeadingDeg(sun: BodyState): number {
  return normalizeAzimuthDeg(sun.azimuthDeg);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** All orientation values for one frame. */
export function computeOrientation(result: EnergyResult, sun: BodyState): PanelOrientation {
  const normal = panelNormal(result.panelTiltDeg, result.panelAzimuthDeg);
  const ray = rayDirection(sun);
  const c = Math.max(-1, Math.min(1, dot(normal, ray)));
  return {
    normal,
    rayDirection: ray,
    elevationIndicatorDeg: elevationIndicatorDeg(sun),
    compassHeadingDeg: compassHeadingDeg(sun),
    incidenceDeg: Math.acos(c) / DEG,
  };
}
