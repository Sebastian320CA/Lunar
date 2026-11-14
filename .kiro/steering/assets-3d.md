---
inclusion: always
---
# Assets 3D y texturas

- Solo GLB. Se cargan unicamente desde public/assets/manifest.json.
- NUNCA generes, edites ni reemplaces modelos 3D. Los pone el equipo. Si falta uno, usa un placeholder y reportalo.
- No puedes ver un GLB. Para conocerlo ejecuta: npx @gltf-transform/cli inspect <archivo.glb> y lee nodos, mallas y materiales.
- Antes de integrar ejecuta tools/validate-assets.ps1 y corrige el manifest o el codigo del cargador, nunca el modelo.
- Modelos de mas de 15 MB o texturas de mas de 4096 px: avisa y propone optimizacion (meshopt, KTX2, WebP).
- Cada asset lleva su credito en el manifest y se muestra en "Acerca de".