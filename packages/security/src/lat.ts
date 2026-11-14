import type { Result } from '@lunar/contracts';
import { z } from 'zod';

const latSchema = z.number().finite().min(-90).max(90);

/** Valida una latitud en grados (-90..90). Nunca lanza. */
export function validateLat(input: unknown): Result<number> {
  const parsed = latSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'Latitud inválida: debe ser un número finito entre -90 y 90 grados.' };
  }
  // -0 se normaliza a 0.
  return { ok: true, value: parsed.data === 0 ? 0 : parsed.data };
}
