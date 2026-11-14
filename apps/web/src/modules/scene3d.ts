import type { UtcString, Vec3 } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';

function getContainer(): HTMLElement {
  const existing = document.getElementById('scene');
  if (existing) return existing;
  const div = document.createElement('div');
  div.id = 'scene';
  div.className = 'ln-scene';
  (document.getElementById('app') ?? document.body).prepend(div);
  return div;
}

/** ME (+X Tierra media, +Y este, +Z polo norte) a escena (+Y norte, lon 0 hacia +Z, este hacia +X). */
function meToScene(me: Vec3): Vec3 {
  return { x: me.y, y: me.z, z: me.x };
}

/**
 * Proveedor de direccion en la escena a partir de un servicio ME. Se consulta de forma perezosa:
 * el orden de registro de modulos no importa.
 */
function provider(get: () => ((utc: string) => Vec3) | undefined, fallback: Vec3): (utc: UtcString) => Vec3 {
  return (utc: UtcString): Vec3 => {
    const fn = get();
    return fn ? meToScene(fn(utc)) : fallback;
  };
}

export const scene3dModule: WebModule = {
  id: 'scene3d',
  async setup(ctx: WebContext): Promise<void> {
    const container = getContainer();
    const { createScene, WEBGL2_FALLBACK_MESSAGE, detectWebGL2 } = await import('@lunar/scene3d');
    if (!detectWebGL2()) {
      container.textContent = WEBGL2_FALLBACK_MESSAGE;
      container.classList.add('ln-scene--fallback');
      return;
    }
    let scene: ReturnType<typeof createScene>;
    try {
      scene = createScene(container);
    } catch {
      container.textContent = WEBGL2_FALLBACK_MESSAGE;
      container.classList.add('ln-scene--fallback');
      return;
    }
    scene.setSunDirectionProvider(provider(() => ctx.services.sunDirection, { x: 0, y: 0, z: 1 }));
    scene.setEarthDirectionProvider(provider(() => ctx.services.earthDirection, { x: 0, y: 0, z: 1 }));
    const time = ctx.services.time;
    if (time) {
      scene.setSimulationTime(time.getUtc());
      time.onChange((utc) => scene.setSimulationTime(utc));
    }
    ctx.services.scene = scene;
  },
};

export default scene3dModule;
