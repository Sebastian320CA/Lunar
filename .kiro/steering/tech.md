---
inclusion: always
---
# Tecnologia

- TypeScript estricto, Vite, Three.js, pnpm workspaces, vitest. No agregar librerias sin justificarlo.
- Offline primero: en runtime no hay llamadas de red. Datos desde /data y /public/assets.
- Toda entrada del usuario pasa por packages/security (zod, Result<T>). Prohibido eval, new Function, innerHTML con datos del usuario.
- CSP estricta, dependencias con version exacta y lockfile, pnpm audit en CI.
- Los contratos de packages/contracts no se cambian sin documentar la decision en docs/INTEGRACION.md.
- Cada paquete expone su API en src/index.ts y tiene pruebas.