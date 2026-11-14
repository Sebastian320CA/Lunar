import type { UtcString, Vec3 } from '@lunar/contracts';

/** Guarda la hora simulada y el proveedor de direccion solar; aplica el resultado mediante `apply`. */
export class SunController {
  private provider: ((utc: UtcString) => Vec3) | null = null;
  private utc: UtcString | null = null;

  private readonly apply: (dir: Vec3) => void;

  constructor(apply: (dir: Vec3) => void) {
    this.apply = apply;
  }

  setSunDirectionProvider(fn: (utc: UtcString) => Vec3): void {
    this.provider = fn;
    this.refresh();
  }

  setSimulationTime(utc: UtcString): void {
    this.utc = utc;
    this.refresh();
  }

  getSimulationTime(): UtcString | null {
    return this.utc;
  }

  /** Ignora direcciones no finitas o nulas y errores del proveedor. */
  private refresh(): void {
    if (this.provider === null || this.utc === null) return;
    let d: Vec3;
    try {
      d = this.provider(this.utc);
    } catch {
      return;
    }
    if (!Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.z)) return;
    if (d.x === 0 && d.y === 0 && d.z === 0) return;
    this.apply(d);
  }
}
