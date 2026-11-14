/**
 * Ballistics on flat ground, no drag (the Moon has no atmosphere; Earth drag
 * is deliberately ignored so both bodies are compared by gravity alone).
 */

/**
 * Lunar surface gravity, 1.62 m/s2.
 * Source: NASA Goddard Space Flight Center, Moon Fact Sheet
 * (https://nssdc.gsfc.nasa.gov/planetary/factsheet/moonfact.html), "Surface gravity: 1.62 m/s2".
 */
export const GRAVITY_MOON = 1.62;

/**
 * Standard Earth gravity, 9.80665 m/s2.
 * Source: 3rd CGPM (1901), standard acceleration of gravity g_n; see BIPM SI Brochure.
 */
export const GRAVITY_EARTH = 9.80665;

export type Body = 'moon' | 'earth';

export function gravityOf(body: Body): number {
  return body === 'moon' ? GRAVITY_MOON : GRAVITY_EARTH;
}

function rad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Total flight time (s) back to launch height: T = 2 v sin(a) / g. */
export function flightTime(speed: number, angleDeg: number, g: number): number {
  return (2 * speed * Math.sin(rad(angleDeg))) / g;
}

/** Horizontal range (m): R = v^2 sin(2a) / g. */
export function range(speed: number, angleDeg: number, g: number): number {
  return (speed * speed * Math.sin(2 * rad(angleDeg))) / g;
}

/** Maximum height (m): H = (v sin a)^2 / (2 g). */
export function maxHeight(speed: number, angleDeg: number, g: number): number {
  const vy = speed * Math.sin(rad(angleDeg));
  return (vy * vy) / (2 * g);
}

/** Position (m) at time t seconds after launch. */
export function positionAt(
  speed: number,
  angleDeg: number,
  g: number,
  t: number,
): { x: number; y: number } {
  const a = rad(angleDeg);
  return {
    x: speed * Math.cos(a) * t,
    y: speed * Math.sin(a) * t - 0.5 * g * t * t,
  };
}
