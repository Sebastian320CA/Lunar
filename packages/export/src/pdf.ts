import { PDFDocument, StandardFonts, degrees, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { ReportData, ReportTable, Result } from '@lunar/contracts';
import { sanitizeText } from '@lunar/security';
import { decodePngDataUrl, svgToPngDataUrl } from './svg.js';

export const MAX_TITLE_CHARS = 200;
export const MAX_SECTIONS = 50;
export const WATERMARK_TEXT =
  'Lunar Landing Site Navigator - Inspirado en NASA Space Apps - No avalado por la NASA';

const MAX_FIELD = 500;
const MAX_LIST = 500;
const MAX_ROWS = 20000;
const MAX_COLS = 30;

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const BOTTOM = 60;

/** Sanea un texto y lo reduce a caracteres codificables en WinAnsi (fuentes estandar). */
function clean(x: unknown, max: number): string {
  const text = typeof x === 'number' ? String(x) : x;
  const r = sanitizeText(text, max);
  const base = r.ok ? r.value : typeof text === 'string' ? text.slice(0, max) : '';
  let out = '';
  for (const ch of base.replace(/[\r\n\t]+/g, ' ')) {
    const c = ch.codePointAt(0) ?? 0;
    out += (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) ? ch : c < 0x20 || c === 0x7f ? '' : '?';
  }
  return out;
}

function validate(data: ReportData): string | null {
  if (typeof data.title !== 'string' || data.title.length === 0) return 'titulo vacio';
  if ([...data.title].length > MAX_TITLE_CHARS) return `titulo excede ${MAX_TITLE_CHARS} caracteres`;
  if (!Array.isArray(data.sections) || data.sections.length > MAX_SECTIONS) {
    return `mas de ${MAX_SECTIONS} secciones`;
  }
  if (
    !Array.isArray(data.scenarios) ||
    !Array.isArray(data.params) ||
    !Array.isArray(data.sources) ||
    data.scenarios.length > MAX_LIST ||
    data.params.length > MAX_LIST ||
    data.sources.length > MAX_LIST
  ) {
    return 'listas no validas o demasiado largas';
  }
  for (const s of data.sections) {
    const t = s.table;
    if (t) {
      if (t.rows.length > MAX_ROWS || t.headers.length > MAX_COLS) return 'tabla demasiado grande';
    }
  }
  return null;
}

class Writer {
  page!: PDFPage;
  y = 0;
  private doc: PDFDocument;
  readonly font: PDFFont;
  readonly bold: PDFFont;
  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.newPage();
  }

  newPage(): void {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    drawWatermark(this.page, this.font);
    this.y = PAGE_H - MARGIN;
  }

  ensure(h: number): void {
    if (this.y - h < BOTTOM) this.newPage();
  }

  /** Corta el texto en lineas que caben en `width`. */
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    let cur = '';
    for (const word of text.split(' ')) {
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width && w.length > 1) {
        let n = w.length - 1;
        while (n > 1 && font.widthOfTextAtSize(w.slice(0, n), size) > width) n -= 1;
        if (cur) lines.push(cur);
        cur = '';
        lines.push(w.slice(0, n));
        w = w.slice(n);
      }
      const trial = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(trial, size) <= width) cur = trial;
      else {
        if (cur) lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }

  text(t: string, size = 10, bold = false, indent = 0): void {
    const f = bold ? this.bold : this.font;
    for (const line of this.wrap(t, f, size, PAGE_W - 2 * MARGIN - indent)) {
      this.ensure(size + 4);
      this.y -= size + 2;
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
    }
    this.y -= 2;
  }

  async image(png: Uint8Array): Promise<void> {
    try {
      const img = await this.doc.embedPng(png);
      const maxW = PAGE_W - 2 * MARGIN;
      const maxH = 300;
      const k = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * k;
      const h = img.height * k;
      this.ensure(h + 8);
      this.page.drawImage(img, { x: MARGIN, y: this.y - h, width: w, height: h });
      this.y -= h + 8;
    } catch {
      this.text('[grafico no disponible]', 8);
    }
  }

  table(t: ReportTable): void {
    const cols = Math.max(1, t.headers.length);
    const colW = (PAGE_W - 2 * MARGIN) / cols;
    const size = 8;
    const rowOf = (cells: string[], bold: boolean): void => {
      const f = bold ? this.bold : this.font;
      const wrapped = cells.map((c) => this.wrap(c, f, size, colW - 6));
      const lines = Math.max(...wrapped.map((w) => w.length));
      const h = lines * (size + 2) + 4;
      if (this.y - h < BOTTOM) {
        this.newPage();
        if (!bold) rowOf(t.headers.map((x) => clean(x, MAX_FIELD)), true);
      }
      wrapped.forEach((w, i) =>
        w.forEach((line, j) =>
          this.page.drawText(line, {
            x: MARGIN + i * colW + 3,
            y: this.y - (j + 1) * (size + 2),
            size,
            font: f,
            color: rgb(0.1, 0.1, 0.1),
          }),
        ),
      );
      this.y -= h;
      this.page.drawLine({
        start: { x: MARGIN, y: this.y },
        end: { x: PAGE_W - MARGIN, y: this.y },
        thickness: 0.3,
        color: rgb(0.7, 0.7, 0.7),
      });
    };
    rowOf(t.headers.map((x) => clean(x, MAX_FIELD)), true);
    for (const row of t.rows) {
      const cells: string[] = [];
      for (let i = 0; i < cols; i += 1) cells.push(clean(row[i] ?? '', MAX_FIELD));
      rowOf(cells, false);
    }
    this.y -= 6;
  }
}

