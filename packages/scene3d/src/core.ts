import {
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { AssetLoader } from './assets.js';

export const MOON_RADIUS = 1;
export const EARTH_RADIUS = 3.67; // relacion radio Tierra/Luna ~3.67
export const EARTH_DISTANCE = 60; // distancia en unidades de escena (no a escala)

export interface SceneCoreOptions {
  assets?: AssetLoader;
  mobile?: boolean;
}

/** True si el contexto WebGL2 esta disponible. */
export function detectWebGL2(doc: Document = document): boolean {
  try {
    return doc.createElement('canvas').getContext('webgl2') !== null;
  } catch {
    return false;
  }
}

export function isMobile(nav: Pick<Navigator, 'userAgent'> | undefined = globalThis.navigator): boolean {
  return nav !== undefined && /Android|iPhone|iPad|iPod|Mobile/i.test(nav.userAgent);
}

export const WEBGL2_FALLBACK_MESSAGE =
  'Tu navegador o equipo no soporta WebGL2, necesario para la vista 3D. Actualiza el navegador o los controladores graficos.';

/** Renderer, escena, camara, Luna, Tierra y luz solar. */
export class SceneCore {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly moon: Mesh;
  readonly earth: Mesh;
  readonly sun = new DirectionalLight(0xffffff, 3);
  readonly moonGroup = new Group();
  readonly earthGroup = new Group();
  readonly assets: AssetLoader;
  fps = 0;
  debugEnabled = false;
  onFrame: ((dtSec: number) => void) | null = null;

  private rafId = 0;
  private running = false;
  private paused = false;
  private lastTime = 0;
  private frames = 0;
  private fpsStart = 0;
  private resizeObserver: ResizeObserver | null = null;
  private readonly onBlur = (): void => this.pause();
  private readonly onFocus = (): void => this.resume();
  private disposed = false;

  readonly canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, options: SceneCoreOptions = {}) {
    this.canvas = canvas;
    if (!detectWebGL2(canvas.ownerDocument)) throw new Error(WEBGL2_FALLBACK_MESSAGE);
    const mobile = options.mobile ?? isMobile();
    this.assets = options.assets ?? new AssetLoader();
    this.renderer = new WebGLRenderer({ canvas, antialias: !mobile, alpha: false });
    const ratio = globalThis.devicePixelRatio ?? 1;
    this.renderer.setPixelRatio(mobile ? Math.min(ratio, 1) : Math.min(ratio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.assets.detectKtx2Support(this.renderer);

    this.camera = new PerspectiveCamera(50, 1, 0.01, 2000);
    this.camera.position.set(0, 0, 4);

    this.moon = new Mesh(
      new SphereGeometry(MOON_RADIUS, mobile ? 32 : 64, mobile ? 24 : 48),
      new MeshStandardMaterial({ color: 0xaaaaaa }),
    );
    this.earth = new Mesh(
      new SphereGeometry(EARTH_RADIUS, mobile ? 32 : 64, mobile ? 24 : 48),
      new MeshStandardMaterial({ color: 0x3060a0 }),
    );
    this.moonGroup.add(this.moon);
    this.earthGroup.add(this.earth);
    this.earthGroup.position.set(0, 0, -EARTH_DISTANCE);
    this.scene.add(this.moonGroup, this.earthGroup, new AmbientLight(0xffffff, 0.05));
    this.sun.position.set(5, 0, 5);
    this.scene.add(this.sun, this.sun.target);

    this.resize();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
    }
    globalThis.addEventListener?.('blur', this.onBlur);
    globalThis.addEventListener?.('focus', this.onFocus);
  }

  /** Aplica las texturas del manifest (si faltan se queda el color base). */
  async applyTextures(): Promise<void> {
    const [moonColor, moonHeight, earthColor] = await Promise.all([
      this.assets.loadTexture('moon-color'),
      this.assets.loadTexture('moon-height'),
      this.assets.loadTexture('earth-color'),
    ]);
    if (this.disposed) return;
    const moonMat = this.moon.material as MeshStandardMaterial;
    const earthMat = this.earth.material as MeshStandardMaterial;
    if (moonColor !== null) this.setColorMap(moonMat, moonColor);
    if (moonHeight !== null) {
      moonMat.bumpMap = moonHeight;
      moonMat.bumpScale = 0.5;
      moonMat.needsUpdate = true;
    }
    if (earthColor !== null) this.setColorMap(earthMat, earthColor);
  }

  private setColorMap(mat: MeshStandardMaterial, tex: Texture): void {
    tex.colorSpace = SRGBColorSpace;
    mat.map = tex;
    mat.color.set(0xffffff);
    mat.needsUpdate = true;
  }

  /** Direccion hacia el Sol (no necesita estar normalizada). */
  setSunDirection(dir: Vector3): void {
    const d = dir.clone();
    if (d.lengthSq() === 0) return;
    this.sun.position.copy(d.normalize().multiplyScalar(100));
  }

  resize(): void {
    const w = this.canvas.clientWidth || this.canvas.width || 1;
    const h = this.canvas.clientHeight || this.canvas.height || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.paused = false;
    this.lastTime = performance.now();
    this.fpsStart = this.lastTime;
    this.frames = 0;
    this.rafId = requestAnimationFrame(this.loop);
  }

  pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.rafId);
  }

  resume(): void {
    if (!this.running || !this.paused || this.disposed) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.loop);
  }

  isPaused(): boolean {
    return this.paused;
  }

  setDebug(on: boolean): void {
    this.debugEnabled = on;
  }

  private readonly loop = (now: number): void => {
    if (this.paused || this.disposed) return;
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.onFrame?.(dt);
    this.renderer.render(this.scene, this.camera);
    this.frames++;
    if (now - this.fpsStart >= 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsStart);
      this.frames = 0;
      this.fpsStart = now;
      if (this.debugEnabled) console.debug(`[scene3d] ${this.fps.toFixed(1)} FPS`);
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.rafId);
    globalThis.removeEventListener?.('blur', this.onBlur);
    globalThis.removeEventListener?.('focus', this.onFocus);
    this.resizeObserver?.disconnect();
    this.scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          for (const v of Object.values(m)) {
            if (v !== null && typeof v === 'object' && 'isTexture' in v) (v as Texture).dispose();
          }
          m.dispose();
        }
      }
    });
    this.assets.dispose();
    this.renderer.dispose();
  }
}
