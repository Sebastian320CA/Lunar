# Reglas para todos los modulos

- Stack: TypeScript estricto, Vite, Three.js, pnpm workspaces, vitest. Sin otras librerias sin justificarlas.
- Solo se modifica el propio paquete en packages/<modulo>. Los tipos viven en packages/contracts y no se cambian; las necesidades se anotan como "Solicitud al contrato".
- Offline primero: nada de red en runtime ni CDN. Datos desde /data y /public/assets.
- Toda entrada del usuario pasa por packages/security. Prohibido eval, new Function e innerHTML con datos del usuario.
- Modelos 3D: solo GLB cargados desde public/assets/manifest.json.
- No inventar datos cientificos ni coordenadas: lo no verificado se marca PENDIENTE con su fuente.
- Marca: sin logo oficial de la NASA. Texto: "Inspirado en NASA Space Apps - No avalado por la NASA".
- Cada paquete exporta su API en src/index.ts, trae pruebas y documenta en docs/MODULO-<nombre>.md.