import type { VectorSource } from './source';

/**
 * Fuente analitica de respaldo (baja precision). NO es una efemeride de precision.
 *
 * Fuentes: Jean Meeus, "Astronomical Algorithms", 2a ed. (Willmann-Bell, 1998):
 *  - cap. 25 (Sol, baja precision, con aberracion),
 *  - cap. 47 (posicion de la Luna, serie ELP-2000/82 TRUNCADA a los terminos mayores de las tablas 47.A y 47.B),
 *  - cap. 53 (libracion optica; la libracion fisica se omite).
 *
 * Marco de salida: Luna fija, origen en el centro de la Luna, +X hacia el meridiano medio (hacia la Tierra en
 * promedio), +Z polo norte lunar medio, +Y al este (longitud selenografica positiva al este). Es el convenio
 * Mean Earth (ME) aproximado: solo libracion optica, sin la fisica (~0.04 grados) ni correccion de tiempo de luz.
 * Mismo convenio que `data/ephemeris` generado con MOON_ME_DE440_ME421.
 *
 * Tiempo: UTC se convierte a TD sumando DELTA_T_S fijo (aprox. valido en 2025-2030). Equinoccio medio de la fecha.
 */
export const ANALYTIC_NOTE =
  'APROXIMADO: Meeus (Astronomical Algorithms 2a ed., cap. 25, 47 truncado, 53 solo libracion optica). ' +
  'Marco Luna fija, Mean Earth aproximado. Error esperado de decimas de grado en direccion Sol/Tierra; ' +
  'no usar para analisis de precision. Exactitud contra Horizons: PENDIENTE (compare_horizons.py).';

/** Delta T = TD - UTC en segundos, valor fijo aproximado para 2025-2030 (PENDIENTE: confirmar con IERS/USNO). */
export const DELTA_T_S = 69.2;
/** Unidad astronomica en km (IAU 2012). */
export const AU_KM = 149597870.7;

const RAD = Math.PI / 180;
/** Inclinacion del ecuador lunar sobre la ecliptica, grados (Meeus cap. 53). */
const I_DEG = 1.54242;

// Terminos de longitud y distancia (tabla 47.A truncada): D, M, M', F, sumaL (1e-6 grados), sumaR (1e-3 km).
// prettier-ignore
const LR: readonly number[] = [
  0, 0, 1, 0, 6288774, -20905355,
  2, 0, -1, 0, 1274027, -3699111,
  2, 0, 0, 0, 658314, -2955968,
  0, 0, 2, 0, 213618, -569925,
  0, 1, 0, 0, -185116, 48888,
  0, 0, 0, 2, -114332, -3149,
  2, 0, -2, 0, 58793, 246158,
  2, -1, -1, 0, 57066, -152138,
  2, 0, 1, 0, 53322, -170733,
  2, -1, 0, 0, 45758, -204586,
  0, 1, -1, 0, -40923, -129620,
  1, 0, 0, 0, -34720, 108743,
  0, 1, 1, 0, -30383, 104755,
  2, 0, 0, -2, 15327, 10321,
  0, 0, 1, 2, -12528, 0,
  0, 0, 1, -2, 10980, 79661,
  4, 0, -1, 0, 10675, -34782,
  0, 0, 3, 0, 10034, -23210,
  4, 0, -2, 0, 8548, -21636,
  2, 1, -1, 0, -7888, 24208,
  2, 1, 0, 0, -6766, 30824,
  1, 0, -1, 0, -5163, -8379,
  1, 1, 0, 0, 4987, -16675,
  2, -1, 1, 0, 4036, -12831,
  2, 0, 2, 0, 3994, -10445,
  4, 0, 0, 0, 3861, -11650,
  2, 0, -3, 0, 3665, 14403,
  0, 1, -2, 0, -2689, -7003,
  2, 0, -1, 2, -2602, 0,
  2, -1, -2, 0, 2390, 10056,
  1, 0, 1, 0, -2348, 6322,
  2, -2, 0, 0, 2236, -9884,
];

