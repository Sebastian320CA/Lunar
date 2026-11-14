# Modulo scene3d

Escena 3D (Three.js) de la Luna y la Tierra. Implementa `SceneApi` de `@lunar/contracts`.

## API publica (`packages/scene3d/src/index.ts`)

`createScene(container, opts?)` agrega un `<canvas>` a `container` y devuelve `SceneApi & { dispose(), debug(on), missingAssets() }`.
Lanza `Error(WEBGL2_FALLBACK_MESSAGE)` si no hay WebGL2 (usar `detectWebGL2()` antes para mostrar el mensaje con `textContent`).

Opciones: `assets`, `mobile`, `durations` (ms por modo), `landing` (`{latDeg, lonDeg}`), `initialMode`, `rig`.

Tambien se exportan `SceneCore`, `AssetLoader`, `ModeMachine`, `CameraRig`, `FocusAnimator`, `MarkerLayer`, `SunController`, `latLonToVec3`.

### Conexion interna
- `SceneCore.onFrame`: `CameraRig.update`, `FocusAnimator.update`, direccion solar y atenuacion del fondo.
- `MarkerLayer` cuelga de `moonGroup`. Puntero (toque corto), flechas/Tab/Enter/espacio en el canvas.
- Elegir un marcador en modo `map` o `site` gira la Luna (`moonGroup`) hasta dejar el sitio hacia la camara (+Z) y pasa a `site`.
- En `site` la Tierra se atenua (opacidad hasta 0.25).
- La direccion solar se da en el marco de la Luna y se rota con `moonGroup` al aplicarla a la luz.

## Registro en la app
`apps/web/src/modules/scene3d.ts`: import dinamico de `@lunar/scene3d`, crea la escena en `#scene` (o un div nuevo) y fija `ctx.services.scene`.
Si falta WebGL2 muestra `WEBGL2_FALLBACK_MESSAGE` con `textContent` y no registra el servicio.
La direccion del Sol sale de `ctx.services.sunDirection` (`sunDirectionMoonFixed` de `@lunar/ephemeris`, consultado en cada llamada) y la hora de `ctx.services.time`.
Mapeo de marcos: ME (+X hacia la Tierra media, +Y este, +Z polo norte) a escena (+Y norte, lon 0 hacia +Z, este hacia +X): `scene = (x: me.y, y: me.z, z: me.x)`, igual que `latLonToVec3`.

## Como probar
- `pnpm --filter @lunar/scene3d test`
- `pnpm --filter @lunar/scene3d build`
- Visual: `pnpm --filter @lunar/web dev`, recorrer los cinco modos.

## PENDIENTE
- **Orientacion de texturas y GLB**: la convencion de `latLonToVec3` (+Y norte, lon 0 hacia +Z, este hacia +X) y el mapeo UV de `SphereGeometry` no se han confirmado visualmente contra las texturas de la Luna y la Tierra. Verificar con sitios conocidos (p. ej. Apollo 11) y ajustar con una rotacion fija en `moon`/`earth`. Lo mismo para los GLB. Fuente: captura PNG de la escena.
- **`landingPose` y direccion de la Tierra**: `landingPose` apunta a la Tierra en posicion fija (0, 0, -EARTH_DISTANCE) en el marco de la Luna sin rotar. Si `moonGroup` esta rotado (tras `site` o `focusMoonOn`), el aterrizaje no mira a la Tierra real. Corregir convirtiendo la posicion de la Tierra al marco local de la Luna. Tampoco se verifica que la Tierra quede sobre el horizonte del sitio (en la cara lejana no lo esta).

## Limites conocidos
- La direccion solar es asincrona: el primer frame usa un valor por defecto hasta que llega `getSky`.
- Transiciones invalidas de `setMode` se ignoran sin error.

## Solicitudes al contrato
Ninguna.
