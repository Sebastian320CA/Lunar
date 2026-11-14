import type { LunarSite, SceneApi, SceneMode, UtcString, Unsubscribe, Vec3 } from '@lunar/contracts';
import { MeshStandardMaterial, Vector3 } from 'three';
import type { AssetLoader } from './assets.js';
import { SceneCore } from './core.js';
import { FocusAnimator } from './focus.js';
import { MarkerLayer } from './markers.js';
import {
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
}

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
  const rig = new CameraRig(machine, core.camera, {
    ...opts.rig,
    ...(opts.landing !== undefined ? { landing: opts.landing } : {}),
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
  const earthMat = core.earth.material as MeshStandardMaterial;

  core.onFrame = (dt: number): void => {
    rig.update(dt);
    focus.update();
    core.moonGroup.updateMatrixWorld();
    core.setSunDirection(bodyDir.clone().applyQuaternion(core.moonGroup.quaternion));
    const dim = machine.backgroundDim();
    earthMat.transparent = dim > 0;
    earthMat.opacity = 1 - (1 - EARTH_DIM_MIN_OPACITY) * dim;
  };

  const selectSite = (id: string): void => {
    const site = sites.get(id);
    if (site === undefined) return;
    if (!canTransition(machine.mode, 'site')) return;
    rig.siteTarget = { latDeg: 0, lonDeg: 0 }; // la Luna gira para dejar el sitio en +Z
    focus.focus(core.moonGroup, site.latDeg, site.lonDeg, machine.getDuration('site'));
    machine.transitionTo('site');
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

  core.applyTextures().catch(() => undefined);
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
    },
    setSunDirectionProvider(fn: (utc: UtcString) => Vec3): void {
      sunController.setSunDirectionProvider(fn);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      unsubMarkers();
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
