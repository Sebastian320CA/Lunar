---
inclusion: always
---
# Estructura y duenos de cada paquete

- contracts, security: base (Kiro fase A)
- ephemeris + tools/ephemeris-data: efemerides
- terrain + tools/terrain-data: horizonte y terreno
- scene3d: escena cinematica
- ui: menu de la Tierra, panel de sitio, sistema de diseno. i18n: idiomas
- sites: catalogo, coordenadas propias, fecha. sky: cielo local y metricas. compare: comparacion
- energy: metodos y fisica. solar-view: panel solar 3D. export: PDF con marca de agua
- edu: trivia y modo clase. edu-games: minijuegos
- apps/web: shell que monta todo. data/: datos precargados. public/assets/: modelos, texturas, audio.
- Cada modulo documenta su API en docs/MODULO-<nombre>.md. Leerlos antes de integrar.