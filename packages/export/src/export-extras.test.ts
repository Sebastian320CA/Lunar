import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { sanitizeSvg, sanitizePngDataUrl } from './svg.js';
import { toCsv } from './csv.js';
import { PRINT_STYLESHEET } from './print.js';
import { safeExportReport } from './pdf.js';

// PNG 1x1 valido
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('sanitizeSvg', () => {
  it('removes script, event handlers and external references', () => {
    const out = sanitizeSvg(
      '<svg viewBox="0 0 10 10" onload="alert(1)"><script>alert(1)</script><a href="javascript:x"><rect width="5" height="5" onclick="x()" fill="url(http://evil/x)"/></a><image href="http://evil/a.png"/><foreignObject><div>x</div></foreignObject><text x="1">a&lt;b</text></svg>',
    );
    expect(out).toContain('<svg');
    expect(out).toContain('<text x="1">');
    for (const bad of ['script', 'onload', 'onclick', 'javascript', 'evil', 'foreignObject', '<image', 'alert']) {
      expect(out).not.toContain(bad);
    }
  });
  it('rejects non-svg input', () => {
    expect(sanitizeSvg('<div>hi</div>')).toBe('');
    expect(sanitizeSvg(42)).toBe('');
  });
});

describe('sanitizePngDataUrl', () => {
  it('accepts only base64 PNG data URLs', () => {
    expect(sanitizePngDataUrl(PNG)).toBe(PNG);
    expect(sanitizePngDataUrl('data:image/svg+xml;base64,AAAA')).toBe('');
    expect(sanitizePngDataUrl('data:image/png;base64,AAAA')).toBe('');
    expect(sanitizePngDataUrl('http://x/a.png')).toBe('');
  });
});

describe('toCsv', () => {
  it('escapes quotes and neutralizes formula cells', () => {
    const csv = toCsv([
      { headers: ['a', 'b'], rows: [['=1+1', 'say "hi", ok'], ['@x', '\tt'], ['-3', -3], ['+1', 'ok']] },
    ]);
    const lines = csv.split('\r\n');
    expect(lines[1]).toBe(`'=1+1,"say ""hi"", ok"`);
    expect(lines[2]).toBe(`'@x,'\tt`);
    expect(lines[3]).toBe(`'-3,-3`);
    expect(lines[4]).toBe(`'+1,ok`);
  });
});

describe('print and pdf charts', () => {
  it('has a print stylesheet', () => {
    expect(PRINT_STYLESHEET).toContain('@media print');
  });
  it('embeds a PNG chart and ignores an invalid one', async () => {
    const mk = (pngDataUrl: string) => ({
      title: 't',
      scenarios: [],
      params: [],
      sources: [],
      sections: [{ title: 's', pngDataUrl }],
    });
    const ok = await safeExportReport(mk(PNG));
    const bad = await safeExportReport(mk('data:text/html;base64,AAAA'));
    expect(ok.ok && bad.ok).toBe(true);
    if (ok.ok && bad.ok) {
      const d = await PDFDocument.load(ok.value);
      expect(d.getPageCount()).toBe(1);
      expect(ok.value.length).toBeGreaterThan(bad.value.length);
    }
  });
});
