import type { LunarSite, SceneApi, SceneMode, UtcString, Unsubscribe, Vec3 } from '@lunar/contracts';
import { Vector3 } from 'three';
import type { AssetLoader } from './assets.js';
import { EARTH_DISTANCE, EARTH_RADIUS, SceneCore } from './core.js';
import { FocusAnimator } from './focus.js';
import { MarkerLayer } from './markers.js';
import {
  DEFAULT_ORBIT_LIMITS,
  CameraRig,
  ModeMachine,
  canTransition,
  type CameraRigOptions,
  type ModeDurations,
} from './modes.js';
import { SunController } from './sun.js';

export * from './math.js';
export * from './assets.js';
export * from './core.js';
export * from './focus.js';
export * from './markers.js';
export * from './modes.js';
export * from './sun.js';
export * from './atmosphere.js';

export interface CreateSceneOptions {
  assets?: AssetLoader;
  mobile?: boolean;
  /** Duraciones (ms) de las transiciones por modo. */
  durations?: Partial<ModeDurations>;
  /** Punto de aterrizaje del modo `landing`. */
  landing?: { latDeg: number; lonDeg: number };
  /** Modo inicial; por defecto `intro`. */
  initialMode?: SceneMode;
  rig?: CameraRigOptions;
}

export interface SceneHandle extends SceneApi {
  dispose(): void;
  debug(on: boolean): void;
  missingAssets(): string[];
  /** Gira la Luna para mostrar el sitio de frente y pasa a `site` (desde cualquier modo). */
  focusSite(siteId: string): void;
  /** Vista en primera persona desde el sitio (modo `landing`). */
  landAt(siteId: string): void;
  /** Resalta un marcador (null quita el resalte). */
  setSelectedSite(siteId: string | null): void;
  /** Modo estable actual. */
  getMode(): SceneMode;
  /** Notifica el modo destino al empezar cada transicion. */
  onModeChange(cb: (mode: SceneMode) => void): Unsubscribe;
  /** Direccion unitaria de la Tierra en el marco de la Luna (escena) para `utc`. */
  setEarthDirectionProvider(fn: (utc: UtcString) => Vec3): void;
  /** Acerca (negativo) o aleja (positivo) la camara en `free`/`map`. */
  zoom(delta: number): void;
  /** Gira la orbita (radianes) en `free`/`map`. */
  orbitBy(dAzimuth: number, dPolar: number): void;
  /** Vuela hasta la Tierra y orbita a su alrededor (modo `free`, centro en la Tierra). */
  viewEarth(): void;
  /** Vuelve a orbitar la Luna (modo `free`). */
  viewMoon(): void;
  /** Cuerpo en el centro de la orbita libre. */
  getFocusBody(): 'moon' | 'earth';
}

/** Distancia minima de la camara al centro de la Tierra en su vista orbital. */
const EARTH_MIN_RADIUS = EARTH_RADIUS * 1.35;
const EARTH_VIEW_RADIUS = EARTH_RADIUS * 3.4;

const TAP_MAX_MOVE_PX = 5;
const EARTH_DIM_MIN_OPACITY = 0.25;

/**
 * Crea la escena dentro de `container` (agrega un canvas). Lanza Error con
 * WEBGL2_FALLBACK_MESSAGE si no hay WebGL2.
 */
