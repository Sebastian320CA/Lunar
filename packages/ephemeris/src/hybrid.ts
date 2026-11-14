import type { VectorSource } from './source';

/**
 * Fuente combinada: usa `primary` (binario SPICE) dentro de su cobertura y `fallback`
 * (Meeus, aproximado) fuera de ella. Así la línea de tiempo no falla antes de 2025 ni después de 2030.
 */
export class HybridSource implements VectorSource {
  readonly primary: VectorSource;
  readonly fallback: VectorSource;

  constructor(primary: VectorSource, fallback: VectorSource) {
    this.primary = primary;
    this.fallback = fallback;
  }

  coverage(): { startMs: number; endMs: number } {
    const a = this.primary.coverage();
    const b = this.fallback.coverage();
    return { startMs: Math.min(a.startMs, b.startMs), endMs: Math.max(a.endMs, b.endMs) };
  }

  /** True si `utcMs` cae fuera de la cobertura del binario y se usa el respaldo aproximado. */
  isApproximateAt(utcMs: number): boolean {
    const { startMs, endMs } = this.primary.coverage();
    return !(utcMs >= startMs && utcMs <= endMs);
  }

  sunEarth(utcMs: number, out: Float64Array): void {
    if (this.isApproximateAt(utcMs)) this.fallback.sunEarth(utcMs, out);
    else this.primary.sunEarth(utcMs, out);
  }
}