function drawWatermark(page: PDFPage, font: PDFFont): void {
  const size = 22;
  const w = font.widthOfTextAtSize(WATERMARK_TEXT, size);
  const angle = 45;
  const rad = (angle * Math.PI) / 180;
  // centra el texto rotado en la pagina
  const x = PAGE_W / 2 - (w / 2) * Math.cos(rad);
  const y = PAGE_H / 2 - (w / 2) * Math.sin(rad);
  page.drawText(WATERMARK_TEXT, {
    x,
    y,
    size,
    font,
    rotate: degrees(angle),
    color: rgb(0.5, 0.5, 0.5),
    opacity: 0.15,
  });
  drawLogo(page, PAGE_W - MARGIN - 18, PAGE_H - MARGIN + 2, 14);
}

/** Logo propio sencillo: luna creciente vectorial. */
function drawLogo(page: PDFPage, cx: number, cy: number, r: number): void {
  page.drawCircle({ x: cx, y: cy, size: r, color: rgb(0.2, 0.25, 0.4), opacity: 0.35 });
  page.drawCircle({ x: cx + r * 0.45, y: cy + r * 0.2, size: r * 0.8, color: rgb(1, 1, 1) });
}

/** Construye el PDF. Lanza si la entrada excede los limites. */
export async function exportReport(data: ReportData): Promise<Uint8Array> {
  const err = validate(data);
  if (err) throw new Error(err);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const title = clean(data.title, MAX_TITLE_CHARS);
  doc.setTitle(title);
  doc.setProducer('Lunar Landing Site Navigator');
  doc.setCreator('Lunar Landing Site Navigator');

  const w = new Writer(doc, font, bold);
  w.text(title, 16, true);
  w.text('Inspirado en NASA Space Apps - No avalado por la NASA', 8);
  w.y -= 6;

  if (data.scenarios.length) {
    w.text('Escenarios', 12, true);
    for (const s of data.scenarios) w.text(`- ${clean(s.label, MAX_FIELD)} (${clean(s.id, 64)})`, 10, false, 8);
    w.y -= 4;
  }
  if (data.params.length) {
    w.text('Parametros', 12, true);
    for (const p of data.params) {
      const unit = clean(p.unit, 32);
      const val = Number.isFinite(p.value) ? String(p.value) : 'n/d';
      w.text(`- ${clean(p.name, MAX_FIELD)}: ${val}${unit ? ` ${unit}` : ''}`, 10, false, 8);
    }
    w.y -= 4;
  }
  if (data.sources.length) {
    w.text('Fuentes de datos', 12, true);
    for (const s of data.sources) w.text(`- ${clean(s, MAX_FIELD)}`, 9, false, 8);
    w.y -= 4;
  }
  for (const sec of data.sections) {
    w.ensure(40);
    w.text(clean(sec.title, MAX_FIELD), 12, true);
    let png = decodePngDataUrl(sec.pngDataUrl);
    if (!png && sec.svg) {
      const raster = await svgToPngDataUrl(sec.svg);
      png = raster ? decodePngDataUrl(raster) : null;
    }
    if (png) await w.image(png);
    if (sec.table) w.table(sec.table);
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Pagina ${i + 1} de ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W / 2 - font.widthOfTextAtSize(label, 9) / 2,
      y: 30,
      size: 9,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  });

  return doc.save();
}

/** Version que no lanza: devuelve Result. */
export async function safeExportReport(data: ReportData): Promise<Result<Uint8Array>> {
  try {
    return { ok: true, value: await exportReport(data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error al generar el PDF' };
  }
}