// Terminos de latitud (tabla 47.B truncada): D, M, M', F, sumaB (1e-6 grados).
// prettier-ignore
const B: readonly number[] = [
  0, 0, 0, 1, 5128122,
  0, 0, 1, 1, 280602,
  0, 0, 1, -1, 277693,
  2, 0, 0, -1, 173237,
  2, 0, -1, 1, 55413,
  2, 0, -1, -1, 46271,
  2, 0, 0, 1, 32573,
  0, 0, 2, 1, 17198,
  2, 0, 1, -1, 9266,
  0, 0, 2, -1, 8822,
  2, -1, 0, -1, 8216,
  2, 0, -2, -1, 4324,
  2, 0, 1, 1, 4200,
  2, 1, 0, -1, -3359,
];

function norm360(x: number): number {
  const r = x % 360;
  return r < 0 ? r + 360 : r;
}

/** Dia juliano (TD) para un instante UTC en ms. */
export function julianDayTd(utcMs: number): number {
  return utcMs / 86400000 + 2440587.5 + DELTA_T_S / 86400;
}

/**
 * Luna geocentrica, ecliptica media de la fecha (Meeus cap. 47, sin nutacion):
 * out[0] = longitud (grados), out[1] = latitud (grados), out[2] = distancia (km), out[3] = F (grados, arg. de latitud).
 */
export function moonEclipticOfDate(jde: number, out: Float64Array): void {
  const T = (jde - 2451545) / 36525;
  const T2 = T * T;
  const Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2);
  const D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2);
  const M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2);
  const Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2);
  const F = norm360(93.272095 + 483202.0175233 * T - 0.0036539 * T2);
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.29 * T);
  const A3 = norm360(313.45 + 481266.484 * T);

  const d = D * RAD;
  const m = M * RAD;
  const mp = Mp * RAD;
  const f = F * RAD;

  let sl = 0;
  let sr = 0;
  for (let i = 0; i < LR.length; i += 6) {
    const cm = LR[i + 1] as number;
    const arg = (LR[i] as number) * d + cm * m + (LR[i + 2] as number) * mp + (LR[i + 3] as number) * f;
    const e = cm === 0 ? 1 : Math.abs(cm) === 1 ? E : E * E;
    sl += (LR[i + 4] as number) * e * Math.sin(arg);
    sr += (LR[i + 5] as number) * e * Math.cos(arg);
  }
  let sb = 0;
  for (let i = 0; i < B.length; i += 5) {
    const cm = B[i + 1] as number;
    const arg = (B[i] as number) * d + cm * m + (B[i + 2] as number) * mp + (B[i + 3] as number) * f;
    const e = cm === 0 ? 1 : Math.abs(cm) === 1 ? E : E * E;
    sb += (B[i + 4] as number) * e * Math.sin(arg);
  }
  const lp = Lp * RAD;
  sl += 3958 * Math.sin(A1 * RAD) + 1962 * Math.sin(lp - f) + 318 * Math.sin(A2 * RAD);
  sb +=
    -2235 * Math.sin(lp) +
    382 * Math.sin(A3 * RAD) +
    175 * Math.sin((A1 - F) * RAD) +
    175 * Math.sin((A1 + F) * RAD) +
    127 * Math.sin(lp - mp) -
    115 * Math.sin(lp + mp);

  out[0] = norm360(Lp + sl / 1e6);
  out[1] = sb / 1e6;
  out[2] = 385000.56 + sr / 1000;
  out[3] = F;
}

/**
 * Sol geocentrico, ecliptica media de la fecha, con aberracion (Meeus cap. 25, sin nutacion):
 * out[0] = longitud (grados), out[1] = distancia (km).
 */
