import type { ReportTable } from '@lunar/contracts';

/** Neutraliza inyeccion de formulas: prefija `'` si la celda de texto empieza por = + - @ tab o CR. */
export function neutralizeCell(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const s = String(value ?? '');
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function escapeCell(value: string | number): string {
  const s = neutralizeCell(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Convierte tablas a CSV (CRLF). Varias tablas se separan con una linea en blanco. */
export function toCsv(tables: ReportTable[]): string {
  return tables
    .map((t) => {
      const cols = t.headers.length;
      const lines = [t.headers.map(escapeCell).join(',')];
      for (const row of t.rows) {
        const cells: Array<string | number> = [];
        for (let i = 0; i < cols; i += 1) cells.push(row[i] ?? '');
        lines.push(cells.map(escapeCell).join(','));
      }
      return lines.join('\r\n');
    })
    .join('\r\n\r\n');
}
