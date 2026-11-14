# Módulo export

Paquete `@lunar/export`: genera informes en PDF, CSV, SVG/PNG y vista de impresión. Todo se ejecuta en el navegador, sin red.

## API

| Archivo | Exporta |
| --- | --- |
| `pdf.ts` | `exportReport(data)`, `safeExportReport(data)` (devuelve `Result`), `MAX_TITLE_CHARS`, `MAX_SECTIONS`, `WATERMARK_TEXT` |
| `svg.ts` | `sanitizeSvg`, `decodePngDataUrl`, `sanitizePngDataUrl`, `svgToPngDataUrl`, `MAX_SVG_CHARS`, `MAX_PNG_BYTES` |
| `csv.ts` | `toCsv(tables)`, `neutralizeCell` (evita inyección de fórmulas) |
| `print.ts` | `printReport(doc, win)`, `PRINT_STYLE_ID`, `PRINT_STYLESHEET` |

## Elección de librería

PDF con una librería JavaScript que corre en el cliente (ver `packages/export/package.json`), sin servicios externos. Los SVG se sanean antes de incrustarse y los PNG se validan por tamaño y formato.

## Fuentes

PENDIENTE: incrustar una fuente con licencia abierta para soportar caracteres fuera de la codificación estándar del PDF. Hasta entonces se usan las fuentes estándar del PDF.

## Registro en la app

`apps/web/src/modules/export.ts` asigna `services.exportReport` y expone `downloadBlob(data, filename, mime)`, que descarga mediante una URL `Blob` temporal que se revoca tras el clic.

Requisitos: 7.1, 7.2, 7.3.
