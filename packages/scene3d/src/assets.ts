import {
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TextureLoader,
  type Object3D,
  type Texture,
} from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { ManifestSchema, type Manifest } from '@lunar/contracts';

export const ASSETS_BASE = '/assets/';
export const DRACO_PATH = `${ASSETS_BASE}decoders/draco/`;
export const KTX2_PATH = `${ASSETS_BASE}decoders/basis/`;

export interface AssetLoaderOptions {
  base?: string;
  fetchFn?: typeof fetch;
}

/** Esfera gris marcada como placeholder para un asset ausente. */
export function createPlaceholder(id: string): Mesh {
  const mesh = new Mesh(
    new SphereGeometry(1, 16, 12),
    new MeshStandardMaterial({ color: 0x888888, wireframe: true }),
  );
  mesh.name = `placeholder:${id}`;
  mesh.userData['placeholder'] = true;
  return mesh;
}

/** Carga el manifest y los assets con cache; lo que falta se sustituye por Placeholder y se lista. */
export class AssetLoader {
  private readonly base: string;
  private readonly fetchFn: typeof fetch;
  private manifest: Manifest | null = null;
  private manifestPromise: Promise<Manifest | null> | null = null;
  private readonly modelCache = new Map<string, Promise<Object3D>>();
  private readonly textureCache = new Map<string, Promise<Texture | null>>();
  private readonly missing = new Set<string>();
  private gltf: GLTFLoader | null = null;
  private ktx2: KTX2Loader | null = null;
  private draco: DRACOLoader | null = null;

  constructor(options: AssetLoaderOptions = {}) {
    this.base = options.base ?? ASSETS_BASE;
    this.fetchFn = options.fetchFn ?? ((...args) => fetch(...args));
  }

  /** Ids de assets que no se pudieron cargar. */
  missingAssets(): string[] {
    return [...this.missing];
  }

  loadManifest(): Promise<Manifest | null> {
    this.manifestPromise ??= this.readManifest();
    return this.manifestPromise;
  }

  private async readManifest(): Promise<Manifest | null> {
    try {
      const res = await this.fetchFn(`${this.base}manifest.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = ManifestSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error('manifest invalido');
      this.manifest = parsed.data;
      return parsed.data;
    } catch {
      this.missing.add('manifest');
      return null;
    }
  }

  /** Devuelve una copia del modelo (clonada de la cache) o un Placeholder si falta. */
  async loadModel(id: string): Promise<Object3D> {
    let pending = this.modelCache.get(id);
    if (pending === undefined) {
      pending = this.fetchModel(id);
      this.modelCache.set(id, pending);
    }
    const source = await pending;
    return source.userData['placeholder'] === true ? createPlaceholder(id) : source.clone(true);
  }

  private async fetchModel(id: string): Promise<Object3D> {
    const manifest = await this.loadManifest();
    const entry = manifest?.models?.find((m) => m.id === id);
    if (entry === undefined) {
      this.missing.add(id);
      return createPlaceholder(id);
    }
    try {
      const gltf = await this.getGltfLoader().loadAsync(encodeURI(`${this.base}${entry.path}`));
      const group = new Group();
      group.name = id;
      group.add(gltf.scene);
      return group;
    } catch {
      this.missing.add(id);
      return createPlaceholder(id);
    }
  }

  /** Textura del manifest o `null` si falta (se lista como ausente). */
  loadTexture(id: string): Promise<Texture | null> {
    let pending = this.textureCache.get(id);
    if (pending === undefined) {
      pending = this.fetchTexture(id);
      this.textureCache.set(id, pending);
    }
    return pending;
  }

  private async fetchTexture(id: string): Promise<Texture | null> {
    const manifest = await this.loadManifest();
    const entry = manifest?.textures?.find((t) => t.id === id);
    if (entry === undefined) {
      this.missing.add(id);
      return null;
    }
    try {
      return await new TextureLoader().loadAsync(encodeURI(`${this.base}${entry.path}`));
    } catch {
      this.missing.add(id);
      return null;
    }
  }

  private getGltfLoader(): GLTFLoader {
    if (this.gltf === null) {
      this.draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
      this.ktx2 = new KTX2Loader().setTranscoderPath(KTX2_PATH);
      this.gltf = new GLTFLoader()
        .setDRACOLoader(this.draco)
        .setKTX2Loader(this.ktx2)
        .setMeshoptDecoder(MeshoptDecoder);
      // Las texturas embebidas en el GLB se exponen como URL blob:. ImageBitmapLoader las pide con
      // fetch(), que la CSP (connect-src 'self') bloquea; TextureLoader usa <img> (img-src permite blob:).
      this.gltf.register((parser) => {
        parser.textureLoader = new TextureLoader(parser.options.manager);
        return { name: 'lunar_img_textures' };
      });
    }
    return this.gltf;
  }

  /** Enlaza el renderer para detectar soporte KTX2. */
  detectKtx2Support(renderer: Parameters<KTX2Loader['detectSupport']>[0]): void {
    this.getGltfLoader();
    this.ktx2?.detectSupport(renderer);
  }

  dispose(): void {
    this.draco?.dispose();
    this.ktx2?.dispose();
    this.gltf = this.draco = this.ktx2 = null;
    this.modelCache.clear();
    this.textureCache.clear();
    this.manifest = null;
    this.manifestPromise = null;
  }
}
