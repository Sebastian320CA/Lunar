import type { Result } from '@lunar/contracts';
import { z } from 'zod';

const lonSchema = z.number().finite().min(-180).max(360);

/**
 * Valida una longitud entre -180 y 360 y devuelve la Longitud_Canonica en (-180, 180].
 * Nunca lanza.
 */
export function validateLon(input: unknown): Result<number> {
  const parsed = lonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Longitud inválida: debe ser un número finito entre -180 y 360 grados.' };
  }
  let v = parsed.data;
  if (v === -180) v = 180;
  else if (v > 180) v -= 360;
  // -0 se normaliza a 0.
  return { ok: true, value: v === 0 ? 0 : v };
}
