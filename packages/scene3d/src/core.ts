import {
  AdditiveBlending,
  AmbientLight,
  Box3,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
  SRGBColorSpace,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { AssetLoader } from './assets.js';

export const MOON_RADIUS = 1;
export const EARTH_RADIUS = 3.67; // relacion radio Tierra/Luna ~3.67
export const EARTH_DISTANCE = 60; // distancia en unidades de escena (no a escala)

/** Ids de los modelos GLB de la Luna y la Tierra en el manifiesto. */
export const MOON_MODEL_ID = 'moon-glb';
export const EARTH_MODEL_ID = 'earth-glb';

/**
 * Rotacion que lleva los GLB (esferas con cube-map, radio 500) a la convencion de `latLonToVec3`
 * (+Y norte, lon 0 hacia +Z, este hacia +X). Calibrada ajustando rasgos conocidos de la textura:
 * Luna: Mare Crisium, Copernico, Aristarco, Grimaldi y Orientale (error ~2 grados);
 * Tierra: Cabo de Hornos, Dakar, Cabo Leeuwin y lago Michigan (error 1-6 grados).
 */
export const MOON_MODEL_ROTATION: Readonly<Quaternion> = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2);
export const EARTH_MODEL_ROTATION: Readonly<Quaternion> = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

const STAR_COUNT = 3500;
const STAR_RADIUS = 900;
const SUN_GLOW_DISTANCE = 800;

/** PRNG determinista (mulberry32) para el fondo de estrellas decorativo. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fondo de estrellas decorativo (no es un catalogo estelar). */
export function createStarfield(count = STAR_COUNT, radius = STAR_RADIUS): Points {
  const rnd = mulberry32(20260101);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const c = new Color();
  for (let i = 0; i < count; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = radius * r * Math.cos(th);
    pos[i * 3 + 1] = radius * u;
    pos[i * 3 + 2] = radius * r * Math.sin(th);
    const b = 0.35 + 0.65 * Math.pow(rnd(), 3);
    c.setHSL(0.58 + (rnd() - 0.5) * 0.15, 0.25, b);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  const points = new Points(g, new PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false }));
  points.name = 'stars';
  points.renderOrder = -1;
  return points;
}

/** Halo del Sol dibujado en un canvas (sin descargas). Devuelve null si no hay canvas 2D. */
function createSunGlow(doc: Document): Sprite | null {
  const canvas = doc.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,245,1)');
  g.addColorStop(0.12, 'rgba(255,250,220,0.95)');
  g.addColorStop(0.3, 'rgba(255,220,150,0.35)');
  g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
  sprite.scale.set(70, 70, 1);
  sprite.name = 'sun-glow';
  return sprite;
}

/** Escala un modelo para que su mayor dimension sea `2*radius`, centrado en el origen, y lo orienta. */
export function fitModel(model: Object3D, radius: number, rotation: Readonly<Quaternion>): void {
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const max = Math.max(size.x, size.y, size.z);
  if (!(max > 0)) return;
  const center = box.getCenter(new Vector3());
  for (const child of model.children) child.position.sub(center);
  model.scale.setScalar((2 * radius) / max);
  model.quaternion.copy(rotation as Quaternion);
}

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
  readonly stars: Points;
  readonly sunGlow: Sprite | null;
  readonly assets: AssetLoader;
  /** Materiales de la Tierra (esfera o GLB) para atenuarla en el modo `site`. */
  earthMaterials: Material[] = [];
  /** Ids de los GLB aplicados (moon-glb, earth-glb). */
  readonly modelsApplied = new Set<string>();
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
    this.renderer = new WebGLRenderer({ canvas, antialias: !mobile, alpha: false, logarithmicDepthBuffer: true });
    const ratio = globalThis.devicePixelRatio ?? 1;
    this.renderer.setPixelRatio(mobile ? Math.min(ratio, 1) : Math.min(ratio, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 1);
    this.assets.detectKtx2Support(this.renderer);

    this.camera = new PerspectiveCamera(50, 1, 0.001, 2000);
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
    this.earthMaterials = [this.earth.material as Material];
    this.stars = createStarfield();
    this.sunGlow = createSunGlow(canvas.ownerDocument);
    this.scene.add(this.stars, this.moonGroup, this.earthGroup, new AmbientLight(0xb8c4ff, 0.06));
    this.sun.position.set(5, 0, 5);
    this.scene.add(this.sun, this.sun.target);
    if (this.sunGlow) {
      this.sunGlow.position.copy(this.sun.position).normalize().multiplyScalar(SUN_GLOW_DISTANCE);
      this.scene.add(this.sunGlow);
    }

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

  /**
   * Sustituye las esferas por los GLB del manifiesto (moon-glb, earth-glb) si estan disponibles.
   * Si un GLB falta, se queda la esfera (con textura si existe).
   */
  async applyModels(): Promise<void> {
    const [moon, earth] = await Promise.all([
      this.assets.loadModel(MOON_MODEL_ID),
      this.assets.loadModel(EARTH_MODEL_ID),
    ]);
    if (this.disposed) return;
    if (moon.userData['placeholder'] !== true) {
      fitModel(moon, MOON_RADIUS, MOON_MODEL_ROTATION);
      moon.name = MOON_MODEL_ID;
      this.moon.visible = false;
      this.moonGroup.add(moon);
      this.modelsApplied.add(MOON_MODEL_ID);
    }
    if (earth.userData['placeholder'] !== true) {
      fitModel(earth, EARTH_RADIUS, EARTH_MODEL_ROTATION);
      earth.name = EARTH_MODEL_ID;
      this.earth.visible = false;
      this.earthGroup.add(earth);
      const mats: Material[] = [];
      earth.traverse((o) => {
        const m = (o as Mesh).material;
        if ((o as Mesh).isMesh && m) mats.push(...(Array.isArray(m) ? m : [m]));
      });
      this.earthMaterials = mats;
      this.modelsApplied.add(EARTH_MODEL_ID);
    }
  }

  /** Opacidad 0..1 de la Tierra (atenuacion en `site`). */
  setEarthOpacity(opacity: number): void {
    for (const m of this.earthMaterials) {
      const t = opacity < 1;
      if (m.transparent !== t) {
        m.transparent = t;
        m.needsUpdate = true;
      }
      m.opacity = opacity;
    }
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
    this.sunGlow?.position.copy(d).multiplyScalar(SUN_GLOW_DISTANCE);
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
