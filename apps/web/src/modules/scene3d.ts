import type { UtcString, Vec3 } from '@lunar/contracts';
import type { WebContext, WebModule } from './context';

function getContainer(): HTMLElement {
  const existing = document.getElementById('scene');
  if (existing) return existing;
  const div = document.createElement('div');
  div.id = 'scene';
  div.style.cssText = 'position:fixed;inset:0;';
  (document.getElementById('app') ?? document.body).prepend(div);
  return div;
}

/**
 * Direccion del Sol en la escena. El servicio de efemerides entrega el vector en el marco ME
 * (+X Tierra media, +Y este, +Z polo norte); la escena usa +Y norte, lon 0 hacia +Z, este hacia +X.
 * Se consulta de forma perezosa: el orden de registro de modulos no importa.
 */
function createSunProvider(ctx: WebContext): (utc: UtcString) => Vec3 {
  return (utc: UtcString): Vec3 => {
    const fn = ctx.services.sunDirection;
    if (!fn) return { x: 0, y: 0, z: 1 };
    const me = fn(utc);
    return { x: me.y, y: me.z, z: me.x };
  };
}

export const scene3dModule: WebModule = {
  id: 'scene3d',
  async setup(ctx: WebContext): Promise<void> {
    const container = getContainer();
    const { createScene, WEBGL2_FALLBACK_MESSAGE, detectWebGL2 } = await import('@lunar/scene3d');
    if (!detectWebGL2()) {
      container.textContent = WEBGL2_FALLBACK_MESSAGE;
      return;
    }
    let scene: ReturnType<typeof createScene>;
    try {
      scene = createScene(container);
    } catch {
      container.textContent = WEBGL2_FALLBACK_MESSAGE;
      return;
    }
    scene.setSunDirectionProvider(createSunProvider(ctx));
    const time = ctx.services.time;
    if (time) {
      scene.setSimulationTime(time.getUtc());
      time.onChange((utc) => scene.setSimulationTime(utc));
    }
    ctx.services.scene = scene;
  },
};

export default scene3dModule;
