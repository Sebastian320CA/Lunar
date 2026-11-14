# Lunar Landing Site Navigator

App offline para comparar sitios de alunizaje y fechas: posición del Sol y la Tierra respecto al horizonte, energía solar, ventanas de comunicación, PDF, 13 idiomas, escena 3D y modo educativo.

Inspirado en NASA Space Apps - No avalado por la NASA.

## Requisitos
- Node.js 22 y pnpm (vía `corepack enable`).

## Uso
```bash
pnpm install
pnpm --filter @lunar/web dev        # desarrollo (modo demo) en http://localhost:5173
pnpm build                          # tipos de todos los paquetes + build de producción en apps/web/dist
pnpm --filter @lunar/web exec vite preview   # sirve apps/web/dist
pnpm test && pnpm lint              # pruebas y lint
```

## Estructura
- `apps/web`: Shell que monta los módulos (`src/modules/*`) y la interfaz (`src/shell`).
- `packages/*`: un paquete por módulo; su API está en `docs/MODULO-<nombre>.md`.
- `data/`: efemérides SPICE precalculadas (2025-2030) y catálogo de sitios.
- `public/assets/`: modelos GLB y su `manifest.json`.

Datos pendientes (DEM, sitios Artemis, texturas, audio, licencias): `docs/RECURSOS-PENDIENTES.md`.
