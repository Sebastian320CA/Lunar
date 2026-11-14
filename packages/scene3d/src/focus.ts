import { Quaternion, Vector3, type Object3D } from 'three';
import { latLonToVec3 } from './math.js';
import { smoothstep, type Clock } from './modes.js';

export const DEFAULT_FOCUS_MS = 1000;

/** Eje que mira hacia la camara (la camara de la escena esta en +Z). */
export const CAMERA_FACING_AXIS: Readonly<Vector3> = new Vector3(0, 0, 1);

/** Valida lat (-90..90) y Longitud_Canonica (-180, 180]. */
export function validateFocusTarget(lat: number, lon: number): { ok: true } | { ok: false; error: string } {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return { ok: false, error: 'lat fuera de rango (-90 a 90).' };
  if (!Number.isFinite(lon) || lon <= -180 || lon > 180) return { ok: false, error: 'lon fuera de rango (-180, 180].' };
  return { ok: true };
}

/** Rotacion que lleva el punto (lat, lon) del cuerpo al eje que mira hacia la camara. */
export function focusRotation(lat: number, lon: number): Quaternion {
  return new Quaternion().setFromUnitVectors(latLonToVec3(lat, lon, 1).normalize(), CAMERA_FACING_AXIS as Vector3);
}

/** Normaliza `ms`: entero >= 0, por defecto 1000. */
export function normalizeMs(ms: number | undefined): number {
  if (ms === undefined || !Number.isFinite(ms)) return DEFAULT_FOCUS_MS;
  return Math.max(0, Math.round(ms));
}

interface Tween {
  target: Object3D;
  from: Quaternion;
  to: Quaternion;
  startMs: number;
  durationMs: number;
}

/** Anima la rotacion de la Luna o la Tierra con reloj inyectable. */
export class FocusAnimator {
  private readonly tweens = new Map<Object3D, Tween>();

  private readonly clock: Clock;

  constructor(clock: Clock = () => performance.now()) {
    this.clock = clock;
  }

  /** Devuelve false (sin cambios) si lat/lon no son validos. */
  focus(target: Object3D, lat: number, lon: number, ms?: number): boolean {
    if (!validateFocusTarget(lat, lon).ok) return false;
    const to = focusRotation(lat, lon);
    const durationMs = normalizeMs(ms);
    if (durationMs === 0) {
      this.tweens.delete(target);
      target.quaternion.copy(to);
      return true;
    }
    this.tweens.set(target, { target, from: target.quaternion.clone(), to, startMs: this.clock(), durationMs });
    return true;
  }

  isAnimating(): boolean {
    return this.tweens.size > 0;
  }

  /** Llamar cada frame. */
  update(): void {
    const now = this.clock();
    for (const [key, tw] of this.tweens) {
      const raw = (now - tw.startMs) / tw.durationMs;
      if (raw >= 1) {
        tw.target.quaternion.copy(tw.to);
        this.tweens.delete(key);
      } else {
        tw.target.quaternion.copy(tw.from).slerp(tw.to, smoothstep(raw));
      }
    }
  }
}
