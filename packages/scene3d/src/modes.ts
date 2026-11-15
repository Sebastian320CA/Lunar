import { PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { EARTH_DISTANCE, MOON_RADIUS } from './core.js';
import { latLonToVec3 } from './math.js';

export type SceneMode = 'intro' | 'landing' | 'free' | 'map' | 'site';

export const SCENE_MODES: readonly SceneMode[] = ['intro', 'landing', 'free', 'map', 'site'];

/**
 * Transiciones validas (site -> site cubre elegir otro sitio y landing -> landing cambiar de sitio).
 * Desde `intro` no se salta directo a `site`: primero hay que llegar a la Luna.
 */
export const MODE_TRANSITIONS: Readonly<Record<SceneMode, readonly SceneMode[]>> = {
  intro: ['landing', 'free', 'map'],
  landing: ['landing', 'free', 'map', 'site'],
  free: ['free', 'landing', 'map', 'intro', 'site'],
  map: ['free', 'site', 'landing'],
  site: ['site', 'map', 'free', 'landing'],
};

/** Duracion (ms) de la transicion que ENTRA a cada modo. */
export type ModeDurations = Readonly<Record<SceneMode, number>>;

export const DEFAULT_DURATIONS: ModeDurations = {
  intro: 6000,
  landing: 4000,
  free: 2500,
  map: 1500,
  site: 1800,
};

export type Clock = () => number;

export interface ActiveTransition {
  from: SceneMode;
  to: SceneMode;
  /** 0..1 con suavizado. */
  progress: number;
}

export type ModeListener = (event: { type: 'start' | 'end' | 'cancel'; from: SceneMode; to: SceneMode }) => void;

export function canTransition(from: SceneMode, to: SceneMode): boolean {
  return MODE_TRANSITIONS[from].includes(to);
}

export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Maquina de estados pura: sin Three.js ni DOM, con reloj inyectable. */
export class ModeMachine {
  private current: SceneMode;
  private active: { from: SceneMode; to: SceneMode; startMs: number; durationMs: number } | null = null;
  private readonly durations: Record<SceneMode, number>;
  private readonly listeners = new Set<ModeListener>();

  private readonly clock: Clock;

  constructor(
    clock: Clock = () => performance.now(),
    durations: Partial<ModeDurations> = {},
    initial: SceneMode = 'intro',
  ) {
    this.clock = clock;
    this.durations = { ...DEFAULT_DURATIONS, ...durations };
    this.current = initial;
  }

  /** Ultimo modo estable (el origen mientras hay transicion). */
  get mode(): SceneMode {
    return this.current;
  }

  setDuration(mode: SceneMode, ms: number): void {
    this.durations[mode] = Math.max(0, ms);
  }

  getDuration(mode: SceneMode): number {
    return this.durations[mode];
  }

  onChange(listener: ModeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Inicia una transicion. Si hay una en curso, se cancela y se parte desde el origen actual. */
  transitionTo(target: SceneMode): { ok: true } | { ok: false; error: string } {
    const from = this.active !== null ? this.active.from : this.current;
    if (!canTransition(from, target)) return { ok: false, error: `Transicion no valida: ${from} -> ${target}` };
    if (this.active !== null) this.cancel();
    const durationMs = this.durations[target];
    if (durationMs <= 0) {
      this.current = target;
      this.emit('start', from, target);
      this.emit('end', from, target);
      return { ok: true };
    }
    this.active = { from, to: target, startMs: this.clock(), durationMs };
    this.emit('start', from, target);
    return { ok: true };
  }

  /** Cancela la transicion en curso y vuelve al modo de origen. */
  cancel(): boolean {
    if (this.active === null) return false;
    const { from, to } = this.active;
    this.active = null;
    this.emit('cancel', from, to);
    return true;
  }

  /** Avanza segun el reloj; devuelve la transicion activa (o null). */
  update(): ActiveTransition | null {
    const a = this.active;
    if (a === null) return null;
    const raw = (this.clock() - a.startMs) / a.durationMs;
    if (raw >= 1) {
      this.active = null;
      this.current = a.to;
      this.emit('end', a.from, a.to);
      return null;
    }
    return { from: a.from, to: a.to, progress: smoothstep(raw) };
  }

  isTransitioning(): boolean {
    return this.active !== null;
  }

  /** Atenuacion del fondo 0..1: 1 en `site`, interpolada al entrar o salir. */
  backgroundDim(): number {
    return this.modeWeight('site');
  }

  /** Peso 0..1 de `mode`: 1 si es el modo estable, interpolado durante la transicion que entra o sale. */
  modeWeight(mode: SceneMode): number {
    const a = this.update();
    if (a === null) return this.current === mode ? 1 : 0;
    const f = a.from === mode ? 1 : 0;
    const t = a.to === mode ? 1 : 0;
    return f + (t - f) * a.progress;
  }

  private emit(type: 'start' | 'end' | 'cancel', from: SceneMode, to: SceneMode): void {
    for (const l of this.listeners) l({ type, from, to });
  }
}

// ---------- Camara ----------

export interface CameraPose {
  position: Vector3;
  target: Vector3;
  /** Vector "arriba" de la camara; por defecto +Y. En `landing` es la normal local del suelo. */
  up?: Vector3;
  /** Campo de vision vertical en grados; por defecto el de la camara (50). */
  fov?: number;
}

export const DEFAULT_FOV_DEG = 50;
export const LANDING_FOV_DEG = 100;
const WORLD_UP = new Vector3(0, 1, 0);

export function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const up = (a.up ?? WORLD_UP).clone().lerp(b.up ?? WORLD_UP, t);
  if (up.lengthSq() < 1e-8) up.copy(b.up ?? WORLD_UP);
  const fa = a.fov ?? DEFAULT_FOV_DEG;
  const fb = b.fov ?? DEFAULT_FOV_DEG;
  return {
    position: a.position.clone().lerp(b.position, t),
    target: a.target.clone().lerp(b.target, t),
    up: up.normalize(),
    fov: fa + (fb - fa) * t,
  };
}

export interface OrbitLimits {
  minRadius: number;
  maxRadius: number;
  minPolar: number;
  maxPolar: number;
  /** Fraccion de velocidad que se conserva por segundo (0..1); menor = mas amortiguacion. */
  damping: number;
}

export const DEFAULT_ORBIT_LIMITS: OrbitLimits = {
  minRadius: 1.5 * MOON_RADIUS,
  maxRadius: 40,
  minPolar: 0.1,
  maxPolar: Math.PI - 0.1,
  damping: 0.02,
};

/** Orbita esferica alrededor del origen (Luna) con limites e inercia. */
export class OrbitState {
  azimuth = 0;
  polar = Math.PI / 2;
  radius = 4;
  private vAz = 0;
  private vPolar = 0;
  private vRadius = 0;

  readonly limits: OrbitLimits;

  constructor(limits: OrbitLimits = DEFAULT_ORBIT_LIMITS) {
    this.limits = { ...limits };
  }

  /** Aplica un impulso (rad/s y unidades/s). */
  impulse(dAz: number, dPolar: number, dRadius: number): void {
    this.vAz += dAz;
    this.vPolar += dPolar;
    this.vRadius += dRadius;
  }

  step(dtSec: number): void {
    const { minRadius, maxRadius, minPolar, maxPolar, damping } = this.limits;
    this.azimuth += this.vAz * dtSec;
    this.polar = Math.min(maxPolar, Math.max(minPolar, this.polar + this.vPolar * dtSec));
    this.radius = Math.min(maxRadius, Math.max(minRadius, this.radius + this.vRadius * dtSec));
    const k = Math.pow(damping, dtSec);
    this.vAz *= k;
    this.vPolar *= k;
    this.vRadius *= k;
    if (this.polar === minPolar || this.polar === maxPolar) this.vPolar = 0;
    if (this.radius === minRadius || this.radius === maxRadius) this.vRadius = 0;
  }

  position(): Vector3 {
    const s = Math.sin(this.polar);
    return new Vector3(this.radius * s * Math.sin(this.azimuth), this.radius * Math.cos(this.polar), this.radius * s * Math.cos(this.azimuth));
  }

  setFromPosition(p: Vector3): void {
    this.radius = Math.min(this.limits.maxRadius, Math.max(this.limits.minRadius, p.length()));
    this.polar = Math.min(this.limits.maxPolar, Math.max(this.limits.minPolar, Math.acos(p.y / (p.length() || 1))));
    this.azimuth = Math.atan2(p.x, p.z);
    this.vAz = this.vPolar = this.vRadius = 0;
  }
}

/** Marco para el modo `landing`: orientacion actual de la Luna y posicion fisica de la Tierra (mundo). */
export interface LandingFrame {
  quaternion: Quaternion;
  earthWorld: Vector3;
}

const DEG = Math.PI / 180;

/**
 * Primera persona sobre la superficie. La camara usa la normal local como "arriba" y mira hacia el
 * acimut de la Tierra, levantando la vista para que entren el horizonte y (si esta alta) la Tierra.
 * Sin `frame` se asume la Luna sin rotar y la Tierra media en +Z local (longitud 0).
 */
export function landingPose(latDeg: number, lonDeg: number, eyeHeight = 0.002, frame?: LandingFrame): CameraPose {
  const q = frame?.quaternion ?? new Quaternion();
  const earth = frame?.earthWorld ?? new Vector3(0, 0, EARTH_DISTANCE).applyQuaternion(q);
  const normal = latLonToVec3(latDeg, lonDeg, 1).applyQuaternion(q).normalize();
  const position = normal.clone().multiplyScalar(MOON_RADIUS + eyeHeight);
  const toEarth = earth.clone().sub(position).normalize();
  const sinEl = toEarth.dot(normal);
  const tangent = toEarth.clone().sub(normal.clone().multiplyScalar(sinEl));
  if (tangent.lengthSq() < 1e-8) {
    tangent.crossVectors(normal, Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0));
  }
  tangent.normalize();
  const elev = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  // Con FOV 100 la vista cubre de look-50 a look+50 grados: entra el suelo y la Tierra hasta ~70 grados.
  const look = elev > 0 ? Math.min(20 * DEG, Math.max(0, elev - 46 * DEG)) : 0;
  const dir = tangent.multiplyScalar(Math.cos(look)).add(normal.clone().multiplyScalar(Math.sin(look)));
  return { position, target: position.clone().add(dir), up: normal, fov: LANDING_FOV_DEG };
}