export function sunEclipticOfDate(jde: number, out: Float64Array): void {
  const T = (jde - 2451545) / 36525;
  const T2 = T * T;
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T2;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T2;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T2;
  const m = M * RAD;
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T2) * Math.sin(m) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * m) +
    0.000289 * Math.sin(3 * m);
  const v = m + C * RAD;
  const R = (1.000001018 * (1 - e * e)) / (1 + e * Math.cos(v));
  out[0] = norm360(L0 + C - 0.00569);
  out[1] = R * AU_KM;
}

/** Fuente analitica aproximada. Ver `ANALYTIC_NOTE`. */
export class AnalyticSource implements VectorSource {
  /** Cobertura nominal 1900-2100 (la serie truncada y DELTA_T_S fijo solo son razonables cerca de 2025-2030). */
  private static readonly START_MS = Date.UTC(1900, 0, 1);
  private static readonly END_MS = Date.UTC(2100, 0, 1);

  private readonly moon = new Float64Array(4);
  private readonly sun = new Float64Array(2);

  /** Etiqueta de exactitud para la UI. */
  readonly note: string = ANALYTIC_NOTE;

  coverage(): { startMs: number; endMs: number } {
    return { startMs: AnalyticSource.START_MS, endMs: AnalyticSource.END_MS };
  }

  sunEarth(utcMs: number, out: Float64Array): void {
    if (!(utcMs >= AnalyticSource.START_MS && utcMs <= AnalyticSource.END_MS)) {
      throw new RangeError('utcMs outside ephemeris coverage');
    }
    const jde = julianDayTd(utcMs);
    const T = (jde - 2451545) / 36525;
    const mo = this.moon;
    const su = this.sun;
    moonEclipticOfDate(jde, mo);
    sunEclipticOfDate(jde, su);

    // Luna geocentrica en cartesianas eclipticas.
    const lam = (mo[0] as number) * RAD;
    const bet = (mo[1] as number) * RAD;
    const dist = mo[2] as number;
    const mx = dist * Math.cos(bet) * Math.cos(lam);
    const my = dist * Math.cos(bet) * Math.sin(lam);
    const mz = dist * Math.sin(bet);
    // Sol geocentrico (latitud ~0).
    const ls = (su[0] as number) * RAD;
    const sx = (su[1] as number) * Math.cos(ls);
    const sy = (su[1] as number) * Math.sin(ls);
    // Desde el centro de la Luna: Sol = Sol_geo - Luna_geo; Tierra = -Luna_geo.
    const vsx = sx - mx;
    const vsy = sy - my;
    const vsz = -mz;
    const vex = -mx;
    const vey = -my;
    const vez = -mz;

    // Ejes lunares (Meeus cap. 53): polo medio p, nodo del ecuador en la longitud Omega.
    const omega = (125.0445479 - 1934.1362891 * T + 0.0020754 * T * T) * RAD;
    const I = I_DEG * RAD;
    const so = Math.sin(omega);
    const co = Math.cos(omega);
    const sI = Math.sin(I);
    const cI = Math.cos(I);
    const px = -sI * so;
    const py = sI * co;
    const pz = cI;
    // x_n = nodo; y_n = p x x_n
    const ynx = -cI * so;
    const yny = cI * co;
    const ynz = -sI;
    // +X del cuerpo apunta (en promedio) a la Tierra: angulo desde el nodo = F + 180 grados.
    const th = ((mo[3] as number) + 180) * RAD;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const xbx = ct * co + st * ynx;
    const xby = ct * so + st * yny;
    const xbz = st * ynz;
    // y_b = p x x_b
    const ybx = py * xbz - pz * xby;
    const yby = pz * xbx - px * xbz;
    const ybz = px * xby - py * xbx;

    out[0] = vsx * xbx + vsy * xby + vsz * xbz;
    out[1] = vsx * ybx + vsy * yby + vsz * ybz;
    out[2] = vsx * px + vsy * py + vsz * pz;
    out[3] = vex * xbx + vey * xby + vez * xbz;
    out[4] = vex * ybx + vey * yby + vez * ybz;
    out[5] = vex * px + vey * py + vez * pz;
  }
}
