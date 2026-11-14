import type { UtcString, Vec3 } from '@lunar/contracts';
import type { VectorSource } from './source';

/**
 * Direccion unitaria del Sol en el marco Moon-fixed ME (+X hacia la Tierra media, +Y este, +Z polo norte),
 * centrada en la Luna. Sincrona. Lanza RangeError fuera de cobertura o con fecha invalida.
 */
export function sunDirectionMoonFixed(source: VectorSource, utc: UtcString): Vec3 {
  const ms = Date.parse(utc);
  if (!Number.isFinite(ms)) throw new RangeError(`Invalid UTC string: ${utc}`);
  const out = new Float64Array(6);
  source.sunEarth(ms, out);
  const x = out[0] as number;
  const y = out[1] as number;
  const z = out[2] as number;
  const n = Math.hypot(x, y, z);
  return { x: x / n, y: y / n, z: z / n };
}
