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

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/**
 * SHA-256 en TypeScript puro. Respaldo para contextos sin `crypto.subtle`
 * (por ejemplo, la app servida por HTTP en una red local, que no es un contexto seguro).
 */
export function sha256HexSync(input: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const len = input.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const tail = new Uint8Array(total - Math.floor(len / 64) * 64);
  tail.set(input.subarray(Math.floor(len / 64) * 64));
  tail[len % 64] = 0x80;
  const bits = len * 8;
  const tv = new DataView(tail.buffer);
  tv.setUint32(tail.length - 8, Math.floor(bits / 0x100000000));
  tv.setUint32(tail.length - 4, bits >>> 0);
  const w = new Uint32Array(64);
  const fullBlocks = Math.floor(len / 64);
  const iv = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const block = (view: DataView, off: number): void => {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number;
      const b = w[i - 2] as number;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as number[] as [number, number, number, number, number, number, number, number];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + (K256[i] as number) + (w[i] as number)) >>> 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] as number) + a;
    h[1] = (h[1] as number) + b;
    h[2] = (h[2] as number) + c;
    h[3] = (h[3] as number) + d;
    h[4] = (h[4] as number) + e;
    h[5] = (h[5] as number) + f;
    h[6] = (h[6] as number) + g;
    h[7] = (h[7] as number) + hh;
  };
  for (let blk = 0; blk < fullBlocks; blk++) block(iv, blk * 64);
  for (let off = 0; off < tail.length; off += 64) block(tv, off);
  let s = '';
  for (let i = 0; i < 8; i++) s += (h[i] as number).toString(16).padStart(8, '0');
  return s;
}

/** SHA-256 hexadecimal en minuscula (crypto.subtle; respaldo en TypeScript si no esta disponible). */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) return sha256HexSync(bytes);
  const digest = await subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  const out = new Uint8Array(digest);
  let s = '';
  for (let i = 0; i < out.length; i++) s += (out[i] as number).toString(16).padStart(2, '0');
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
