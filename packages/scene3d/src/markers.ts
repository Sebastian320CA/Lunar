import type { LunarSite, Program, ScreenAnchor, Unsubscribe } from '@lunar/contracts';
import {
  Group,
  Mesh,
  MeshBasicMaterial,
  Raycaster,
  SphereGeometry,
  Vector2,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { MOON_RADIUS } from './core.js';
import { latLonToVec3 } from './math.js';

export const PROGRAM_COLORS: Readonly<Record<Program, number>> = {
  apollo: 0xffd24a,
  clps: 0x4ac8ff,
  commercial: 0xff7a4a,
  international: 0x7aff7a,
  custom: 0xd58aff,
};

const MARKER_RADIUS = 0.02;

export interface MarkerLayerOptions {
  /** Tamano del lienzo en pixeles. */
  getSize: () => { width: number; height: number };
  /** Grupo que rota con la Luna; la camara se transforma a su espacio local para la visibilidad. */
  parent: Group;
}

/** Marcadores de sitios sobre la Luna: seleccion por puntero y teclado, y anclas de pantalla. */
export class MarkerLayer {
  readonly group = new Group();
  private readonly meshes = new Map<string, Mesh>();
  private readonly order: string[] = [];
  private readonly listeners = new Set<(siteId: string) => void>();
  private readonly raycaster = new Raycaster();
  private focusIdx = -1;

  private readonly camera: PerspectiveCamera;
  private readonly options: MarkerLayerOptions;

  constructor(camera: PerspectiveCamera, options: MarkerLayerOptions) {
    this.camera = camera;
    this.options = options;
    options.parent.add(this.group);
  }

  setSiteMarkers(sites: readonly LunarSite[]): void {
    for (const m of this.meshes.values()) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    this.group.clear();
    this.meshes.clear();
    this.order.length = 0;
    this.focusIdx = -1;
    for (const s of sites) {
      if (this.meshes.has(s.id)) continue;
      const mesh = new Mesh(
        new SphereGeometry(MARKER_RADIUS, 12, 8),
        new MeshBasicMaterial({ color: PROGRAM_COLORS[s.program] ?? PROGRAM_COLORS.custom }),
      );
      mesh.position.copy(latLonToVec3(s.latDeg, s.lonDeg, MOON_RADIUS * 1.005));
      mesh.userData['siteId'] = s.id;
      this.group.add(mesh);
      this.meshes.set(s.id, mesh);
      this.order.push(s.id);
    }
  }

  getSiteIds(): readonly string[] {
    return this.order;
  }

  colorOf(id: string): number | null {
    const m = this.meshes.get(id);
    return m === undefined ? null : (m.material as MeshBasicMaterial).color.getHex();
  }

  onSiteSelected(cb: (siteId: string) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private emit(id: string): void {
    for (const l of [...this.listeners]) l(id);
  }

  /** Visible: del lado de la Luna que mira a la camara y dentro del encuadre. */
  private isVisible(mesh: Mesh): boolean {
    this.group.updateWorldMatrix(true, false);
    mesh.updateWorldMatrix(true, false);
    const world = mesh.getWorldPosition(new Vector3());
    const center = this.options.parent.getWorldPosition(new Vector3());
    const normal = world.clone().sub(center).normalize();
    const toCam = this.camera.position.clone().sub(world);
    if (normal.dot(toCam) <= 0) return false;
    const ndc = world.clone().project(this.camera);
    return ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
  }

  /** Pixeles del sitio, o null si el id es desconocido o el sitio no es visible. */
  getSiteScreenAnchor(id: string): ScreenAnchor | null {
    const mesh = this.meshes.get(id);
    if (mesh === undefined) return null;
    this.camera.updateMatrixWorld();
    if (!this.isVisible(mesh)) return null;
    const { width, height } = this.options.getSize();
    const ndc = mesh.getWorldPosition(new Vector3()).project(this.camera);
    return { xPx: ((ndc.x + 1) / 2) * width, yPx: ((1 - ndc.y) / 2) * height };
  }

  /** Seleccion por puntero (pixeles del lienzo). Devuelve el id elegido o null. */
  pickAt(xPx: number, yPx: number): string | null {
    const { width, height } = this.options.getSize();
    if (width <= 0 || height <= 0) return null;
    this.camera.updateMatrixWorld();
    this.options.parent.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new Vector2((xPx / width) * 2 - 1, -(yPx / height) * 2 + 1), this.camera);
    const hits = this.raycaster.intersectObjects([...this.meshes.values()], false);
    for (const h of hits) {
      const id = h.object.userData['siteId'] as string;
      const mesh = this.meshes.get(id);
      if (mesh !== undefined && this.isVisible(mesh)) {
        this.emit(id);
        return id;
      }
    }
    return null;
  }

  /** Teclado: mueve el foco entre marcadores (+1 siguiente, -1 anterior). Devuelve el id enfocado. */
  moveFocus(step: 1 | -1): string | null {
    const n = this.order.length;
    if (n === 0) return null;
    this.focusIdx = this.focusIdx < 0 ? (step === 1 ? 0 : n - 1) : (this.focusIdx + step + n) % n;
    return this.order[this.focusIdx] ?? null;
  }

  /** Teclado: confirma el marcador enfocado (Enter o espacio). */
  activateFocused(): string | null {
    const id = this.focusIdx >= 0 ? (this.order[this.focusIdx] ?? null) : null;
    if (id !== null) this.emit(id);
    return id;
  }

  focusedId(): string | null {
    return this.focusIdx >= 0 ? (this.order[this.focusIdx] ?? null) : null;
  }

  /** Interpreta una tecla; devuelve true si la consumio. */
  handleKey(key: string): boolean {
    if (key === 'ArrowRight' || key === 'ArrowDown' || key === 'Tab') return this.moveFocus(1) !== null;
    if (key === 'ArrowLeft' || key === 'ArrowUp') return this.moveFocus(-1) !== null;
    if (key === 'Enter' || key === ' ') return this.activateFocused() !== null;
    return false;
  }

  dispose(): void {
    this.setSiteMarkers([]);
    this.listeners.clear();
    this.options.parent.remove(this.group);
  }
}
