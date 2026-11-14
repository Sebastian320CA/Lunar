import { describe, expect, it } from 'vitest';
import type { ReportData } from '@lunar/contracts';
import { PDFDocument } from 'pdf-lib';
import { safeExportReport } from './pdf.js';

const base = (rows: number): ReportData => ({
  title: 'Informe <script>x</script> ñ Σ',
  scenarios: [{ id: 'a', label: 'Sitio A' }],
  params: [{ name: 'Potencia', value: 12.5, unit: 'W' }],
  sections: [
    {
      title: 'Datos',
      table: {
        headers: ['t', 'v'],
        rows: Array.from({ length: rows }, (_, i) => [`r${i}`, i]),
      },
    },
  ],
  sources: ['Fuente 1'],
});

describe('safeExportReport', () => {
  it('produces a PDF', async () => {
    const r = await safeExportReport(base(3));
    expect(r.ok).toBe(true);
    if (r.ok) expect(new TextDecoder().decode(r.value.slice(0, 4))).toBe('%PDF');
  });

  it('adds pages with many rows', async () => {
    const small = await safeExportReport(base(3));
    const big = await safeExportReport(base(400));
    if (!small.ok || !big.ok) throw new Error('fail');
    const count = async (b: Uint8Array): Promise<number> => (await PDFDocument.load(b)).getPageCount();
    expect(await count(big.value)).toBeGreaterThan(await count(small.value));
  });

  it('rejects oversized title and sections', async () => {
    expect((await safeExportReport({ ...base(1), title: 'a'.repeat(201) })).ok).toBe(false);
    const sec = base(1).sections[0]!;
    expect((await safeExportReport({ ...base(1), sections: Array(51).fill(sec) })).ok).toBe(false);
  });
});

