# Módulo edu-games

Paquete `@lunar/edu-games`: tres minijuegos de canvas, cada uno con su propio punto de entrada (Requisito 8.4).

| Entrada | Archivo | Qué enseña |
|---|---|---|
| `projectileGame` | `projectile.ts`, `physics.ts` | Gravedad lunar 1.62 m/s² frente a la terrestre 9.80665 m/s², sin arrastre. Mismo disparo: alcance y tiempo de vuelo unas 6 veces mayores en la Luna. |
| `blocksGame` | `blocks.ts` | Empaquetado de carga con límites de masa y volumen. Los valores (`CELL_MASS_KG`, `MAX_MASS_KG`, tamaño de bodega) son ejemplos editables, no datos de un módulo real. |
| `explorerGame` | `explorer.ts` | La energía solo se recarga con el Sol sobre el horizonte del terreno y con la Tierra visible. Las tasas son ejemplos editables. |

Cada entrada es `{ id, mount(container, options) }` y `mount` devuelve un objeto con `destroy()`.

## Uso

```ts
import { projectileGame, blocksGame, explorerGame } from '@lunar/edu-games';

const h = projectileGame.mount(el, { compareEarth: true });
explorerGame.mount(el, { ephemeris, site, startUtc }); // EphemerisService inyectado
h.destroy();
```

## Controles

- Proyectil: flechas ajustan, Espacio/Enter dispara, E alterna comparación con la Tierra, L pantalla "lo que aprendiste".
- Bloques: flechas mueven, Arriba o X rota, Espacio caída rápida, R reinicia, L aprendizaje.
- Explorador: flechas mueven, R reinicia, L aprendizaje.

## Puntaje

Mejor puntaje local en `localStorage`, protegido con try/catch (si no está disponible, el juego sigue sin guardar).

## Registro en la web

`apps/web/src/modules/edu-games.ts` registra una pestaña `edu-games` con un selector de juego. Cada juego se carga con `import()` dinámico al elegirlo. El explorador obtiene `ephemeris` de `ctx.services` en ese momento; si falta, muestra un mensaje de error.

## Pruebas

`pnpm --filter @lunar/edu-games test`: alcance y tiempo de vuelo en forma cerrada, relación Luna/Tierra ≈ 6, colisiones y líneas completas, y explorador con `EphemerisService` simulado.
