import type { Result } from '@lunar/contracts';

function isDropped(c: number): boolean {
  return (
    c <= 0x1f ||
    (c >= 0x7f && c <= 0x9f) ||
    c === 0x200e ||
    c === 0x200f ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2066 && c <= 0x2069) ||
    c === 0x061c
  );
}

/** Un solo recorrido lineal: descarta Cc, bidi, marcas HTML y `<`/`>` sueltos. */
function strip(s: string): string {
  const n = s.length;
  const parts: string[] = [];
  let start = 0;
  let nextGt = -2; // -2: sin calcular, -1: no quedan '>'
  let i = 0;
  while (i < n) {
    const c = s.charCodeAt(i);
    if (c === 0x3c) {
      if (nextGt !== -1 && nextGt < i) nextGt = s.indexOf('>', i + 1);
      parts.push(s.slice(start, i));
      if (nextGt === -1) {
        i += 1; // '<' suelto
      } else {
        i = nextGt + 1; // descarta el tramo <...>
      }
      start = i;
    } else if (c === 0x3e || isDropped(c)) {
      parts.push(s.slice(start, i));
      i += 1;
      start = i;
    } else {
      i += 1;
    }
  }
  parts.push(s.slice(start));
  return parts.join('');
}

function countCodePoints(s: string): number {
  let count = 0;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const d = s.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) i += 1;
    }
    count += 1;
  }
  return count;
}

/** Sanea un texto libre. Nunca lanza. No trunca: rechaza si excede `maxCodePoints`. */
export function sanitizeText(x: unknown, maxCodePoints: number): Result<string> {
  if (typeof x !== 'string') return { ok: false, error: 'tipo de entrada no válido' };
  const out = strip(x).normalize('NFC').trim();
  const len = countCodePoints(out);
  if (len === 0) return { ok: false, error: 'nombre vacío' };
  if (len > maxCodePoints) {
    return { ok: false, error: `excede la longitud máxima de ${maxCodePoints} caracteres` };
  }
  return { ok: true, value: out };
}

/** Sanea un nombre personalizado (máximo 64 puntos de código). */
export function sanitizeName(x: unknown): Result<string> {
  return sanitizeText(x, 64);
}
