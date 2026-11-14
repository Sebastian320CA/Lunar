import * as THREE from 'three';
import type { BodyState, EnergyResult, SolarPanelViewApi } from '@lunar/contracts';
import { computeOrientation } from './orientation';

/** Minimal renderer surface used by the view (lets tests inject a mock). */
export interface SolarViewRenderer {
  readonly domElement: HTMLElement;
  setPixelRatio(ratio: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export interface SolarPanelViewOptions {
  /** Renderer factory; defaults to THREE.WebGLRenderer. */
  createRenderer?: () => SolarViewRenderer;
  /** Max device pixel ratio (mobile cap). Default 2. */
  maxPixelRatio?: number;
  /** Deploy animation duration in seconds. Default 1.5. */
  deploySeconds?: number;
}

export const SOLAR_METHOD_IDS = ['fixed', 'single-axis', 'dual-axis', 'vertical'] as const;

const DEG = Math.PI / 180;

function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

/** Creates the 3D solar panel view (procedural placeholder geometry). */
export function createSolarPanelView(options: SolarPanelViewOptions = {}): SolarPanelViewApi {
  const maxPixelRatio = options.maxPixelRatio ?? 2;
  const deploySeconds = Math.max(0.01, options.deploySeconds ?? 1.5);

  let disposed = false;
  let container: HTMLElement | null = null;
  let renderer: SolarViewRenderer | null = null;
  let observer: IntersectionObserver | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let rafId: number | null = null;
  let visible = true;
  let deploy = 0;
  let lastTime = 0;
  let pending: { result: EnergyResult; sun: BodyState } | null = null;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 1, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));

  // Ground, pole, hinge and panel (nodes named "hinge" and "panel").
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(4, 48),
    new THREE.MeshStandardMaterial({ color: 0x777777 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 1, 12),
    new THREE.MeshStandardMaterial({ color: 0x999999 }),
  );
  pole.position.y = 0.5;
  scene.add(pole);

  const hinge = new THREE.Group();
  hinge.name = 'hinge';
  hinge.position.y = 1;
  scene.add(hinge);

  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.05, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x1a3a7a }),
  );
  panel.name = 'panel';
  hinge.add(panel);

  // Light ray (from the Sun toward the hinge).
  const rayGroup = new THREE.Group();
  const rayMat = new THREE.LineBasicMaterial({ color: 0xffd54a });
  const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
  const ray = new THREE.Line(rayGeo, rayMat);
  rayGroup.add(ray);
  rayGroup.position.copy(hinge.position);
  scene.add(rayGroup);

  // Elevation indicator arc in the vertical plane of the Sun.
  const arcMat = new THREE.LineBasicMaterial({ color: 0x4ad0ff });
  const arcGeo = new THREE.BufferGeometry();
  const arc = new THREE.Line(arcGeo, arcMat);
  arc.position.set(0, 0.02, 0);
  scene.add(arc);

  // 3D compass: ring on the ground with a north needle.
  const compass = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(2.8, 2.9, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = -Math.PI / 2;
  compass.add(ring);
  const north = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }));
  north.position.set(0, 0.05, -2.85); // north = -z
  north.rotation.x = -Math.PI / 2;
  compass.add(north);
  compass.position.y = 0.01;
  scene.add(compass);

  const sunMarker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffd54a }));
  scene.add(sunMarker);

  function applyOrientation(result: EnergyResult, sun: BodyState): void {
    const o = computeOrientation(result, sun);
    const n = new THREE.Vector3(o.normal.x, o.normal.y, o.normal.z);
    hinge.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);

    const dir = new THREE.Vector3(o.rayDirection.x, o.rayDirection.y, o.rayDirection.z);
    const len = 3;
    rayGroup.position.copy(hinge.position).addScaledVector(dir, len);
    rayGroup.lookAt(hinge.position);
    rayGroup.scale.set(1, 1, len);
    sunMarker.position.copy(rayGroup.position);

    // Arc from horizon to the Sun elevation, in the plane of the Sun azimuth.
    const az = o.compassHeadingDeg * DEG;
    const horiz = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));
    const el = o.elevationIndicatorDeg * DEG;
    const pts: THREE.Vector3[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const a = (el * i) / steps;
      pts.push(new THREE.Vector3(horiz.x * Math.cos(a) * 1.5, Math.sin(a) * 1.5, horiz.z * Math.cos(a) * 1.5));
    }
    arcGeo.setFromPoints(pts);
  }

  function renderFrame(): void {
    if (!renderer) return;
    renderer.render(scene, camera);
  }

  function tick(time: number): void {
    rafId = null;
    if (disposed || !renderer || !visible) return;
    const dt = lastTime ? Math.min(0.1, (time - lastTime) / 1000) : 0;
    lastTime = time;
    if (deploy < 1) deploy = Math.min(1, deploy + dt / deploySeconds);
    const eased = deploy * deploy * (3 - 2 * deploy);
    panel.scale.set(Math.max(eased, 0.001), 1, Math.max(eased, 0.001));
    renderFrame();
    schedule();
  }

  function schedule(): void {
    if (disposed || rafId !== null || !visible || typeof requestAnimationFrame !== 'function') return;
    rafId = requestAnimationFrame(tick);
  }

  function resize(): void {
    if (!container || !renderer) return;
    const w = Math.max(1, container.clientWidth || 300);
    const h = Math.max(1, container.clientHeight || 200);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  return {
    mount(el: HTMLElement): void {
      if (disposed || renderer) return;
      container = el;
      renderer = options.createRenderer
        ? options.createRenderer()
        : (new THREE.WebGLRenderer({ antialias: true, alpha: true }) as unknown as SolarViewRenderer);
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      renderer.setPixelRatio(Math.min(dpr, maxPixelRatio));
      el.appendChild(renderer.domElement);
      resize();
      if (pending) applyOrientation(pending.result, pending.sun);
      if (typeof IntersectionObserver !== 'undefined') {
        observer = new IntersectionObserver((entries) => {
          const last = entries[entries.length - 1];
          visible = last ? last.isIntersecting : true;
          if (visible) {
            lastTime = 0;
            schedule();
          }
        });
        observer.observe(el);
      }
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resize());
        resizeObserver.observe(el);
      }
      renderFrame();
      schedule();
    },

    update(result: EnergyResult, sun: BodyState): void {
      if (disposed) return;
      pending = { result, sun };
      if (!renderer) return;
      applyOrientation(result, sun);
      renderFrame();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      if (rafId !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);
      rafId = null;
      observer?.disconnect();
      resizeObserver?.disconnect();
      observer = null;
      resizeObserver = null;
      disposeObject(scene);
      if (renderer) {
        const dom = renderer.domElement;
        dom.parentNode?.removeChild(dom);
        renderer.dispose();
      }
      renderer = null;
      container = null;
      pending = null;
      scene.clear();
    },
  };
}
