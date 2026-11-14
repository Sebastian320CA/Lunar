import { APOLLO_SITE_IDS } from '@lunar/contracts';
import type { Result } from '@lunar/contracts';

export const SITE_ID_ALLOWLIST: readonly string[] = [...APOLLO_SITE_IDS];

const MAX_LENGTH = 64;

/** Valida un id de sitio contra la lista permitida (coincidencia exacta). Nunca lanza. */
export function validateSiteId(input: unknown): Result<string> {
  if (
    typeof input === 'string' &&
    input.length <= MAX_LENGTH &&
    SITE_ID_ALLOWLIST.includes(input)
  ) {
    return { ok: true, value: input };
  }
  return { ok: false, error: 'Identificador de sitio no permitido.' };
}
