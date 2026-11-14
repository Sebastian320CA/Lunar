/**
 * Fuente de vectores Sol/Tierra.
 * Marco: Luna fija, Mean Earth (ME; coincide con las coordenadas de sitios), origen en el centro de la Luna, unidades km.
 */
export interface VectorSource {
  /**
   * Escribe en `out` (largo >= 6) [sunX, sunY, sunZ, earthX, earthY, earthZ] en km
   * para el instante `utcMs` (ms desde epoch UTC). Lanza RangeError fuera de cobertura.
   */
  sunEarth(utcMs: number, out: Float64Array): void;
  /** Cobertura temporal inclusiva, en ms desde epoch UTC. */
  coverage(): { startMs: number; endMs: number };
}
