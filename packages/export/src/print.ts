export const PRINT_STYLE_ID = 'lunar-print-style';

/** Hoja de estilos de impresion: oculta controles y deja el reporte a ancho completo. */
export const PRINT_STYLESHEET = `@media print {
  @page { size: A4; margin: 15mm; }
  body { background: #fff !important; color: #000 !important; }
  canvas, nav, button, .no-print, [data-no-print] { display: none !important; }
  .print-report { display: block !important; width: 100% !important; }
  table { page-break-inside: auto; border-collapse: collapse; }
  tr { page-break-inside: avoid; }
  .print-watermark { position: fixed; top: 40%; left: 5%; transform: rotate(-45deg); opacity: 0.15; font-size: 22pt; }
}`;

/** Inserta la hoja de estilos de impresion (una sola vez) y abre el dialogo de impresion. */
export function printReport(doc: Document = document, win: Window = window): void {
  if (!doc.getElementById(PRINT_STYLE_ID)) {
    const view = doc.defaultView;
    let adopted = false;
    // La CSP (style-src 'self') bloquea <style> inline; las hojas construibles estan permitidas.
    if (view && typeof view.CSSStyleSheet === 'function' && 'adoptedStyleSheets' in doc) {
      try {
        const sheet = new view.CSSStyleSheet();
        sheet.replaceSync(PRINT_STYLESHEET);
        doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
        const marker = doc.createElement('meta');
        marker.id = PRINT_STYLE_ID;
        doc.head.appendChild(marker);
        adopted = true;
      } catch {
        adopted = false;
      }
    }
    if (!adopted) {
      const style = doc.createElement('style');
      style.id = PRINT_STYLE_ID;
      style.textContent = PRINT_STYLESHEET;
      doc.head.appendChild(style);
    }
  }
  win.print();
}
