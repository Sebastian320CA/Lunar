import type { LunarSite } from '@lunar/contracts';
import { sanitizeName, validateLat, validateLon } from '@lunar/security';

export interface CustomSiteInput {
  name: unknown;
  lat: unknown;
  lon: unknown;
}

export interface CustomSiteErrors {
  name?: string;
  lat?: string;
  lon?: string;
}

export type CustomSiteResult = { ok: true; value: LunarSite } | { ok: false; errors: CustomSiteErrors };

/** Convierte texto numérico del formulario en número; deja pasar otros tipos para que el validador los rechace. */
function toNumber(x: unknown): unknown {
  if (typeof x !== 'string') return x;
  const t = x.trim().replace(',', '.');
  return t === '' ? Number.NaN : Number(t);
}

/**
 * Valida un sitio personalizado. Devuelve errores por campo, en español.
 * El sitio resultante tiene `program: 'custom'`, `verified: false` y id `custom-1`.
 */
export function validateCustomSite(input: CustomSiteInput): CustomSiteResult {
  const errors: CustomSiteErrors = {};

  const name = sanitizeName(input.name);
  if (!name.ok || name.value === '') {
    errors.name = 'El nombre es obligatorio y debe ser texto válido de hasta 64 caracteres.';
  }

  const lat = validateLat(toNumber(input.lat));
  if (!lat.ok) errors.lat = 'La latitud debe ser un número entre -90 y 90 grados.';

  const lon = validateLon(toNumber(input.lon));
  if (!lon.ok) errors.lon = 'La longitud debe ser un número entre -180 y 180 grados (este positivo).';

  if (!name.ok || name.value === '' || !lat.ok || !lon.ok) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id: 'custom-1',
      name: name.value,
      program: 'custom',
      latDeg: lat.value,
      lonDeg: lon.value,
      source: 'Coordenadas ingresadas por el usuario',
      verified: false,
    },
  };
}