/** Vista del sitio de frente, a `distance` del centro de la Luna. */
export function sitePose(latDeg: number, lonDeg: number, distance = 2.6): CameraPose {
  return { position: latLonToVec3(latDeg, lonDeg, distance), target: new Vector3() };
}

export interface CameraRigOptions {
  landing?: { latDeg: number; lonDeg: number };
  introStart?: CameraPose;
  introEnd?: CameraPose;
  limits?: OrbitLimits;
  /** Orientacion de la Luna y posicion fisica de la Tierra para `landing`. */
  landingFrame?: () => LandingFrame;
  /** Reloj en ms (para el vuelo inicial de `intro`). */
  clock?: Clock;
}

/** Pose inicial del vuelo de `intro`: mas alla de la Tierra, mirando hacia la Luna. */
export const DEFAULT_INTRO_START: CameraPose = {
  position: new Vector3(9, 5, -84),
  target: new Vector3(0, 0, -20),
};
/** Pose final de `intro`: la Luna en primer plano y la Tierra visible a un lado. */
export const DEFAULT_INTRO_END: CameraPose = {
  position: new Vector3(3.2, 1.0, 4.2),
  target: new Vector3(-0.9, -0.15, -2.5),
};

/** Aplica poses a la camara segun la maquina de estados. */
export class CameraRig {
  readonly orbit: OrbitState;
  landing: { latDeg: number; lonDeg: number };
  siteTarget: { latDeg: number; lonDeg: number } | null = null;
  /** Centro de la orbita en `free`/`map` (la Luna por defecto; la Tierra en la vista de la Tierra). */
  readonly orbitCenter = new Vector3();
  private readonly introStart: CameraPose;
  private readonly introEnd: CameraPose;
  private startPose: CameraPose;
  private lastMode: SceneMode;
  private lastTarget: SceneMode | null = null;
  private readonly look = new Vector3();
  private readonly landingFrame: (() => LandingFrame) | undefined;
  private readonly clock: Clock;
  private readonly introT0: number;

