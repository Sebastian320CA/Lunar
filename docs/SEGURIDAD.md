# Seguridad de Lunar Navigator

Aplicación web estática y offline-first. No tiene backend, cuentas ni telemetría. Los datos de efemérides, sitios y texturas se generan en tiempo de build y se sirven como activos locales. Este documento resume el modelo de amenazas, los controles y su estado real.

Aviso: este proyecto es educativo y no está avalado ni respaldado por la NASA. Los nombres y datos de misiones se usan solo como referencia con crédito a sus fuentes públicas.

## Modelo de amenazas STRIDE

| Categoría | Amenaza | Control | Ubicación en el código |
| --- | --- | --- | --- |
| Spoofing | Un activo de efemérides o un Class_Package se hace pasar por uno legítimo. | Hash SHA-256 del binario de efemérides y esquema estricto del paquete. | `packages/ephemeris/src/binary.ts`, `packages/security/src/classPackage.ts` |
| Tampering | Se altera `ephemeris.bin`, un paquete de clase o el SVG/CSV exportado. | Verificación de hash, validación con zod estricto, sanitización de SVG y neutralización de celdas CSV. | `packages/ephemeris/src/binary.ts`, `packages/security/src/classPackage.ts`, `packages/export/src/svg.ts`, `packages/export/src/csv.ts` |
| Repudiation | No se puede reconstruir qué datos y versión produjeron un resultado. | Los informes incluyen fecha UTC, sitio y versión de datos; no hay acciones remotas que auditar. | `packages/export/src/pdf.ts`, `docs/CONTRATO.md` |
| Information Disclosure | Fuga de datos del usuario o de secretos. | Sin backend ni telemetría, sin secretos en el repositorio, CSP con `connect-src` restringido. | `apps/web/vite.config.ts`, `.semgrep/rules.yml` |
| Denial of Service | Paquetes o SVG enormes o anidados agotan memoria o CPU. | Límites de tamaño (1 MiB por paquete, 500 000 caracteres por SVG, 5 MB por PNG) y de profundidad (32). | `packages/security/src/classPackage.ts`, `packages/export/src/svg.ts` |
| Elevation of Privilege | Inyección de script vía entradas, `eval` o `innerHTML` con datos del usuario. | Validadores de entrada, ESLint y Semgrep prohíben `eval` e `innerHTML` con datos externos, CSP sin `unsafe-eval`. | `packages/security/src/sanitize.ts`, `tools/lint/eslint.config.js`, `.semgrep/rules.yml`, `apps/web/vite.config.ts` |

## Lista ASVS adaptada

| ID | Control | Estado | Evidencia o justificación |
| --- | --- | --- | --- |
| V5.1.1 | Validar latitud, longitud, id de sitio y fecha UTC en el borde de confianza. | cumplido | `packages/security/src/lat.ts`, `packages/security/src/lon.ts`, `packages/security/src/siteId.ts`, `packages/security/src/utc.ts` |
| V5.1.3 | Sanitizar nombres y textos libres con límite de longitud. | cumplido | `packages/security/src/sanitize.ts` |
| V5.2.1 | Sanitizar SVG y PNG antes de incrustarlos en la exportación. | cumplido | `packages/export/src/svg.ts` |
| V5.3.3 | Evitar inyección de fórmulas en CSV. | cumplido | `packages/export/src/csv.ts` |
| V5.2.4 | No usar `eval` ni `innerHTML` con datos del usuario. | cumplido | `tools/lint/eslint.config.js`, `.semgrep/rules.yml` |
| V12.1.1 | Limitar tamaño y profundidad de archivos cargados (Class_Package). | cumplido | `packages/security/src/classPackage.ts` |
| V10.3.2 | Verificar la integridad de los datos de efemérides con SHA-256. | cumplido | `packages/ephemeris/src/binary.ts` |
| V14.4.3 | Aplicar una política CSP restrictiva. | cumplido | `apps/web/vite.config.ts` |
| V14.2.1 | Dependencias fijadas y auditadas en integración continua. | cumplido | `.github/workflows/ci.yml` (instalación con `--frozen-lockfile` y `pnpm audit --audit-level high`) |
| V2.1.1 | Autenticación de usuarios. | no aplicable | La aplicación no tiene cuentas ni backend. |
| V3.1.1 | Gestión de sesiones. | no aplicable | No hay sesiones ni cookies; todo el estado vive en el navegador. |
| V9.1.1 | Comunicaciones cifradas con servidores propios. | no aplicable | No hay servidores propios; los datos se sirven como activos estáticos y solo se descargan fuentes externas en el build. |

## CSP

La política se define en `apps/web/vite.config.ts` y se inyecta como etiqueta `meta` en el HTML:

- `default-src 'none'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` y `frame-ancestors 'none'`: sin peticiones a terceros en ejecución.
- `script-src 'self' 'wasm-unsafe-eval'` sin `unsafe-inline` ni `unsafe-eval`. `'wasm-unsafe-eval'` solo permite compilar WebAssembly (no `eval` de JavaScript) y es necesario porque el cargador de `packages/scene3d/src/assets.ts` usa los decodificadores Draco y KTX2 (Basis) de three.js, servidos desde `/assets/decoders/` (mismo origen), y el decodificador meshopt.
- `worker-src 'self' blob:`: los cargadores Draco y KTX2 crean web workers a partir de `blob:` para decodificar fuera del hilo principal.
- `img-src 'self' data: blob:` para texturas y exportaciones PNG.

Los fuentes externos (sitios y texturas acreditados, por ejemplo NASA/LRO y JPL) se consultan solo en tiempo de build. El resultado se guarda en `data/` y se publica con la aplicación, que funciona sin red.

## Class_Package

Los paquetes de clase se cargan con `loadClassPackage` en `packages/security/src/classPackage.ts`:

- Máximo 1 MiB y profundidad de anidación 32.
- Esquema `zod` estricto: se rechazan claves desconocidas.
- Todos los textos pasan por `sanitizeText` y `sanitizeName`; los ids de sitio se comparan con una lista permitida.
- Un paquete inválido devuelve un error tipado y no modifica el estado de la aplicación.

## Verificación de hashes

`packages/ephemeris/src/binary.ts` calcula el SHA-256 del binario con `crypto.subtle` y lo compara con el valor del encabezado (64 caracteres hexadecimales en minúscula). Si no coincide, las efemérides no se cargan y la aplicación muestra un error. Los kernels SPICE usados para generar los datos están en `data/ephemeris/kernels`.

## Herramientas de control

- ESLint: `tools/lint/eslint.config.js`.
- Semgrep: `.semgrep/rules.yml`.
- CI: `.github/workflows/ci.yml`, ver V14.2.1.
