import type { Result } from '@lunar/contracts';

const MAX_LENGTH = 64;
const UTC_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : (DAYS_IN_MONTH[month - 1] as number);
}

const INVALID: Result<string> = {
  ok: false,
  error: 'Fecha inválida: se espera UTC ISO 8601 con zona Z (AAAA-MM-DDThh:mm:ssZ) y una fecha de calendario existente.',
};

/**
 * Valida una cadena UTC ISO 8601 `AAAA-MM-DDThh:mm:ssZ` (año 0001..9999, sin fracciones)
 * con aritmética de calendario, sin usar `Date`. Devuelve la cadena normalizada. Nunca lanza.
 */
export function validateUtc(input: unknown): Result<string> {
  if (typeof input !== 'string' || input.length > MAX_LENGTH) return INVALID;
  const m = UTC_PATTERN.exec(input);
  if (m === null) return INVALID;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6]);
  if (year < 1 || year > 9999) return INVALID;
  if (month < 1 || month > 12) return INVALID;
  if (day < 1 || day > daysInMonth(year, month)) return INVALID;
  if (hour > 23 || minute > 59 || second > 59) return INVALID;
  return { ok: true, value: input };
}