  readonly machine: ModeMachine;
  readonly camera: PerspectiveCamera;

  constructor(machine: ModeMachine, camera: PerspectiveCamera, options: CameraRigOptions = {}) {
    this.machine = machine;
    this.camera = camera;
    this.orbit = new OrbitState(options.limits);
    this.landing = options.landing ?? { latDeg: 0, lonDeg: 0 };
    this.introStart = options.introStart ?? DEFAULT_INTRO_START;
    this.introEnd = options.introEnd ?? DEFAULT_INTRO_END;
    this.landingFrame = options.landingFrame;
    this.clock = options.clock ?? (() => performance.now());
    this.introT0 = this.clock();
    this.orbit.setFromPosition(this.introEnd.position);
    if (machine.mode === 'intro') this.apply(this.introStart);
    this.startPose = this.currentPose();
    this.lastMode = machine.mode;
  }

  currentPose(): CameraPose {
    return {
      position: this.camera.position.clone(),
      target: this.look.clone(),
      up: this.camera.up.clone(),
      fov: this.camera.fov,
    };
  }

  /** Progreso 0..1 del vuelo inicial de `intro`. */
  introProgress(): number {
    const d = this.machine.getDuration('intro');
    return d <= 0 ? 1 : Math.min(1, Math.max(0, (this.clock() - this.introT0) / d));
  }

