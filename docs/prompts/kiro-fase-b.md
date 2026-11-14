# Fase B (pegar en Kiro, modo Spec, cuando los modulos ya esten en el repo)

Spec "integracion": une todos los modulos en apps/web. Lee antes .kiro/steering, docs/MODULO-*.md, docs/INTEGRACION.md y docs/SEGURIDAD.md.
1. Compila en modo estricto, corre pruebas, lint y pnpm audit; corrige.
2. Ejecuta tu los scripts Python de tools/ephemeris-data y tools/terrain-data (descargas y validaciones) y reporta errores y cifras reales; no inventes resultados.
3. Cablea: efemerides y terreno con las vistas y la escena (setSunDirectionProvider); i18n con focusEarthOn (espanol centra Colombia); pestanas de sitios, energia y comparacion con el panel; SolarPanelViewApi dentro de la pestana de energia; exportacion con las graficas.
4. Assets: ejecuta npx @gltf-transform/cli inspect sobre cada GLB y compara los nombres de nodos reales con los que esperan scene3d y solar-view. Si no coinciden, ajusta el manifest o el cargador (nunca el modelo) y reportalo. Si falta un modelo, usa placeholder y listalo.
5. Evalua una por una las "Solicitudes al contrato" y registra cada decision con su justificacion.
6. Verifica offline real (cero peticiones de red), seguridad contra docs/SEGURIDAD.md (informe por severidad), fps, tamano del paquete y recorrido por teclado.
7. Entrega README, lista honesta de pendientes y un guion de demo de 3 minutos centrado en el reto.
Muestrame requirements, design y tasks y espera mi OK antes de ejecutar.