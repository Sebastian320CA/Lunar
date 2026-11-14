import type { EphemerisBinaryHeader } from '@lunar/contracts';
import type { VectorSource } from './source';

const FIELDS = ['sunX', 'sunY', 'sunZ', 'earthX', 'earthY', 'earthZ'] as const;
const COLS = 6;
const ROW_BYTES = COLS * 8;
const UTC_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const FRACTION = /\.\d{1,9}Z$/;
const SHA_HEX = /^[0-9a-f]{64}$/;

/** Valida el encabezado (contenido de ephemeris.json). Devuelve error o null. */
export function validateHeader(h: unknown): string | null {
  if (typeof h !== 'object' || h === null) return 'header: not an object';
  const o = h as Record<string, unknown>;
  if (!Number.isInteger(o.version) || (o.version as number) < 1) return 'header.version: integer >= 1 required';
  if (typeof o.frame !== 'string' || o.frame.length === 0) return 'header.frame: non-empty string required';
  if (typeof o.startUtc !== 'string' || !UTC_Z.test(o.startUtc.replace(FRACTION, 'Z')) || Number.isNaN(Date.parse(o.startUtc))) {
    return 'header.startUtc: ISO 8601 UTC with Z suffix required';
  }
  if (typeof o.stepSeconds !== 'number' || !Number.isFinite(o.stepSeconds) || o.stepSeconds <= 0) {
    return 'header.stepSeconds: number > 0 required';
  }
  if (!Number.isInteger(o.count) || (o.count as number) < 1) return 'header.count: integer >= 1 required';
  if (o.units !== 'km') return "header.units: 'km' required";
  if (
    !Array.isArray(o.fields) ||
    o.fields.length !== COLS ||
    o.fields.some((f, i) => f !== FIELDS[i])
  ) {
    return 'header.fields: must be sunX,sunY,sunZ,earthX,earthY,earthZ';
  }
  if (typeof o.sha256 !== 'string' || !SHA_HEX.test(o.sha256)) return 'header.sha256: 64 lowercase hex chars required';
  return null;
}

/** Comparacion de cadenas hex sin cortocircuito (el hash es publico; evita el aviso de timing). */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** SHA-256 hexadecimal en minuscula (crypto.subtle). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? (data as Uint8Array<ArrayBuffer>) : data;
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const bytes = new Uint8Array(digest);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] as number).toString(16).padStart(2, '0');
  return s;
}

/**
 * Serializa filas (count*6 valores) a Float64 little-endian. Util para pruebas y herramientas.
 * Devuelve el binario y el encabezado completo con el SHA-256 calculado.
 */
export async function encodeEphemeris(
  meta: Omit<EphemerisBinaryHeader, 'sha256' | 'fields' | 'units' | 'count'>,
  rows: Float64Array,
): Promise<{ header: EphemerisBinaryHeader; bin: Uint8Array<ArrayBuffer> }> {
  if (rows.length === 0 || rows.length % COLS !== 0) throw new RangeError('rows length must be a positive multiple of 6');
  const bin = new Uint8Array(new ArrayBuffer(rows.length * 8));
  const dv = new DataView(bin.buffer);
  for (let i = 0; i < rows.length; i++) dv.setFloat64(i * 8, rows[i] as number, true);
  const header: EphemerisBinaryHeader = {
    ...meta,
    count: rows.length / COLS,
    units: 'km',
    fields: FIELDS,
    sha256: await sha256Hex(bin),
  };
  return { header, bin };
}

/** Fuente binaria con interpolacion de Lagrange de 4 puntos entre filas. */
export class BinarySource implements VectorSource {
  private readonly data: Float64Array;
  private readonly startMs: number;
  private readonly stepMs: number;
  private readonly count: number;

  private constructor(header: EphemerisBinaryHeader, data: Float64Array) {
    this.data = data;
    this.startMs = Date.parse(header.startUtc);
    this.stepMs = header.stepSeconds * 1000;
    this.count = header.count;
  }

  /**
   * Valida encabezado, tamano (count*48 bytes) y SHA-256 y crea la fuente.
   * Rechaza con Error si algo no coincide.
   */
  static async create(headerJson: unknown, bin: ArrayBuffer | Uint8Array): Promise<BinarySource> {
    const err = validateHeader(headerJson);
    if (err) throw new Error(err);
    const header = headerJson as EphemerisBinaryHeader;
    const bytes = bin instanceof Uint8Array ? bin : new Uint8Array(bin);
    if (bytes.byteLength !== header.count * ROW_BYTES) {
      throw new Error(`binary size ${bytes.byteLength} != count*48 = ${header.count * ROW_BYTES}`);
    }
    const hash = await sha256Hex(bytes);
    if (!sameHex(hash, header.sha256)) throw new Error('sha256 mismatch');
    const data = new Float64Array(header.count * COLS);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < data.length; i++) {
      const v = dv.getFloat64(i * 8, true);
      if (!Number.isFinite(v)) throw new Error('binary contains non-finite value');
      data[i] = v;
    }
    return new BinarySource(header, data);
  }

  coverage(): { startMs: number; endMs: number } {
    return { startMs: this.startMs, endMs: this.startMs + (this.count - 1) * this.stepMs };
  }

  sunEarth(utcMs: number, out: Float64Array): void {
    const { startMs, endMs } = this.coverage();
    if (!(utcMs >= startMs && utcMs <= endMs)) throw new RangeError('utcMs outside ephemeris coverage');
    const n = this.count;
    const d = this.data;
    const pos = (utcMs - startMs) / this.stepMs;
    if (n === 1) {
      for (let c = 0; c < COLS; c++) out[c] = d[c] as number;
      return;
    }
    let i = Math.floor(pos);
    if (i >= n - 1) i = n - 2;
    const f = pos - i; // 0..1 entre fila i e i+1
    if (n < 4) {
      // Interpolacion lineal si hay menos de 4 filas.
      for (let c = 0; c < COLS; c++) {
        const a = d[i * COLS + c] as number;
        const b = d[(i + 1) * COLS + c] as number;
        out[c] = a + (b - a) * f;
      }
      return;
    }
    // Ventana de 4 filas [j, j+3], desplazada en los bordes.
    let j = i - 1;
    if (j < 0) j = 0;
    if (j > n - 4) j = n - 4;
    const x = pos - j; // en unidades de fila, nodos 0,1,2,3
    const w0 = (-(x - 1) * (x - 2) * (x - 3)) / 6;
    const w1 = (x * (x - 2) * (x - 3)) / 2;
    const w2 = (-x * (x - 1) * (x - 3)) / 2;
    const w3 = (x * (x - 1) * (x - 2)) / 6;
    const base = j * COLS;
    for (let c = 0; c < COLS; c++) {
      out[c] =
        w0 * (d[base + c] as number) +
        w1 * (d[base + COLS + c] as number) +
        w2 * (d[base + 2 * COLS + c] as number) +
        w3 * (d[base + 3 * COLS + c] as number);
    }
  }
}