export function createScene(container: HTMLElement, opts: CreateSceneOptions = {}): SceneHandle {
  const canvas = container.ownerDocument.createElement('canvas');
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.tabIndex = 0;
  canvas.setAttribute('role', 'application');
  canvas.setAttribute('aria-label', 'Escena 3D de la Luna y la Tierra');
  container.appendChild(canvas);

  let core: SceneCore;
  try {
    core = new SceneCore(canvas, {
      ...(opts.assets !== undefined ? { assets: opts.assets } : {}),
      ...(opts.mobile !== undefined ? { mobile: opts.mobile } : {}),
    });
  } catch (e) {
    canvas.remove();
    throw e;
  }

  const machine = new ModeMachine(undefined, opts.durations, opts.initialMode ?? 'intro');
  // Direccion media de la Tierra en el marco de la Luna (+Z local = longitud 0); el proveedor la refina.
  const earthLocal = new Vector3(0, 0, 1);
  const visualEarth = new Vector3(0, 0, -EARTH_DISTANCE);
  const physicalEarth = (): Vector3 =>
    earthLocal.clone().normalize().multiplyScalar(EARTH_DISTANCE).applyQuaternion(core.moonGroup.quaternion);
  const rig = new CameraRig(machine, core.camera, {
    ...opts.rig,
    ...(opts.landing !== undefined ? { landing: opts.landing } : {}),
    landingFrame: () => ({ quaternion: core.moonGroup.quaternion.clone(), earthWorld: physicalEarth() }),
  });
  const focus = new FocusAnimator();
  const markers = new MarkerLayer(core.camera, {
    parent: core.moonGroup,
    getSize: () => ({ width: canvas.clientWidth, height: canvas.clientHeight }),
  });
  const sites = new Map<string, LunarSite>();

  // La direccion solar llega en el marco de la Luna; se rota con ella para la luz.
  const bodyDir = new Vector3(5, 0, 5).normalize();
  const sunController = new SunController((d: Vec3) => {
    bodyDir.set(d.x, d.y, d.z);
  });
  let earthProvider: ((utc: UtcString) => Vec3) | null = null;
  const refreshEarth = (): void => {
    const utc = sunController.getSimulationTime();
    if (earthProvider === null || utc === null) return;
    try {
      const d = earthProvider(utc);
      if ([d.x, d.y, d.z].every(Number.isFinite) && (d.x !== 0 || d.y !== 0 || d.z !== 0)) earthLocal.set(d.x, d.y, d.z);
    } catch {
      /* fuera de cobertura: se conserva la ultima direccion */
    }
  };

  core.onFrame = (dt: number): void => {
    focus.update();
    core.moonGroup.updateMatrixWorld();
    const landingW = machine.modeWeight('landing');
    core.earthGroup.position.copy(visualEarth).lerp(physicalEarth(), landingW);
    if (focusBody === 'earth') rig.orbitCenter.copy(core.earthGroup.position);
    rig.update(dt);
    markers.group.visible = landingW < 0.5;
    core.setSunDirection(bodyDir.clone().applyQuaternion(core.moonGroup.quaternion));
    const dim = machine.backgroundDim();
    core.setEarthOpacity(1 - (1 - EARTH_DIM_MIN_OPACITY) * dim);
    core.updateAtmosphere();
  };

  /** Sitio que se mostrara al terminar la transicion intermedia (por ejemplo intro -> map -> site). */
  let pendingSite: string | null = null;
  const goToSite = (site: LunarSite): void => {
    rig.siteTarget = { latDeg: 0, lonDeg: 0 }; // la Luna gira para dejar el sitio en +Z
    focus.focus(core.moonGroup, site.latDeg, site.lonDeg, machine.getDuration('site'));
    machine.transitionTo('site');
  };
  const selectSite = (id: string): void => {
    const site = sites.get(id);
    if (site === undefined) return;
    focusMoonOrbit();
    markers.setHighlighted(id);
    const from = machine.isTransitioning() ? null : machine.mode;
    if (from !== null && canTransition(from, 'site')) {
      pendingSite = null;
      goToSite(site);
      return;
    }
    // En plena transicion o desde intro: se pasa por `map` y se continua al terminar.
    pendingSite = id;
    if (!machine.isTransitioning() || !canTransition(machine.mode, 'site')) machine.transitionTo('map');
  };
  const unsubPending = machine.onChange((e) => {
    if (e.type !== 'end' || pendingSite === null) return;
    const site = sites.get(pendingSite);
    pendingSite = null;
    if (site !== undefined && canTransition(machine.mode, 'site')) goToSite(site);
  });
  const landAt = (id: string): void => {
    const site = sites.get(id);
    if (site === undefined) return;
    pendingSite = null;
    focusMoonOrbit();
    markers.setHighlighted(id);
    rig.landing = { latDeg: site.latDeg, lonDeg: site.lonDeg };
    if (!canTransition(machine.mode, 'landing')) machine.transitionTo('free');
    machine.transitionTo('landing');
  };
  let focusBody: 'moon' | 'earth' = 'moon';
  const focusMoonOrbit = (): void => {
    if (focusBody === 'moon') return;
    focusBody = 'moon';
    rig.orbitCenter.set(0, 0, 0);
    rig.orbit.limits.minRadius = DEFAULT_ORBIT_LIMITS.minRadius;
    rig.orbit.limits.maxRadius = DEFAULT_ORBIT_LIMITS.maxRadius;
  };
  const unsubMarkers = markers.onSiteSelected(selectSite);

  // Puntero: toque corto selecciona, arrastre orbita, rueda hace zoom.
  let down: { x: number; y: number; id: number } | null = null;
  let last = { x: 0, y: 0 };
  const onPointerDown = (e: PointerEvent): void => {
    down = { x: e.clientX, y: e.clientY, id: e.pointerId };
    last = { x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (down === null || (machine.mode !== 'free' && machine.mode !== 'map')) return;
    rig.orbit.impulse(-(e.clientX - last.x) * 0.02, -(e.clientY - last.y) * 0.02, 0);
    last = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = (e: PointerEvent): void => {
    const d = down;
    down = null;
    if (d === null) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MAX_MOVE_PX) return;
    const rect = canvas.getBoundingClientRect();
    markers.pickAt(e.clientX - rect.left, e.clientY - rect.top);
  };
  const onWheel = (e: WheelEvent): void => {
    if (machine.mode !== 'free' && machine.mode !== 'map') return;
    e.preventDefault();
    rig.orbit.impulse(0, 0, e.deltaY * 0.01);
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (markers.handleKey(e.key)) e.preventDefault();
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('keydown', onKeyDown);

  core
    .applyModels()
    .catch(() => undefined)
    .then(() => (core.modelsApplied.size < 2 ? core.applyTextures() : undefined))
    .catch(() => undefined);
  core.start();

  let disposed = false;
  return {
    setMode(mode: SceneMode): void {
      machine.transitionTo(mode);
    },
    focusMoonOn(lat: number, lon: number, ms?: number): void {
      focus.focus(core.moonGroup, lat, lon, ms);
    },
    focusEarthOn(lat: number, lon: number, ms?: number): void {
      focus.focus(core.earthGroup, lat, lon, ms);
    },
    setSiteMarkers(list: LunarSite[]): void {
      sites.clear();
      for (const s of list) sites.set(s.id, s);
      markers.setSiteMarkers(list);
    },
    onSiteSelected(cb: (siteId: string) => void): Unsubscribe {
      return markers.onSiteSelected(cb);
    },
    getSiteScreenAnchor(id: string) {
      return markers.getSiteScreenAnchor(id);
    },
    setSimulationTime(utc: UtcString): void {
      sunController.setSimulationTime(utc);
      refreshEarth();
    },
    setSunDirectionProvider(fn: (utc: UtcString) => Vec3): void {
      sunController.setSunDirectionProvider(fn);
    },
    focusSite(siteId: string): void {
      selectSite(siteId);
    },
    landAt,
    setSelectedSite(siteId: string | null): void {
      markers.setHighlighted(siteId);
    },
    getMode(): SceneMode {
      return machine.mode;
    },
    viewEarth(): void {
      pendingSite = null;
      markers.setHighlighted(null);
      focusBody = 'earth';
      rig.orbit.limits.minRadius = EARTH_MIN_RADIUS;
      rig.orbit.limits.maxRadius = 80;
      // Camara del lado iluminado, un poco hacia la Luna para que se vea al fondo, y algo elevada.
      const sunW = core.sun.position.clone().normalize();
      const toMoon = visualEarth.clone().negate().normalize();
      const offset = sunW.multiplyScalar(0.9).add(toMoon.multiplyScalar(0.55)).add(new Vector3(0, 0.3, 0));
      if (offset.lengthSq() < 1e-6) offset.set(0, 0.3, 1);
      rig.orbit.setFromPosition(offset.normalize().multiplyScalar(EARTH_VIEW_RADIUS));
      if (!canTransition(machine.mode, 'free')) machine.transitionTo('free');
      machine.transitionTo('free');
    },
    viewMoon(): void {
      pendingSite = null;
      const wasEarth = focusBody === 'earth';
      focusMoonOrbit();
      if (wasEarth) rig.orbit.setFromPosition(new Vector3(2.4, 1.2, 5.2));
      machine.transitionTo('free');
    },
    getFocusBody(): 'moon' | 'earth' {
      return focusBody;
    },
    onModeChange(cb: (mode: SceneMode) => void): Unsubscribe {
      return machine.onChange((e) => {
        if (e.type === 'start') cb(e.to);
        else if (e.type === 'cancel') cb(e.from);
      });
    },
    setEarthDirectionProvider(fn: (utc: UtcString) => Vec3): void {
      earthProvider = fn;
      refreshEarth();
    },
    zoom(delta: number): void {
      if (machine.mode !== 'free' && machine.mode !== 'map') return;
      if (Number.isFinite(delta)) rig.orbit.impulse(0, 0, delta);
    },
    orbitBy(dAzimuth: number, dPolar: number): void {
      if (machine.mode !== 'free' && machine.mode !== 'map') return;
      if (Number.isFinite(dAzimuth) && Number.isFinite(dPolar)) rig.orbit.impulse(dAzimuth, dPolar, 0);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubMarkers();
      unsubPending();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('keydown', onKeyDown);
      core.onFrame = null;
      markers.dispose();
      core.dispose();
      canvas.remove();
    },
    debug(on: boolean): void {
      core.setDebug(on);
    },
    missingAssets(): string[] {
      return core.assets.missingAssets();
    },
  };
}
