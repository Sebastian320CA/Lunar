import { exportReport } from '@lunar/export';
import type { WebContext, WebModule } from './context';

/** Descarga bytes como archivo mediante una URL Blob temporal. */
export function downloadBlob(data: Uint8Array | string, filename: string, mime: string): void {
  const part = typeof data === 'string' ? data : (data.slice().buffer as ArrayBuffer);
  const blob = new Blob([part], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const exportModule: WebModule = {
  id: 'export',
  setup(ctx: WebContext): void {
    ctx.services.exportReport = exportReport;
  },
};

export default exportModule;