  /** Pose estable de un modo. */
  poseFor(mode: SceneMode): CameraPose {
    switch (mode) {
      case 'intro':
        return this.introStart;
      case 'landing':
        return landingPose(this.landing.latDeg, this.landing.lonDeg, undefined, this.landingFrame?.());
      case 'site':
        return this.siteTarget !== null ? sitePose(this.siteTarget.latDeg, this.siteTarget.lonDeg) : this.orbitPose();
      case 'map':
      case 'free':
        return this.orbitPose();
    }
  }

  private orbitPose(): CameraPose {
    return { position: this.orbit.position().add(this.orbitCenter), target: this.orbitCenter.clone() };
  }

  /** Llamar cada frame. */
  update(dtSec: number): void {
    const a = this.machine.update();
    const mode = this.machine.mode;
    if (a !== null) {
      if (this.lastTarget !== a.to || this.lastMode !== mode) {
        // inicio (o reinicio tras cancelar): partir de la pose real actual
        this.startPose = this.currentPose();
        this.lastTarget = a.to;
        this.lastMode = mode;
      }
      const end = a.to === 'intro' ? this.introEnd : this.poseFor(a.to);
      this.apply(lerpPose(this.startPose, end, a.progress));
      return;
    }
    this.lastTarget = null;
    this.lastMode = mode;
    if (mode === 'free' || mode === 'map') {
      this.orbit.step(dtSec);
      this.apply(this.orbitPose());
    } else if (mode === 'intro') {
      this.apply(lerpPose(this.introStart, this.introEnd, smoothstep(this.introProgress())));
    } else {
      this.apply(this.poseFor(mode));
    }
    if (mode !== 'free' && mode !== 'map') {
      const rel = this.camera.position.clone().sub(this.orbitCenter);
      this.orbit.setFromPosition(rel.lengthSq() > 4 ? rel : this.introEnd.position);
    }
  }

  private apply(pose: CameraPose): void {
    this.camera.position.copy(pose.position);
    this.look.copy(pose.target);
    this.camera.up.copy(pose.up ?? WORLD_UP);
    this.camera.lookAt(pose.target);
    const fov = pose.fov ?? DEFAULT_FOV_DEG;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
